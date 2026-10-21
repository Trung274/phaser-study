import Phaser from 'phaser';
import { HEAVY_FONT } from '../ui/textStyle';
import { ATLAS, TILE } from '../config';
import { StateMachine } from '../core/StateMachine';
import { spawnDeathBurst } from '../combat/hitEffects';
import { lerpColor } from '../core/color';
import type { Attacker, HitInfo, Hittable, Strike } from '../combat/types';
import type { HitStop } from '../combat/HitStop';
import type { Sfx } from '../audio/Sfx';
import type { Player } from '../player/Player';

// ============================================================================
// Lính giáo: đi tuần, thấy người chơi thì đuổi, tới gần thì báo trước rồi đâm
// ============================================================================
const MAX_HP = 40;                  // ~ một combo 3 nhát là hạ
const PATROL_SPEED = 1.2 * TILE;
const CHASE_SPEED = 2.6 * TILE;
const ACCEL = 20 * TILE;
const PATROL_RANGE = 3 * TILE;      // đi tuần quanh chỗ xuất hiện ±3 ô
const PATROL_PAUSE = 700;           // ms đứng nghỉ mỗi lần quay đầu
const DETECT_X = 6 * TILE;          // tầm nhìn ngang
const DETECT_Y = 1.5 * TILE;        // tầm nhìn dọc: người chơi ở tầng khác thì không thấy
const LOSE_INTEREST = 2000;         // ms mất dấu thì quay về đi tuần
const ATTACK_RANGE = 1.5 * TILE;    // cách người chơi chừng này thì bắt đầu ra đòn

/**
 * Một kiểu đâm, mô tả bằng dữ liệu (như COMBO của người chơi). Startup (windup) DÀI để người chơi kịp phản ứng.
 *   |------ windup: "!" + ngả người lấy đà ------|-- flash --|-- thrust --|------ recover: đứng hớ ------|
 */
interface ThrustDef {
  windup: number;      // ms lấy đà (gồm cả flash)
  flashBefore: number; // ms cuối của windup: chớp sáng = "NGAY BÂY GIỜ"
  thrust: number;      // ms mũi giáo có hiệu lực
  distance: number;    // lao tới bao xa khi đâm
  recover: number;     // ms đứng hớ sau khi đâm: cửa sổ để người chơi phản công
  damage: number;      // số tim
  power: number;
  hitStop: number;
  unblockable: boolean;
}

const NORMAL_THRUST: ThrustDef = {
  windup: 520, flashBefore: 130, thrust: 140, distance: 1.2 * TILE, recover: 520,
  damage: 1, power: 0.6, hitStop: 90, unblockable: false,
};

/** Đòn đỏ: lấy đà lâu hơn (dễ thấy), lao xa hơn, đau gấp đôi, KHÔNG đỡ được; đổi lại đứng hớ rất lâu. */
const RED_THRUST: ThrustDef = {
  windup: 720, flashBefore: 170, thrust: 230, distance: 3 * TILE, recover: 850,
  damage: 2, power: 0.9, hitStop: 110, unblockable: true,
};
const RED_CHANCE = 0.35;            // mỗi lần ra đòn có 35% là đòn đỏ
const RED = 0xff3b3b;

const ATTACK_COOLDOWN = 600;
const HURT_TIME = 300;              // ms choáng khi trúng đòn (hitstun)
const STAGGER_TIME = 750;           // ms khựng lại khi bị đỡ hoàn hảo: phần thưởng cho người chơi
const BROKEN_TIME = 1300;           // ms ngã quỵ khi bị phản đòn: phần thưởng còn lớn hơn
const STRIKE_HITBOX = { x: 20, y: -100, w: 170, h: 75 }; // vùng mũi giáo khi quay mặt sang PHẢI, tính từ chân

