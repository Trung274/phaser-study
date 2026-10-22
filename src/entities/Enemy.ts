import Phaser from 'phaser';
import { TILE } from '../config';
import { StateMachine } from '../core/StateMachine';
import { spawnDeathBurst } from '../combat/hitEffects';
import { fxStyle } from '../combat/fxStyle';
import type { Attacker, HitInfo, Hittable, Strike } from '../combat/types';
import type { HitStop } from '../combat/HitStop';
import type { Sfx } from '../audio/Sfx';
import type { Player } from '../player/Player';
import { DANGER_RED, type EnemyLook, type EnemyView } from '../looks/EnemyLook';
import type { EnemyStats, ThrustDef } from './enemyStats';

// ============================================================================
// Kẻ địch thường: đi tuần, thấy người chơi thì đuổi, tới gần thì báo trước rồi đánh.
// Cùng một AI cho mọi loại; máu, tốc độ, các đòn lấy từ bảng EnemyStats (enemyStats.ts),
// phần nhìn lấy từ bộ da (lính giáo, orc, quỷ, huyết quái...).
// Các thông số dưới đây dùng chung cho mọi loại.
// ============================================================================
const ACCEL = 20 * TILE;
const PATROL_RANGE = 3 * TILE;      // đi tuần quanh chỗ xuất hiện ±3 ô
const PATROL_PAUSE = 700;           // ms đứng nghỉ mỗi lần quay đầu
const DETECT_X = 6 * TILE;          // tầm nhìn ngang
const DETECT_Y = 1.5 * TILE;        // tầm nhìn dọc: người chơi ở tầng khác thì không thấy
const LOSE_INTEREST = 2000;         // ms mất dấu thì quay về đi tuần

const ATTACK_COOLDOWN = 600;
const HURT_TIME = 300;              // ms choáng khi trúng đòn (hitstun)
const STAGGER_TIME = 750;           // ms khựng lại khi bị đỡ hoàn hảo: phần thưởng cho người chơi
const BROKEN_TIME = 1300;           // ms ngã quỵ khi bị phản đòn: phần thưởng còn lớn hơn
const HP_BAR_W = 80;

export type EnemyState = 'patrol' | 'chase' | 'windup' | 'attack' | 'recover' | 'hurt' | 'staggered' | 'broken' | 'dead';

