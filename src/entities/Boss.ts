import Phaser from 'phaser';
import { HEAVY_FONT } from '../ui/textStyle';
import { ATLAS, GRAVITY, TILE } from '../config';
import { StateMachine } from '../core/StateMachine';
import { lerpColor } from '../core/color';
import { drawSlash, spawnCallout, spawnDeathBurst } from '../combat/hitEffects';
import type { Attacker, HitInfo, Hittable, Strike } from '../combat/types';
import type { HitStop } from '../combat/HitStop';
import type { Sfx } from '../audio/Sfx';
import type { Player } from '../player/Player';

export const BOSS_NAME = 'HẮC TƯỚNG';
export const BOSS_MAX_HP = 260;
export const BOSS_MAX_POISE = 100;

// ============================================================================
// Chỉ số
// ============================================================================
const WALK_SPEED = 2 * TILE;
const ACCEL = 14 * TILE;
const PHASE2_TIME_SCALE = 0.8;  // pha 2: mọi thời gian lấy đà / thu đòn / nghỉ × 0.8 => nhanh hơn 20%
const REST_BETWEEN_COMBOS = 800; // ms nghỉ giữa hai chuỗi đòn: lúc người chơi được tấn công
const COUNTERED_TIME = 900;     // ms khựng lại khi bị phản đòn
const STUN_TIME = 2500;         // ms kiệt sức khi thanh choáng đầy
const STUN_DAMAGE_MULT = 1.5;   // kiệt sức thì nhận thêm 50% sát thương
const PHASE_SHIFT_TIME = 1600;  // ms gầm chuyển pha (miễn nhiễm)
const INTRO_TIME = 1300;

// Thanh choáng: chỉ đầy lên nhờ PHÒNG THỦ GIỎI (đỡ hoàn hảo, phản đòn) và bùa; ngồi thủ suông thì tụt dần
const POISE_ON_PARRY = 22;
const POISE_ON_COUNTER = 40;
const POISE_DECAY_DELAY = 3000; // ms không được cộng thì bắt đầu tụt
const POISE_DECAY_RATE = 15;    // điểm/giây

// ============================================================================
// Hình ảnh (đo bằng ảnh giả lập): thân vuông tím ×1.6, mũ trụ, đại kiếm ×1.7
// ============================================================================
const BODY_SCALE = 1.6;
const BODY_FEET_ORIGIN_Y = 126 / 128;
const HELMET_Y = -168;
const HELMET_SCALE = 1.5;
const HAND_SCALE = 1.4;
const SWORD_SCALE = 1.7;
const SWORD_ORIGIN_Y = 104 / 129;
const SHOULDER = { x: 14, y: -118 };
const HAND_RADIUS = 62;
const SLASH_RADIUS = HAND_RADIUS + 100 * SWORD_SCALE + 10;
const HITBOX_W = 120;
const HITBOX_H = 196;
const RED = 0xff3b3b;
const INK = 0x2b2b2b;

// ============================================================================
// Đòn đánh: dữ liệu. Combo = danh sách tên đòn.
// Góc kiếm hệ "quay mặt sang phải": 0 = trước, -90 = lên trời, 90 = xuống đất (>~30° thì chạm đất).
// ============================================================================
interface BossMove {
  name: string;
  windup: number;      // ms lấy đà (đã gồm flashBefore). Pha 2 nhân PHASE2_TIME_SCALE
  flashBefore: number; // ms cuối của windup: chớp sáng "NGAY BÂY GIỜ" (không bị rút ngắn ở pha 2: tín hiệu phải luôn đọc được)
  active: number;
  recovery: number;    // pha 2 nhân PHASE2_TIME_SCALE
  damage: number;
  power: number;
  hitStop: number;
  unblockable: boolean;
  hitbox: { x: number; y: number; w: number; h: number }; // tính từ chân, quay mặt sang PHẢI
  lunge: number;       // lao tới bao xa trong pha active (px)
  range: number;       // cách người chơi chừng này thì mở đòn
  swingFrom: number;
  swingTo: number;
  thrust?: boolean;    // đòn đâm: tay rút về rồi duỗi thẳng, không vung cung
  leap?: boolean;      // nhảy tới chỗ người chơi, đáp xuống mới có hiệu lực
}