const HITBOX_W = 60;
const HITBOX_H = 112;
const BODY_FEET_ORIGIN_Y = 125 / 128;
// item_spear 128×256, mũi hướng lên; cầm ở y=175 (khoảng 70% thân giáo), mũi ở y=12
const SPEAR_SCALE = 0.8;
const SPEAR_ORIGIN_Y = 175 / 256;
const SPEAR_REACH = (175 - 12) * SPEAR_SCALE;
const HP_BAR_W = 80;

export type EnemyState = 'patrol' | 'chase' | 'windup' | 'attack' | 'recover' | 'hurt' | 'staggered' | 'broken' | 'dead';

type Point = { x: number; y: number };

function moveTowards(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export interface EnemyDeps {
  sfx: Sfx;
  hitStop: HitStop;
  /** Ô tại (x, y) có phải nền đứng được không: dùng làm "cảm biến" mép vực. */
  isGroundAt: (x: number, y: number) => boolean;
}

export class Enemy implements Hittable, Attacker {
  readonly hitbox: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  hp = MAX_HP;
  /** Đã chết và diễn xong hoạt cảnh: GameScene sẽ dọn đi. */
  gone = false;
  /** Các collider GameScene tạo cho kẻ địch này; dọn đi cùng lúc với kẻ địch. */
  colliders: Phaser.Physics.Arcade.Collider[] = [];

  private readonly scene: Phaser.Scene;
  private readonly deps: EnemyDeps;
  private readonly fsm: StateMachine<EnemyState>;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly frontHand: Phaser.GameObjects.Image;
  private readonly backHand: Phaser.GameObjects.Image;
  private readonly spear: Phaser.GameObjects.Image;
  private readonly redAura: Phaser.GameObjects.Image; // hào quang đỏ sau lưng khi chuẩn bị đòn đỏ
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFill: Phaser.GameObjects.Rectangle;
  private warning: Phaser.GameObjects.Text | null = null; // dấu "!" khi báo trước

  private facing: 1 | -1 = -1;
  private readonly spawnX: number;
  private patrolDir: 1 | -1 = -1;
  private pauseTimer = 0;
  private loseTimer = 0;
  private cooldown = 0;
  private flashTimer = 0;
  private flashedBeforeThrust = false;
  private strikeConnected = false;
  private swingId = 0;
  private spearAngle = -70; // độ, hệ "quay mặt sang phải"
  private target: Player | null = null;
  private move: ThrustDef = NORMAL_THRUST; // kiểu đâm đang ra (thường / đỏ)
  private afterimageTimer = 0;

  /** (x, feetY) là vị trí CHÂN. */
  constructor(scene: Phaser.Scene, x: number, feetY: number, deps: EnemyDeps) {
    this.scene = scene;
    this.deps = deps;
    this.spawnX = x;

    this.hitbox = scene.add.rectangle(x, feetY - HITBOX_H / 2, HITBOX_W, HITBOX_H).setVisible(false);
    scene.physics.add.existing(this.hitbox);
    this.body = this.hitbox.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(15 * TILE);

    this.backHand = scene.add.image(-30, -58, ATLAS, 'character_handPurple');
    this.torso = scene.add.image(0, 0, ATLAS, 'character_roundPurple').setOrigin(0.5, BODY_FEET_ORIGIN_Y);
    this.spear = scene.add.image(0, -60, ATLAS, 'item_spear').setOrigin(0.5, SPEAR_ORIGIN_Y).setScale(SPEAR_SCALE);
    this.frontHand = scene.add.image(30, -58, ATLAS, 'character_handPurple');
    this.redAura = scene.add.image(0, -62, ATLAS, 'effect_blastLarge').setTint(RED).setAlpha(0);
    this.visual = scene.add.container(x, feetY, [this.redAura, this.backHand, this.torso, this.spear, this.frontHand]).setDepth(18);

    // Thanh máu nhỏ trên đầu, chỉ hiện sau khi bị đánh lần đầu
    this.hpBarBg = scene.add.rectangle(x, feetY - 150, HP_BAR_W + 6, 12, 0x000000, 0.55).setDepth(40).setVisible(false);
    this.hpBarFill = scene.add.rectangle(x - HP_BAR_W / 2, feetY - 150, HP_BAR_W, 6, 0xf2545b).setOrigin(0, 0.5).setDepth(40).setVisible(false);

    this.fsm = new StateMachine<EnemyState>(
      {
        patrol: { update: (d) => this.updatePatrol(d) },
        chase: { update: (d) => this.updateChase(d) },
        windup: { enter: () => this.enterWindup(), update: () => this.updateWindup(), exit: () => this.clearWarning() },
        attack: { enter: () => this.enterAttack(), update: (d) => this.updateAttack(d) },
        recover: { update: (d) => this.updateRecover(d) },
        hurt: { update: (d) => this.updateHurt(d) },
        staggered: { update: (d) => this.updateStaggered(d) },
        broken: { update: (d) => this.updateBroken(d) },
        dead: { enter: () => this.enterDead() },
      },
      'patrol',
    );

    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.animate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.animate, this));
  }

  get state(): EnemyState {
    return this.fsm.current;
  }

  get isDead() {
    return this.fsm.current === 'dead';
  }

  get hurtbox() {
    return new Phaser.Geom.Rectangle(this.body.x, this.body.y, this.body.width, this.body.height);
  }

  /** Mũi giáo đang có hiệu lực (và chưa trúng ai) thì trả về vùng gây sát thương. */
  activeStrike(): Strike | null {
    if (this.fsm.current !== 'attack' || this.strikeConnected) return null;
    const hb = STRIKE_HITBOX;
    const x = this.facing > 0 ? this.body.center.x + hb.x : this.body.center.x - hb.x - hb.w;
    return {
      rect: new Phaser.Geom.Rectangle(x, this.body.bottom + hb.y, hb.w, hb.h),
      swingId: this.swingId,
      direction: this.facing,
      damage: this.move.damage,
      power: this.move.power,
      hitStop: this.move.hitStop,
      unblockable: this.move.unblockable,
    };
  }

  /** GameScene báo: cú đâm vừa chạm người chơi (trúng hoặc bị đỡ) => tắt hitbox, không chạm lần hai. */
  onStrikeConnected() {
    this.strikeConnected = true;
  }

  /** Bị người chơi đỡ hoàn hảo: giáo bị hất ngược, lảo đảo lùi lại, hở người một lúc. */
  onParried(pushDirection: 1 | -1) {
    if (this.isDead) return;
    this.body.setVelocity(pushDirection * 2.5 * TILE, -1.5 * TILE);
    this.flashTimer = 80;
    this.torso.setTintFill(0xffffff);
    this.fsm.transition('staggered', true);
  }

  /**
   * Bị phản đòn giữa lúc tung đòn đỏ: mất nhiều máu, văng ra, ngã quỵ rất lâu.
   * Trả về true nếu cú phản đòn này kết liễu luôn.
   */
  onCountered(pushDirection: 1 | -1, damage: number) {
    if (this.isDead) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.flashTimer = 120;
    this.torso.setTintFill(0xffffff);
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true).setScale(this.hp / MAX_HP, 1);
    if (this.hp === 0) {
      this.facing = pushDirection > 0 ? -1 : 1;
      this.fsm.transition('dead');
      return true;
    }
    this.body.setVelocity(pushDirection * 4 * TILE, -3 * TILE);
    this.fsm.transition('broken', true);
    return false;
  }

  takeHit(hit: HitInfo) {
    if (this.isDead) return false;

    this.hp = Math.max(0, this.hp - hit.damage);
    this.flashTimer = 80;
    this.torso.setTintFill(0xffffff);
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true).setScale(this.hp / MAX_HP, 1);

    if (this.hp === 0) {
      this.facing = hit.direction > 0 ? -1 : 1; // quay mặt về phía người vừa chém, ngã ngửa ra sau
      this.fsm.transition('dead');
      return true;
    }

    // Giáp cứng (super armor): đang dồn sức đòn đỏ thì vẫn mất máu nhưng KHÔNG bị ngắt.
    // Nếu không có giáp cứng, người chơi chỉ cần chém bừa là phá được mọi đòn đỏ => không ai học né hay phản đòn.
    const superArmor = this.move.unblockable && (this.fsm.current === 'windup' || this.fsm.current === 'attack');
    if (superArmor) return true;

    // Giật lùi + nảy nhẹ; đòn càng nặng càng văng xa. Bị đánh thì bỏ dở đòn đang lấy đà (bị "ngắt")
    const lerp = Phaser.Math.Linear;
    this.body.setVelocity(hit.direction * lerp(2.2, 5, hit.power) * TILE, -lerp(1.5, 3.5, hit.power) * TILE);
    this.loseTimer = LOSE_INTEREST; // bị đánh thì chắc chắn "để ý" người chơi
    this.fsm.transition('hurt', true);
    return true;
  }

  update(delta: number, player: Player) {
    this.target = player;
    this.cooldown -= delta;
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) this.torso.clearTint();
    }
    this.fsm.update(delta);
  }

  /** Dọn sạch: không chỉ hình ảnh mà cả listener và collider, nếu không chúng vẫn chạy ngầm mỗi frame. */
  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.animate, this);
    for (const collider of this.colliders) collider.destroy();
    this.colliders = [];
    this.clearWarning();
    this.visual.destroy();
    this.hitbox.destroy();
    this.hpBarBg.destroy();
    this.hpBarFill.destroy();
  }

  // ===========================================================================
  // Giác quan
  // ===========================================================================

  /** Người chơi còn sống và nằm trong tầm nhìn (hình hộp quanh lính). */
  private canSeePlayer() {
    const p = this.target;
    if (!p || !p.alive) return false;
    const dx = p.body.center.x - this.body.center.x;
    const dy = p.body.bottom - this.body.bottom;
    return Math.abs(dx) <= DETECT_X && Math.abs(dy) <= DETECT_Y;
  }

  /**
   * Phía trước có tường, hoặc là mép vực? Dò bằng một "cảm biến": điểm ngay trước mũi chân, sâu xuống dưới.
   * Không có nền ở đó => đi tiếp sẽ rơi => dừng lại.
   */
  private blockedAhead(dir: 1 | -1) {
    if (dir > 0 ? this.body.blocked.right : this.body.blocked.left) return true;
    if (!this.body.blocked.down) return false;
    const sensorX = this.body.center.x + dir * (HITBOX_W / 2 + 8);
    return !this.deps.isGroundAt(sensorX, this.body.bottom + 8);
  }

  private walk(targetSpeed: number, delta: number) {
    this.body.setVelocityX(moveTowards(this.body.velocity.x, targetSpeed, ACCEL * (delta / 1000)));
  }

  // ===========================================================================
  // Các trạng thái
  // ===========================================================================

  private updatePatrol(delta: number) {
    if (this.canSeePlayer()) {
      this.deps.sfx.spot();
      this.body.setVelocityY(-2.5 * TILE); // nhảy dựng lên vì giật mình
      this.loseTimer = LOSE_INTEREST;
      this.fsm.transition('chase');
      return;
    }
    if (this.pauseTimer > 0) {
      this.pauseTimer -= delta;
      this.walk(0, delta);
      if (this.pauseTimer <= 0) this.patrolDir = this.patrolDir > 0 ? -1 : 1;
      return;
    }
    const tooFar = (this.body.center.x - this.spawnX) * this.patrolDir > PATROL_RANGE;
    if (tooFar || this.blockedAhead(this.patrolDir)) {
      this.pauseTimer = PATROL_PAUSE;
      return;
    }
    this.facing = this.patrolDir;
    this.walk(this.patrolDir * PATROL_SPEED, delta);
  }

  private updateChase(delta: number) {
    const p = this.target;
    if (!p || !p.alive) {
      this.fsm.transition('patrol');
      return;
    }
    if (this.canSeePlayer()) this.loseTimer = LOSE_INTEREST;
    else {
      this.loseTimer -= delta;
      if (this.loseTimer <= 0) {
        this.fsm.transition('patrol');
        return;
      }
    }

    const dx = p.body.center.x - this.body.center.x;
    const dy = p.body.bottom - this.body.bottom;
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    if (Math.abs(dx) > 4) this.facing = dir;

    if (Math.abs(dx) <= ATTACK_RANGE && Math.abs(dy) < TILE && this.cooldown <= 0 && this.body.blocked.down) {
      // Chọn kiểu đâm ngay lúc bắt đầu lấy đà: người chơi phải NHÌN để biết là đòn nào
      this.move = Math.random() < RED_CHANCE ? RED_THRUST : NORMAL_THRUST;
      this.fsm.transition('windup');
      return;
    }
    // Tới đủ gần thì đứng chờ hồi chiêu; không đuổi theo xuống vực
    const wantMove = Math.abs(dx) > ATTACK_RANGE * 0.8 && !this.blockedAhead(dir);
    this.walk(wantMove ? dir * CHASE_SPEED : 0, delta);
  }

  private enterWindup() {
    const p = this.target;
    if (p) this.facing = p.body.center.x > this.body.center.x ? 1 : -1; // khoá hướng lúc bắt đầu lấy đà
    this.flashedBeforeThrust = false;
    const red = this.move.unblockable;
    if (red) this.deps.sfx.redWarning();
    else this.deps.sfx.telegraph();

    // Báo trước bước 1: dấu "!" bật lên trên đầu. Đòn đỏ: "!!" to hơn, chữ đỏ rực
    this.warning = this.scene.add
      .text(this.body.center.x, this.body.y - 50, red ? '!!' : '!', {
        fontFamily: HEAVY_FONT,
        fontSize: red ? '92px' : '72px',
        color: red ? '#ff2d2d' : '#f2545b',
        stroke: '#2b2b2b',
        strokeThickness: 8,
      })
      .setOrigin(0.5, 1)
      .setDepth(45)
      .setScale(0);
    this.scene.tweens.add({ targets: this.warning, scale: 1, duration: 180, ease: 'Back.Out' });
  }

  private updateWindup() {
    this.body.setVelocityX(0);
    const { windup, flashBefore, unblockable } = this.move;
    const t = this.fsm.timeInState;
    // Báo trước bước 2: chớp sáng ngay trước khi đâm => người chơi biết chính xác lúc nào phải phản ứng.
    // Đòn thường chớp TRẮNG (đỡ được), đòn đỏ chớp ĐỎ (phải né hoặc phản đòn)
    if (!this.flashedBeforeThrust && t >= windup - flashBefore) {
      this.flashedBeforeThrust = true;
      this.torso.setTintFill(unblockable ? RED : 0xffffff);
      this.flashTimer = flashBefore;
      this.spawnSpearGlint();
    }
    if (t >= windup) this.fsm.transition('attack');
  }

  private enterAttack() {
    this.swingId++;
    this.strikeConnected = false;
    this.afterimageTimer = 0;
    this.deps.sfx.swing(this.move.unblockable ? 0.9 : 0.5);
    // Lao tới, trừ khi phía trước là vực
    const speed = this.move.distance / (this.move.thrust / 1000);
    this.body.setVelocityX(this.blockedAhead(this.facing) ? 0 : this.facing * speed);
  }

  private updateAttack(delta: number) {
    if (this.blockedAhead(this.facing)) this.body.setVelocityX(0);
    // Đòn đỏ lao rất nhanh: để lại bóng mờ đỏ cho mắt kịp thấy quỹ đạo
    if (this.move.unblockable) {
      this.afterimageTimer -= delta;
      if (this.afterimageTimer <= 0) {
        this.spawnRedAfterimage();
        this.afterimageTimer += 30;
      }
    }
    if (this.fsm.timeInState >= this.move.thrust) this.fsm.transition('recover');
  }

  private updateRecover(delta: number) {
    this.walk(0, delta);
    if (this.fsm.timeInState >= this.move.recover) {
      this.cooldown = ATTACK_COOLDOWN;
      this.fsm.transition('chase');
    }
  }

  private updateHurt(delta: number) {
    if (this.body.blocked.down) this.walk(0, delta);
    if (this.fsm.timeInState >= HURT_TIME && this.body.blocked.down) {
      this.cooldown = Math.max(this.cooldown, 250); // vừa tỉnh lại không đâm ngay
      this.fsm.transition('chase');
    }
  }

  private updateStaggered(delta: number) {
    if (this.body.blocked.down) this.walk(0, delta);
    if (this.fsm.timeInState >= STAGGER_TIME && this.body.blocked.down) {
      this.cooldown = Math.max(this.cooldown, 400);
      this.fsm.transition('chase');
    }
  }

  private updateBroken(delta: number) {
    if (this.body.blocked.down) this.walk(0, delta);
    if (this.fsm.timeInState >= BROKEN_TIME && this.body.blocked.down) {
      this.cooldown = Math.max(this.cooldown, 500);
      this.fsm.transition('chase');
    }
  }

  private enterDead() {
    this.clearWarning();
    this.body.setVelocity(0, 0);
    this.body.enable = false; // tắt vật lý: không va chạm, không rơi nữa
    this.torso.setTintFill(0xffffff);
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.deps.sfx.kill();
    spawnDeathBurst(this.scene, this.body.center.x, this.body.center.y);

    // Văng lên, xoay tròn, mờ dần rồi biến mất
    this.scene.tweens.add({
      targets: this.visual,
      y: this.visual.y - 90,
      angle: -this.facing * 220,
      alpha: 0,
      duration: 650,
      ease: 'Quad.Out',
      onComplete: () => {
        this.gone = true;
      },
    });
  }

  // ===========================================================================
  // Hiệu ứng + procedural animation
  // ===========================================================================

  private clearWarning() {
    this.warning?.destroy();
    this.warning = null;
  }

  private spawnSpearGlint() {
    const tipX = this.body.center.x + this.facing * (8 + SPEAR_REACH);
    const glint = this.scene.add.image(tipX, this.body.bottom - 66, ATLAS, 'effect_blast').setScale(0.5).setDepth(46);
    if (this.move.unblockable) glint.setTint(RED);
    this.scene.tweens.add({ targets: glint, scale: 0.15, angle: 90, alpha: 0, duration: this.move.flashBefore + 60, onComplete: () => glint.destroy() });
  }

  private spawnRedAfterimage() {
    const ghost = this.scene.add
      .image(this.body.center.x, this.body.bottom, ATLAS, 'character_roundPurple')
      .setOrigin(0.5, BODY_FEET_ORIGIN_Y)
      .setAngle(this.visual.angle)
      .setTintFill(RED)
      .setAlpha(0.45)
      .setDepth(17);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 240, onComplete: () => ghost.destroy() });
  }

  private toLocalRad(deg: number) {
    return Phaser.Math.DegToRad(this.facing > 0 ? deg : 180 - deg);
  }

  private animate() {
    if (this.deps.hitStop.active || this.isDead) return; // đứng hình / đang diễn cảnh chết: không đụng vào

    const dt = this.scene.game.loop.delta / 1000;
    const t = this.scene.time.now / 1000;
    const state = this.fsm.current;
    const f = this.facing;
    const vx = this.body.velocity.x;

    this.visual.setPosition(this.hitbox.x, this.hitbox.y + HITBOX_H / 2);
    this.hpBarBg.setPosition(this.visual.x, this.visual.y - 150);
    this.hpBarFill.setPosition(this.visual.x - HP_BAR_W / 2, this.visual.y - 150);
    this.warning?.setPosition(this.visual.x, this.visual.y - 140);

    // Dáng người: ngả ra sau khi lấy đà (anticipation), chúi tới khi đâm, bật ngửa khi trúng đòn
    const windupT = Phaser.Math.Clamp(this.fsm.timeInState / this.move.windup, 0, 1);
    const red = this.move.unblockable && (state === 'windup' || state === 'attack');
    let lean: number;
    switch (state) {
      case 'windup': lean = -f * (red ? 16 : 10) * windupT; break; // đòn đỏ ngả sâu hơn: "dồn sức"
      case 'attack': lean = f * (red ? 18 : 12); break;
      case 'hurt': lean = -f * 14; break;
      case 'staggered': lean = -f * 16 + Math.sin(t * 18) * 5; break; // lảo đảo
      case 'broken': lean = -f * 28 + Math.sin(t * 9) * 4; break;     // ngã quỵ ra sau, chao đảo chậm
      default: lean = (vx / CHASE_SPEED) * 5;
    }

    // Đòn đỏ: hào quang đỏ sau lưng phình dần + thân ửng đỏ theo nhịp, nhịp nhanh dần khi sắp đâm
    if (red) {
      const pulse = Math.abs(Math.sin(t * Phaser.Math.Linear(6, 18, windupT)));
      this.redAura.setAlpha(0.25 + 0.35 * pulse).setScale(Phaser.Math.Linear(0.8, 1.4, windupT) + 0.1 * pulse);
      if (state === 'windup' && !this.flashedBeforeThrust) this.torso.setTint(lerpColor(0xffffff, 0xff7070, pulse));
    } else if (this.redAura.alpha > 0) {
      this.redAura.setAlpha(Math.max(0, this.redAura.alpha - dt * 4)); // tắt dần, không vụt mất
    }
    const k = 1 - Math.exp(-dt * (state === 'attack' ? 60 : 22));
    this.visual.angle += (lean - this.visual.angle) * k;

    // Thân nhún theo bước chân; khi sắp đâm thì run run
    const moving = Math.abs(vx) > 20 && this.body.blocked.down;
    const bob = moving ? -Math.abs(Math.sin(t * 12)) * 6 : 0;
    const shake = state === 'windup' && windupT > 0.6 ? Phaser.Math.FloatBetween(-2, 2) : 0;
    this.torso.setPosition(shake, bob);

    // Tay cầm giáo + góc giáo theo trạng thái (hệ "quay mặt sang phải", sau đó soi gương nếu quay trái)
    let hand: Point;
    let angle: number;
    switch (state) {
      case 'patrol': hand = { x: 30, y: -58 }; angle = -70; break; // vác giáo dựng đứng
      case 'chase': hand = { x: 34, y: -62 }; angle = -15; break;  // chĩa giáo về trước
      case 'windup': hand = { x: Phaser.Math.Linear(34, 2, windupT), y: -66 }; angle = -8; break; // rút giáo lấy đà
      case 'attack': hand = { x: 62, y: -62 }; angle = 0; break;
      case 'recover': hand = { x: 42, y: -58 }; angle = 12; break; // giáo trĩu xuống: đang hớ
      case 'staggered': hand = { x: 6, y: -100 }; angle = -120; break; // giáo bị hất ngược lên trời
      case 'broken': hand = { x: 30, y: -30 }; angle = 80; break;       // tay buông thõng, giáo chúc xuống đất
      default: hand = { x: 18, y: -82 }; angle = -45; // hurt
    }
    this.spearAngle += (angle - this.spearAngle) * k;
    const handX = this.frontHand.x + (hand.x * f - this.frontHand.x) * k;
    const handY = this.frontHand.y + (hand.y - this.frontHand.y) * k;
    this.frontHand.setPosition(handX, handY);
    this.backHand.setPosition(this.backHand.x + (-30 * f - this.backHand.x) * k, -58);
    this.spear.setPosition(handX, handY).setRotation(this.toLocalRad(this.spearAngle) + Math.PI / 2).setFlipX(f < 0);
  }
}