function moveTowards(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export interface EnemyDeps {
  sfx: Sfx;
  hitStop: HitStop;
  /** Ô tại (x, y) có phải nền đứng được không: dùng làm "cảm biến" mép vực. */
  isGroundAt: (x: number, y: number) => boolean;
  /** Chỉ số của loại kẻ địch này (luật chơi). */
  stats: EnemyStats;
  /** Bộ da: phần nhìn thấy của kẻ địch. */
  look: EnemyLook;
}

export class Enemy implements Hittable, Attacker {
  readonly hitbox: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  hp: number;
  /** Đã chết và diễn xong hoạt cảnh: GameScene sẽ dọn đi. */
  gone = false;
  /** Các collider GameScene tạo cho kẻ địch này; dọn đi cùng lúc với kẻ địch. */
  colliders: Phaser.Physics.Arcade.Collider[] = [];

  private readonly scene: Phaser.Scene;
  private readonly deps: EnemyDeps;
  private readonly stats: EnemyStats;
  private readonly look: EnemyLook;
  private readonly fsm: StateMachine<EnemyState>;
  private readonly hpBarBg: Phaser.GameObjects.Rectangle;
  private readonly hpBarFill: Phaser.GameObjects.Rectangle;
  private warning: Phaser.GameObjects.Text | null = null; // dấu "!" khi báo trước

  private facing: 1 | -1 = -1;
  private readonly spawnX: number;
  private patrolDir: 1 | -1 = -1;
  private pauseTimer = 0;
  private loseTimer = 0;
  private cooldown = 0;
  private flashedBeforeThrust = false;
  private strikeConnected = false;
  private swingId = 0;
  private target: Player | null = null;
  private move: ThrustDef; // kiểu đánh đang ra (thường / đỏ)
  private afterimageTimer = 0;

  /** (x, feetY) là vị trí CHÂN. */
  constructor(scene: Phaser.Scene, x: number, feetY: number, deps: EnemyDeps) {
    this.scene = scene;
    this.deps = deps;
    this.stats = deps.stats;
    this.look = deps.look;
    this.spawnX = x;
    this.hp = this.stats.maxHp;
    this.move = this.stats.normal;

    const { w, h } = this.stats.body;
    this.hitbox = scene.add.rectangle(x, feetY - h / 2, w, h).setVisible(false);
    scene.physics.add.existing(this.hitbox);
    this.body = this.hitbox.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(15 * TILE);

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

    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.sync, this));
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

  /** Vũ khí đang có hiệu lực (và chưa trúng ai) thì trả về vùng gây sát thương. */
  activeStrike(): Strike | null {
    if (this.fsm.current !== 'attack' || this.strikeConnected) return null;
    const hb = this.move.hitbox;
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

  /** GameScene báo: cú đánh vừa chạm người chơi (trúng hoặc bị đỡ) => tắt hitbox, không chạm lần hai. */
  onStrikeConnected() {
    this.strikeConnected = true;
  }

  /** Bị người chơi đỡ hoàn hảo: vũ khí bị hất ngược, lảo đảo lùi lại, hở người một lúc. */
  onParried(pushDirection: 1 | -1) {
    if (this.isDead) return;
    const k = this.stats.knockback;
    this.body.setVelocity(pushDirection * 2.5 * TILE * k, -1.5 * TILE * k);
    this.look.flash(0xffffff, 80);
    this.fsm.transition('staggered', true);
  }

  /**
   * Bị phản đòn giữa lúc tung đòn đỏ: mất nhiều máu, văng ra, ngã quỵ rất lâu.
   * Trả về true nếu cú phản đòn này kết liễu luôn.
   */
  onCountered(pushDirection: 1 | -1, damage: number) {
    if (this.isDead) return false;
    this.hp = Math.max(0, this.hp - damage);
    this.look.flash(0xffffff, 120);
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true).setScale(this.hp / this.stats.maxHp, 1);
    if (this.hp === 0) {
      this.facing = pushDirection > 0 ? -1 : 1;
      this.fsm.transition('dead');
      return true;
    }
    const k = this.stats.knockback;
    this.body.setVelocity(pushDirection * 4 * TILE * k, -3 * TILE * k);
    this.fsm.transition('broken', true);
    return false;
  }

  takeHit(hit: HitInfo) {
    if (this.isDead) return false;

    this.hp = Math.max(0, this.hp - hit.damage);
    this.look.flash(0xffffff, 80);
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true).setScale(this.hp / this.stats.maxHp, 1);

    if (this.hp === 0) {
      this.facing = hit.direction > 0 ? -1 : 1; // quay mặt về phía người vừa chém, ngã ngửa ra sau
      this.fsm.transition('dead');
      return true;
    }

    // Giáp cứng (super armor): đang dồn sức đòn đỏ thì vẫn mất máu nhưng KHÔNG bị ngắt.
    // Nếu không có giáp cứng, người chơi chỉ cần chém bừa là phá được mọi đòn đỏ => không ai học né hay phản đòn.
    const superArmor = this.move.unblockable && (this.fsm.current === 'windup' || this.fsm.current === 'attack');
    if (superArmor) return true;

    // Giật lùi + nảy nhẹ; đòn càng nặng càng văng xa, con càng nặng càng ít văng. Bị đánh thì bỏ dở đòn đang lấy đà (bị "ngắt")
    const lerp = Phaser.Math.Linear;
    const k = this.stats.knockback;
    this.body.setVelocity(hit.direction * lerp(2.2, 5, hit.power) * TILE * k, -lerp(1.5, 3.5, hit.power) * TILE * k);
    this.loseTimer = LOSE_INTEREST; // bị đánh thì chắc chắn "để ý" người chơi
    this.fsm.transition('hurt', true);
    return true;
  }

  update(delta: number, player: Player) {
    this.target = player;
    this.cooldown -= delta;
    this.fsm.update(delta);
  }

  /** Dọn sạch: không chỉ hình ảnh mà cả listener và collider, nếu không chúng vẫn chạy ngầm mỗi frame. */
  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    for (const collider of this.colliders) collider.destroy();
    this.colliders = [];
    this.clearWarning();
    this.look.destroy();
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
    const sensorX = this.body.center.x + dir * (this.stats.body.w / 2 + 8);
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
    this.walk(this.patrolDir * this.stats.patrolSpeed, delta);
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

    const { attackRange, chaseSpeed } = this.stats;
    if (Math.abs(dx) <= attackRange && Math.abs(dy) < TILE && this.cooldown <= 0 && this.body.blocked.down) {
      // Chọn kiểu đánh ngay lúc bắt đầu lấy đà: người chơi phải NHÌN để biết là đòn nào
      this.move = Math.random() < this.stats.redChance ? this.stats.red : this.stats.normal;
      this.fsm.transition('windup');
      return;
    }
    // Tới đủ gần thì đứng chờ hồi chiêu; không đuổi theo xuống vực
    const wantMove = Math.abs(dx) > attackRange * 0.8 && !this.blockedAhead(dir);
    this.walk(wantMove ? dir * chaseSpeed : 0, delta);
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
        fontFamily: fxStyle(this.scene).font,
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
    // Báo trước bước 2: chớp sáng ngay trước khi đánh => người chơi biết chính xác lúc nào phải phản ứng.
    // Đòn thường chớp TRẮNG (đỡ được), đòn đỏ chớp ĐỎ (phải né hoặc phản đòn)
    if (!this.flashedBeforeThrust && t >= windup - flashBefore) {
      this.flashedBeforeThrust = true;
      this.look.flash(unblockable ? DANGER_RED : 0xffffff, flashBefore);
      this.spawnWeaponGlint();
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
        this.look.afterimage(DANGER_RED);
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
      this.cooldown = Math.max(this.cooldown, 250); // vừa tỉnh lại không đánh ngay
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
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    this.deps.sfx.kill();
    spawnDeathBurst(this.scene, this.body.center.x, this.body.center.y);
    this.look.die(this.facing, () => {
      this.gone = true;
    });
  }

  // ===========================================================================
  // Hiệu ứng + gửi trạng thái cho bộ da
  // ===========================================================================

  private clearWarning() {
    this.warning?.destroy();
    this.warning = null;
  }

  /** Vũ khí loé sáng ngay trước cú đánh. Chỗ loé do bộ da cho biết (mũi giáo, lưỡi rìu...). */
  private spawnWeaponGlint() {
    const tip = this.look.weaponTip(this.move.unblockable);
    const glint = this.scene.add
      .image(this.body.center.x + this.facing * tip.x, this.body.bottom + tip.y, fxStyle(this.scene).texture, 'effect_blast')
      .setScale(0.5)
      .setDepth(46);
    if (this.move.unblockable) glint.setTint(DANGER_RED);
    this.scene.tweens.add({ targets: glint, scale: 0.15, angle: 90, alpha: 0, duration: this.move.flashBefore + 60, onComplete: () => glint.destroy() });
  }

  /** POST_UPDATE (sau physics): thanh máu, dấu "!" bám theo thân; bộ da vẽ theo trạng thái mới nhất. */
  private sync() {
    const frozen = this.deps.hitStop.active;
    const x = this.hitbox.x;
    const feetY = this.hitbox.y + this.stats.body.h / 2;
    if (!frozen && !this.isDead) {
      this.hpBarBg.setPosition(x, feetY - 150);
      this.hpBarFill.setPosition(x - HP_BAR_W / 2, feetY - 150);
      this.warning?.setPosition(x, feetY - 140);
    }
    this.look.update(this.view(x, feetY), frozen);
  }

  private view(x: number, feetY: number): EnemyView {
    return {
      x,
      feetY,
      state: this.fsm.current,
      timeInState: this.fsm.timeInState,
      facing: this.facing,
      vx: this.body.velocity.x,
      runRatio: this.body.velocity.x / this.stats.chaseSpeed,
      onGround: this.body.blocked.down,
      move: this.move,
      flashedBeforeThrust: this.flashedBeforeThrust,
    };
  }
}