const MOVES = {
  slash: {
    name: 'chém', windup: 480, flashBefore: 120, active: 130, recovery: 260,
    damage: 1, power: 0.7, hitStop: 90, unblockable: false,
    hitbox: { x: 0, y: -280, w: 260, h: 280 }, lunge: 1.2 * TILE, range: 2.4 * TILE, swingFrom: -130, swingTo: 30,
  },
  backslash: {
    name: 'chém ngược', windup: 300, flashBefore: 110, active: 130, recovery: 300,
    damage: 1, power: 0.7, hitStop: 90, unblockable: false,
    hitbox: { x: 0, y: -290, w: 260, h: 290 }, lunge: 1 * TILE, range: 2.4 * TILE, swingFrom: 30, swingTo: -120,
  },
  slam: {
    name: 'bổ', windup: 650, flashBefore: 140, active: 140, recovery: 450,
    damage: 1, power: 1, hitStop: 120, unblockable: false,
    hitbox: { x: -10, y: -300, w: 270, h: 300 }, lunge: 0.6 * TILE, range: 2 * TILE, swingFrom: -170, swingTo: 30,
  },
  redThrust: {
    name: 'đâm đỏ', windup: 700, flashBefore: 170, active: 240, recovery: 700,
    damage: 2, power: 0.9, hitStop: 110, unblockable: true,
    hitbox: { x: 40, y: -150, w: 240, h: 90 }, lunge: 4 * TILE, range: 4.5 * TILE, swingFrom: 0, swingTo: 0, thrust: true,
  },
  leap: {
    name: 'nhảy bổ', windup: 650, flashBefore: 170, active: 160, recovery: 650,
    damage: 2, power: 1, hitStop: 130, unblockable: true,
    hitbox: { x: -240, y: -150, w: 480, h: 150 }, lunge: 0, range: 9 * TILE, swingFrom: -170, swingTo: 30, leap: true,
  },
} satisfies Record<string, BossMove>;

type MoveName = keyof typeof MOVES;

/** Pha 1: học từng đòn. Có một combo trộn trắng → đỏ để tập đọc màu GIỮA chuỗi. */
const PHASE1_COMBOS: MoveName[][] = [['slash', 'backslash'], ['slash', 'redThrust'], ['redThrust'], ['slam']];
/** Pha 2: chuỗi dài hơn, nhanh hơn, thêm nhảy bổ. */
const PHASE2_COMBOS: MoveName[][] = [
  ['slash', 'backslash', 'slash'],
  ['backslash', 'slash', 'redThrust'],
  ['slam', 'redThrust'],
  ['leap'],
  ['slash', 'backslash'],
];

export type BossState = 'dormant' | 'intro' | 'approach' | 'attack' | 'countered' | 'stunned' | 'phaseShift' | 'dead';

type Point = { x: number; y: number };

function moveTowards(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Phaser.Math.Clamp(t, 0, 1), 3);

export class Boss implements Hittable, Attacker {
  readonly hitbox: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  hp = BOSS_MAX_HP;
  poise = 0;
  phase: 1 | 2 = 1;
  /** Đã chết và diễn xong cảnh chết. */
  gone = false;
  /** Sát thương thực nhận ở lần trúng đòn gần nhất (kiệt sức thì ×1.5) để hiện đúng số. */
  lastDamageTaken = 0;

  private readonly scene: Phaser.Scene;
  private readonly sfx: Sfx;
  private readonly hitStop: HitStop;
  private readonly fsm: StateMachine<BossState>;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly frontHand: Phaser.GameObjects.Image;
  private readonly backHand: Phaser.GameObjects.Image;
  private readonly sword: Phaser.GameObjects.Image;
  private readonly redAura: Phaser.GameObjects.Image;

  private target: Player | null = null;
  private facing: 1 | -1 = -1;
  private clock = 0;             // giờ "trong game" của boss (không chạy khi đứng hình)
  private lastPoiseGain = 0;
  private pendingPhase2 = false;
  private flashTimer = 0;
  private restTimer = 0;
  private nextCombo: MoveName[] | null = null;
  private lastComboKey = '';
  private combo: MoveName[] = [];
  private step = 0;
  private move: BossMove = MOVES.slash;
  private swingId = 0;
  private connected = false;
  private flashed = false;
  private swingDrawn = false;
  private swordAngle = -55;
  private swingStartAngle = -55;
  // Nhảy bổ
  private airborne = false;
  private launched = false;
  private activeStart = 0;       // ms trong trạng thái attack mà pha active bắt đầu (nhảy bổ: lúc đáp đất)
  private leapTargetX = 0;
  private landingMarker: Phaser.GameObjects.Graphics | null = null;
  private warning: Phaser.GameObjects.Text | null = null;
  private inkTimer = 0;

  constructor(scene: Phaser.Scene, x: number, feetY: number, deps: { sfx: Sfx; hitStop: HitStop }) {
    this.scene = scene;
    this.sfx = deps.sfx;
    this.hitStop = deps.hitStop;

    this.hitbox = scene.add.rectangle(x, feetY - HITBOX_H / 2, HITBOX_W, HITBOX_H).setVisible(false);
    scene.physics.add.existing(this.hitbox);
    this.body = this.hitbox.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);

    this.redAura = scene.add.image(0, -100, ATLAS, 'effect_blastLarge').setTint(RED).setAlpha(0).setScale(2);
    this.backHand = scene.add.image(-60, -96, ATLAS, 'character_handPurple').setScale(HAND_SCALE);
    this.torso = scene.add.image(0, 0, ATLAS, 'character_squarePurple').setOrigin(0.5, BODY_FEET_ORIGIN_Y).setScale(BODY_SCALE);
    const helmet = scene.add.image(0, HELMET_Y, ATLAS, 'item_helmet').setScale(HELMET_SCALE);
    this.sword = scene.add.image(70, -92, ATLAS, 'item_sword').setOrigin(0.5, SWORD_ORIGIN_Y).setScale(SWORD_SCALE);
    this.frontHand = scene.add.image(70, -92, ATLAS, 'character_handPurple').setScale(HAND_SCALE);
    this.visual = scene.add
      .container(x, feetY, [this.redAura, this.backHand, this.torso, helmet, this.sword, this.frontHand])
      .setDepth(18);

    this.fsm = new StateMachine<BossState>(
      {
        dormant: {},
        intro: { enter: () => this.enterIntro(), update: () => this.updateTimed(INTRO_TIME, 300) },
        approach: { update: (d) => this.updateApproach(d) },
        attack: { enter: () => this.enterStep(), update: (d) => this.updateStep(d), exit: () => this.cleanupStep() },
        countered: { update: (d) => this.updateKnocked(d, COUNTERED_TIME, 200) },
        stunned: { enter: () => this.enterStunned(), update: (d) => this.updateKnocked(d, STUN_TIME, 400), exit: () => (this.poise = 0) },
        phaseShift: { enter: () => this.enterPhaseShift(), update: () => this.updateTimed(PHASE_SHIFT_TIME, 200) },
        dead: { enter: () => this.enterDead() },
      },
      'dormant',
    );

    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.animate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.animate, this));
  }

  get state(): BossState {
    return this.fsm.current;
  }

  get awake() {
    return this.fsm.current !== 'dormant';
  }

  get isDead() {
    return this.fsm.current === 'dead';
  }

  get isStunned() {
    return this.fsm.current === 'stunned';
  }

  get hurtbox() {
    return new Phaser.Geom.Rectangle(this.body.x, this.body.y, this.body.width, this.body.height);
  }

  /** Trận đấu bắt đầu. */
  wake() {
    if (this.fsm.current === 'dormant') this.fsm.transition('intro');
  }

  update(delta: number, player: Player) {
    this.target = player;
    this.clock += delta;

    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) this.torso.clearTint();
    }
    // Thanh choáng tụt dần nếu người chơi chỉ né/thủ suông
    if (this.fsm.current !== 'stunned' && this.clock - this.lastPoiseGain > POISE_DECAY_DELAY) {
      this.poise = Math.max(0, this.poise - POISE_DECAY_RATE * (delta / 1000));
    }
    // Xuống nửa máu: chuyển pha ngay khi có thể (đang kiệt sức thì chờ hết kiệt sức)
    const busy = this.fsm.current === 'stunned' || this.fsm.current === 'dead' || this.fsm.current === 'phaseShift';
    if (this.pendingPhase2 && !busy) this.fsm.transition('phaseShift');

    this.fsm.update(delta);
  }

  // ===========================================================================
  // Bị đánh
  // ===========================================================================

  takeHit(hit: HitInfo) {
    const s = this.fsm.current;
    if (s === 'dormant' || s === 'intro' || s === 'phaseShift' || s === 'dead') return false; // miễn nhiễm

    // Giáp cứng: boss KHÔNG khựng khi bị chém (trừ lúc kiệt sức). Chỉ chớp trắng + mất máu
    this.lastDamageTaken = Math.round(hit.damage * (s === 'stunned' ? STUN_DAMAGE_MULT : 1));
    this.applyDamage(this.lastDamageTaken);
    this.flash(0xffffff, 70);
    if (!this.isDead) this.addPoise(hit.poiseDamage ?? 0);
    return true;
  }

  // ===========================================================================
  // Attacker: GameScene gọi khi đòn của boss chạm người chơi
  // ===========================================================================

  activeStrike(): Strike | null {
    if (this.fsm.current !== 'attack' || this.connected || !this.isActiveNow()) return null;
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

  onStrikeConnected() {
    this.connected = true;
  }

  /** Bị đỡ hoàn hảo: giáp cứng nên chuỗi đòn vẫn tiếp tục, nhưng thanh choáng tăng. */
  onParried() {
    this.flash(0xffffff, 60);
    this.addPoise(POISE_ON_PARRY);
  }

  /** Bị phản đòn: phần thưởng lớn nhất: mất máu, choáng tăng mạnh, chuỗi đòn bị cắt ngang. */
  onCountered(pushDirection: 1 | -1, damage: number) {
    this.lastDamageTaken = damage;
    this.applyDamage(damage);
    if (this.isDead) return true;
    this.flash(0xffffff, 120);
    this.addPoise(POISE_ON_COUNTER);
    if (this.fsm.current !== 'stunned' && this.fsm.current !== 'phaseShift') {
      this.body.setVelocity(pushDirection * 3 * TILE, -2 * TILE);
      this.fsm.transition('countered', true);
    }
    return false;
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.animate, this);
    this.cleanupStep();
    this.visual.destroy();
    this.hitbox.destroy();
  }

  private applyDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) {
      this.fsm.transition('dead');
      return;
    }
    if (this.phase === 1 && this.hp <= BOSS_MAX_HP / 2) this.pendingPhase2 = true;
  }

  private addPoise(amount: number) {
    if (amount <= 0) return;
    this.poise = Math.min(BOSS_MAX_POISE, this.poise + amount);
    this.lastPoiseGain = this.clock;
    const s = this.fsm.current;
    if (this.poise >= BOSS_MAX_POISE && s !== 'stunned' && s !== 'dead' && s !== 'phaseShift') this.fsm.transition('stunned');
  }

  private flash(color: number, ms: number) {
    this.torso.setTintFill(color);
    this.flashTimer = ms;
  }

  // ===========================================================================
  // Trạng thái
  // ===========================================================================

  private timeScale() {
    return this.phase === 2 ? PHASE2_TIME_SCALE : 1;
  }

  /** Trạng thái chỉ chờ hết giờ rồi quay lại tiếp cận (intro, gầm chuyển pha). */
  private updateTimed(duration: number, restAfter: number) {
    this.body.setVelocityX(0);
    if (this.fsm.timeInState >= duration) {
      this.restTimer = restAfter;
      this.fsm.transition('approach');
    }
  }

  /** Bị hất / kiệt sức: phanh lại, hết giờ thì quay lại tiếp cận. */
  private updateKnocked(delta: number, duration: number, restAfter: number) {
    if (this.body.blocked.down) this.body.setVelocityX(moveTowards(this.body.velocity.x, 0, ACCEL * (delta / 1000)));
    if (this.fsm.timeInState >= duration && this.body.blocked.down) {
      this.restTimer = restAfter;
      this.fsm.transition('approach');
    }
  }

  private enterIntro() {
    this.sfx.bossRoar();
    this.scene.cameras.main.shake(900, 0.006);
    spawnCallout(this.scene, this.body.center.x, this.body.y - 120, BOSS_NAME, '#2b2b2b');
  }

  private updateApproach(delta: number) {
    const p = this.target;
    if (!p || !p.alive) {
      this.body.setVelocityX(moveTowards(this.body.velocity.x, 0, ACCEL * (delta / 1000)));
      return;
    }
    const dx = p.body.center.x - this.body.center.x;
    const dist = Math.abs(dx);
    const dir: 1 | -1 = dx > 0 ? 1 : -1;
    if (dist > 8) this.facing = dir;

    // Nghỉ giữa hai chuỗi đòn: đứng thủ, nhích chậm lại gần. Đây là lúc người chơi được tấn công
    if (this.restTimer > 0) {
      this.restTimer -= delta;
      this.body.setVelocityX(moveTowards(this.body.velocity.x, dist > 3 * TILE ? dir * WALK_SPEED * 0.4 : 0, ACCEL * (delta / 1000)));
      return;
    }

    this.nextCombo ??= this.pickCombo(dist);
    const first = MOVES[this.nextCombo[0]];
    if (dist <= first.range && this.body.blocked.down) {
      this.combo = this.nextCombo;
      this.nextCombo = null;
      this.step = 0;
      this.fsm.transition('attack', true);
      return;
    }
    const speed = WALK_SPEED * (this.phase === 2 ? 1.3 : 1);
    this.body.setVelocityX(moveTowards(this.body.velocity.x, dir * speed, ACCEL * (delta / 1000)));
  }

  /** Chọn chuỗi đòn kế tiếp: ngẫu nhiên nhưng không lặp lại y hệt chuỗi vừa đánh. Người chơi ở xa thì dùng đòn áp sát. */
  private pickCombo(dist: number): MoveName[] {
    if (dist > 6 * TILE) return this.phase === 2 && Math.random() < 0.6 ? ['leap'] : ['redThrust'];
    const pool = this.phase === 2 ? PHASE2_COMBOS : PHASE1_COMBOS;
    let choice: MoveName[];
    do choice = pool[Phaser.Math.Between(0, pool.length - 1)];
    while (pool.length > 1 && choice.join() === this.lastComboKey);
    this.lastComboKey = choice.join();
    return choice;
  }

  // --- Một đòn trong chuỗi: windup → active → recovery ---

  private enterStep() {
    this.move = MOVES[this.combo[this.step]];
    const p = this.target;
    if (p) this.facing = p.body.center.x > this.body.center.x ? 1 : -1; // quay người được giữa hai đòn trong chuỗi
    this.swingId++;
    this.connected = false;
    this.flashed = false;
    this.swingDrawn = false;
    this.airborne = false;
    this.launched = false;
    this.swingStartAngle = this.swordAngle;
    this.activeStart = this.move.leap ? Number.POSITIVE_INFINITY : this.move.windup * this.timeScale();

    if (this.move.unblockable) {
      this.sfx.redWarning();
      this.warning = this.scene.add
        .text(this.body.center.x, this.body.y - 90, '!!', {
          fontFamily: HEAVY_FONT,
          fontSize: '110px',
          color: '#ff2d2d',
          stroke: '#2b2b2b',
          strokeThickness: 10,
        })
        .setOrigin(0.5, 1)
        .setDepth(45);
    } else {
      this.sfx.telegraph();
    }
    if (this.move.leap && p) {
      this.leapTargetX = p.body.center.x;
      this.landingMarker = this.scene.add.graphics().setDepth(16);
    }
  }

  private isActiveNow() {
    const t = this.fsm.timeInState;
    return t >= this.activeStart && t < this.activeStart + this.move.active;
  }

  private updateStep(delta: number) {
    const m = this.move;
    const body = this.body;
    const t = this.fsm.timeInState;
    const windup = m.windup * this.timeScale();

    // Chớp sáng cuối windup: trắng = đỡ được, đỏ = phải né / phản đòn
    if (!this.flashed && t >= windup - m.flashBefore) {
      this.flashed = true;
      this.flash(m.unblockable ? RED : 0xffffff, m.flashBefore);
    }

    if (m.leap) {
      this.updateLeap(t, windup);
    } else if (t < windup) {
      body.setVelocityX(moveTowards(body.velocity.x, 0, ACCEL * (delta / 1000)));
    } else if (this.isActiveNow()) {
      if (!this.swingDrawn) this.startSwing();
      body.setVelocityX(this.connected ? 0 : this.facing * (m.lunge / (m.active / 1000)));
    } else {
      body.setVelocityX(moveTowards(body.velocity.x, 0, ACCEL * 1.5 * (delta / 1000)));
    }

    // Hết đòn: sang đòn kế trong chuỗi, hoặc nghỉ
    if (t >= this.activeStart + m.active + m.recovery * this.timeScale()) {
      if (this.step + 1 < this.combo.length) {
        this.step++;
        this.fsm.transition('attack', true);
      } else {
        this.restTimer = REST_BETWEEN_COMBOS * this.timeScale();
        this.fsm.transition('approach');
      }
    }
  }

  /** Nhảy bổ: lấy đà (vệt đỏ dưới đất báo chỗ rơi) → bay theo đường parabol → đáp xuống mới có hiệu lực. */
  private updateLeap(t: number, windup: number) {
    const body = this.body;
    const p = this.target;
    // Bám theo người chơi tới lúc chớp đỏ, sau đó KHOÁ điểm rơi: người chơi có ~0.17s + thời gian bay để chạy ra khỏi vệt
    if (!this.flashed && p) this.leapTargetX = p.body.center.x;
    this.drawLandingMarker(t);

    if (!this.launched) {
      body.setVelocityX(0);
      if (t >= windup) {
        // Bay trong T giây: vận tốc ngang = quãng đường / T; vận tốc dọc để rơi đúng lúc: v = g·T/2
        const T = 0.75;
        body.setVelocity((this.leapTargetX - body.center.x) / T, -(GRAVITY * T) / 2);
        this.launched = true;
        this.airborne = true;
        this.sfx.dash();
      }
      return;
    }
    if (this.airborne && body.blocked.down && t > windup + 100) {
      this.airborne = false;
      this.activeStart = t;
      body.setVelocityX(0);
      this.landingMarker?.destroy();
      this.landingMarker = null;
      this.startSwing();
      this.onLand();
    }
  }

  private drawLandingMarker(t: number) {
    const g = this.landingMarker;
    if (!g) return;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t / 70));
    const y = this.body.bottom;
    g.fillStyle(RED, 0.18 + 0.15 * pulse).fillEllipse(this.leapTargetX, y, 480, 44);
    g.lineStyle(4, RED, 0.6 + 0.4 * pulse).strokeEllipse(this.leapTargetX, y, 480, 44);
  }

  /** Đáp đất: chấn động, bụi hai bên, rung màn hình. */
  private onLand() {
    this.sfx.bossSlam();
    this.scene.cameras.main.shake(260, 0.012);
    const x = this.body.center.x;
    const y = this.body.bottom;
    const ring = this.scene.add.graphics().setPosition(x, y).setDepth(30);
    ring.lineStyle(10, INK, 1).strokeEllipse(0, 0, 200, 40);
    this.scene.tweens.add({ targets: ring, scaleX: 3, scaleY: 2, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const dust = this.scene.add.image(x + side * (60 + i * 50), y - 10, ATLAS, 'effect_blast').setScale(0.5).setDepth(30);
        this.scene.tweens.add({ targets: dust, x: dust.x + side * 120, y: y - 50, scale: 0.9, alpha: 0, duration: 450, ease: 'Quad.Out', onComplete: () => dust.destroy() });
      }
    }
  }

  private startSwing() {
    this.swingDrawn = true;
    this.sfx.swing(this.move.power);
    if (this.move.thrust) return;
    const slash = drawSlash(this.scene, this.toLocalRad(this.move.swingFrom), this.toLocalRad(this.move.swingTo), SLASH_RADIUS, 1);
    slash.setPosition(SHOULDER.x * this.facing, SHOULDER.y);
    this.visual.addAt(slash, this.visual.getIndex(this.sword));
  }

  private cleanupStep() {
    this.warning?.destroy();
    this.warning = null;
    this.landingMarker?.destroy();
    this.landingMarker = null;
  }

  private enterStunned() {
    this.cleanupStep();
    this.sfx.bossStunned();
    spawnCallout(this.scene, this.body.center.x, this.body.y - 120, 'KIỆT SỨC!', '#c99a06');
  }

  private enterPhaseShift() {
    this.pendingPhase2 = false;
    this.phase = 2;
    this.cleanupStep();
    this.body.setVelocityX(0);
    this.sfx.bossRoar();
    this.scene.cameras.main.shake(PHASE_SHIFT_TIME * 0.6, 0.01);
    spawnCallout(this.scene, this.body.center.x, this.body.y - 120, 'NỔI GIẬN!', '#2b2b2b');

    // Sóng gầm: vòng mực nở rộng + đẩy người chơi ở gần văng ra (không mất máu)
    const ring = this.scene.add.graphics().setPosition(this.body.center.x, this.body.center.y).setDepth(30);
    ring.lineStyle(14, INK, 1).strokeCircle(0, 0, 60);
    this.scene.tweens.add({ targets: ring, scale: 9, alpha: 0, duration: 600, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    const p = this.target;
    if (p && Math.abs(p.body.center.x - this.body.center.x) < 4 * TILE) {
      p.shove(p.body.center.x > this.body.center.x ? 1 : -1);
    }
  }

  private enterDead() {
    this.cleanupStep();
    this.body.setVelocity(0, 0);
    this.body.enable = false;
    this.sfx.kill();
    this.scene.cameras.main.shake(1200, 0.008);
    // Nổ liên hoàn rồi tan biến
    const cx = this.body.center.x;
    const cy = this.body.center.y;
    this.scene.time.addEvent({
      delay: 180,
      repeat: 5,
      callback: () => spawnDeathBurst(this.scene, cx + Phaser.Math.Between(-80, 80), cy + Phaser.Math.Between(-90, 70)),
    });
    this.torso.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: this.visual,
      angle: -this.facing * 25,
      scaleY: 0.85,
      alpha: 0,
      delay: 600,
      duration: 900,
      ease: 'Quad.In',
      onComplete: () => {
        this.gone = true;
        this.sfx.victory();
      },
    });
  }

  // ===========================================================================
  // Procedural animation
  // ===========================================================================

  private toLocalRad(deg: number) {
    return Phaser.Math.DegToRad(this.facing > 0 ? deg : 180 - deg);
  }

  private animate() {
    if (this.hitStop.active || this.isDead) return;

    const dt = this.scene.game.loop.delta / 1000;
    const t = this.scene.time.now / 1000;
    const state = this.fsm.current;
    const f = this.facing;
    const k = 1 - Math.exp(-dt * 14);

    this.visual.setPosition(this.hitbox.x, this.hitbox.y + HITBOX_H / 2);
    this.warning?.setPosition(this.visual.x, this.visual.y - 250);

    // --- Dáng người ---
    const m = this.move;
    const st = this.fsm.timeInState;
    const windup = m.windup * this.timeScale();
    const inWindup = state === 'attack' && st < Math.min(windup, this.activeStart);
    let lean = (this.body.velocity.x / WALK_SPEED) * 3;
    let squashY = 1 + Math.sin(t * 2.5) * 0.015; // thở
    if (state === 'attack') lean = inWindup ? -f * 6 * Math.min(1, st / windup) : this.isActiveNow() ? f * 10 : 0;
    if (state === 'countered') lean = -f * 18;
    if (state === 'stunned') {
      lean = f * 14 + Math.sin(t * 6) * 3; // gục về trước, chao đảo
      squashY = 0.86;
    }
    if (state === 'phaseShift' || state === 'intro') squashY = 1.04 + Math.sin(t * 40) * 0.01; // ưỡn người gầm, rung
    this.visual.angle += (lean - this.visual.angle) * k;
    this.torso.setScale(BODY_SCALE, BODY_SCALE * squashY);

    // --- Đòn đỏ: hào quang đỏ + thân ửng đỏ, nhịp nhanh dần ---
    const redCharging = state === 'attack' && m.unblockable && inWindup;
    if (redCharging) {
      const p01 = Math.min(1, st / windup);
      const pulse = Math.abs(Math.sin(t * Phaser.Math.Linear(6, 18, p01)));
      this.redAura.setAlpha(0.25 + 0.35 * pulse).setScale(Phaser.Math.Linear(1.4, 2.4, p01));
      if (!this.flashed) this.torso.setTint(lerpColor(0xffffff, 0xff7070, pulse));
    } else if (this.redAura.alpha > 0) {
      this.redAura.setAlpha(Math.max(0, this.redAura.alpha - dt * 4));
    }

    // --- Pha 2: khói mực bốc lên từ vai ---
    if (this.phase === 2 && state !== 'dormant') {
      this.inkTimer -= dt * 1000;
      if (this.inkTimer <= 0) {
        this.inkTimer = 90;
        const puff = this.scene.add
          .image(this.visual.x + Phaser.Math.Between(-60, 60), this.visual.y - Phaser.Math.Between(140, 200), ATLAS, 'effect_blast')
          .setTintFill(INK)
          .setAlpha(0.3)
          .setScale(Phaser.Math.FloatBetween(0.2, 0.4))
          .setDepth(17);
        this.scene.tweens.add({ targets: puff, y: puff.y - 90, scale: 0.05, alpha: 0, duration: 700, onComplete: () => puff.destroy() });
      }
    }

    // --- Kiếm + tay ---
    let hand: Point;
    if (state === 'attack' && m.thrust) {
      // Đâm: rút về sau hông lấy đà, rồi duỗi thẳng ra trước
      this.swordAngle = 0;
      hand = st < this.activeStart ? { x: -10 * f, y: -112 } : { x: 92 * f, y: -112 };
    } else if (state === 'attack') {
      // Vung: góc tính thẳng từ thời gian (không làm mượt) để khớp nhịp frame data
      if (st < this.activeStart) {
        const p01 = m.leap ? Math.min(1, st / windup) : st / windup;
        this.swordAngle = Phaser.Math.Linear(this.swingStartAngle, m.swingFrom, easeOutCubic(p01));
      } else {
        this.swordAngle = Phaser.Math.Linear(m.swingFrom, m.swingTo, easeOutCubic((st - this.activeStart) / m.active));
      }
      const a = this.toLocalRad(this.swordAngle);
      hand = { x: SHOULDER.x * f + Math.cos(a) * HAND_RADIUS, y: SHOULDER.y + Math.sin(a) * HAND_RADIUS };
    } else {
      let restAngle = -55;
      hand = { x: 70 * f, y: -92 };
      if (state === 'stunned') { restAngle = 100; hand = { x: 80 * f, y: -44 }; }   // kiếm cắm xuống đất, chống người
      if (state === 'countered') { restAngle = -150; hand = { x: 10 * f, y: -170 }; } // kiếm bị hất tung
      if (state === 'intro' || state === 'phaseShift') { restAngle = -95; hand = { x: 40 * f, y: -200 }; } // giơ kiếm gầm
      this.swordAngle += (restAngle - this.swordAngle) * k;
    }

    const kHand = state === 'attack' ? 1 - Math.exp(-dt * 40) : k;
    this.frontHand.setPosition(this.frontHand.x + (hand.x - this.frontHand.x) * kHand, this.frontHand.y + (hand.y - this.frontHand.y) * kHand);
    this.backHand.setPosition(this.backHand.x + (-60 * f - this.backHand.x) * k, -96);
    this.sword
      .setPosition(this.frontHand.x, this.frontHand.y)
      .setRotation(this.toLocalRad(this.swordAngle) + Math.PI / 2)
      .setFlipX(f < 0);
  }
}
