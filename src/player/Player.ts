import Phaser from 'phaser';
import { ATLAS, GRAVITY, TILE } from '../config';
import { StateMachine } from '../core/StateMachine';
import { COMBO, type AttackDef } from '../combat/attacks';
import { drawSlash } from '../combat/hitEffects';
import type { DefenseResult, HitInfo, Strike } from '../combat/types';
import type { HitStop } from '../combat/HitStop';
import type { Sfx } from '../audio/Sfx';

// ============================================================================
// Thông số di chuyển, tính theo ô gạch (TILE) để dễ hình dung khi thiết kế màn
// ============================================================================
const RUN_SPEED = 4.5 * TILE;            // chạy 4.5 ô/giây
const GROUND_ACCEL = 45 * TILE;          // ~0.1 giây là đạt tốc độ tối đa: phản hồi gần như tức thì
const GROUND_DECEL = 55 * TILE;          // phanh gọn, không trượt
const AIR_ACCEL = 30 * TILE;             // trên không điều khiển yếu hơn một chút
const JUMP_HEIGHT = 2.45 * TILE;         // nhảy cao tối đa ~2.45 ô => leo được bậc 2 ô
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT); // vật lý lớp 10: v² = 2gh
const JUMP_CUT = 0.45;                   // nhả nút nhảy sớm => vận tốc đi lên còn 45% => nhảy thấp
const FALL_GRAVITY_EXTRA = 0.8 * GRAVITY; // cộng thêm trọng lực khi rơi => rơi nhanh, dứt khoát
const MAX_FALL_SPEED = 15 * TILE;
const COYOTE_TIME = 90;                  // ms: bước hụt khỏi mép vẫn còn nhảy được
const JUMP_BUFFER = 120;                 // ms: bấm nhảy hơi sớm trước khi chạm đất vẫn được tính
const DROP_THROUGH_TIME = 250;           // ms bỏ qua cầu một chiều khi bấm ↓ + nhảy

// --- Lướt (dash): thiết kế bằng quãng đường + thời gian, máy tự tính vận tốc ---
const DASH_DISTANCE = 2.5 * TILE;        // lướt được 2.5 ô
const DASH_TIME = 160;                   // trong 0.16 giây: ngắn và gắt
const DASH_SPEED = DASH_DISTANCE / (DASH_TIME / 1000);
const DASH_COOLDOWN = 400;               // ms tính từ lúc bắt đầu lướt mới được lướt tiếp
const AFTERIMAGE_INTERVAL = 25;          // ms giữa hai bóng mờ để lại phía sau
const PLAYER_GREEN = 0x39d98d;           // màu thân nhân vật (lấy mẫu từ sprite)

// --- Tấn công ---
const ATTACK_BUFFER = 150;               // ms: bấm chém hơi sớm (đang lướt, đang đáp đất) vẫn được tính
const COMBO_GRACE = 220;                 // ms sau khi thu kiếm vẫn nối được nhát tiếp theo của combo
const AIR_ATTACK_HANG = 0.3;             // chém trên không khi đang rơi => vận tốc rơi còn 30%: "treo" người một nhịp

// --- Máu và bị đánh ---
export const PLAYER_MAX_HP = 5;
const HURT_TIME = 350;                   // ms mất kiểm soát sau khi trúng đòn
const HURT_KNOCKBACK_X = 3.5 * TILE;     // bị hất ra sau...
const HURT_KNOCKBACK_Y = 4 * TILE;       // ...và nảy lên
const INVULN_TIME = 1000;                // ms miễn nhiễm sau khi trúng đòn (nhân vật nhấp nháy)

// --- Đỡ đòn (parry) ---
//   |-- PERFECT_WINDOW --|------ đỡ thường ------|   (hết PARRY_TIME mà không đỡ trúng gì => phải chờ cooldown)
const PARRY_TIME = 320;                  // ms giữ thế đỡ
const PERFECT_WINDOW = 160;              // ms đầu: đỡ hoàn hảo (gạt văng đòn, không mất gì, +1 Qi)
const PARRY_WHIFF_COOLDOWN = 300;        // đỡ hụt => chờ chừng này mới đỡ lại được: chống bấm đỡ liên tục
const PARRY_BUFFER = 80;                 // ms: bấm đỡ hơi sớm (đang thu kiếm) vẫn được tính, nhưng ngắn để giữ độ chính xác
const BLOCK_PUSHBACK = 2.5 * TILE;       // đỡ thường bị đẩy lùi nhẹ
const QI_GOLD = 0xf2c94c;                // màu Qi: kiếm loé vàng trong cửa sổ đỡ hoàn hảo

// --- Phản đòn (counter): khắc chế ĐÒN ĐỎ ---
//   |-- startup --|------ active: đâm kiếm lao tới ------|---- recovery ----|
//   |<------- khung phản đòn: đòn ĐỎ chạm vào lúc này = PHẢN ĐÒN ------->|
// Chỉ khắc chế đòn đỏ. Đòn thường đâm trúng lúc đang phản đòn thì vẫn trúng => phải nhìn màu mà chọn nút.
const COUNTER_MOVE = { startup: 60, active: 150, recovery: 380 };
const COUNTER_LUNGE = (1.2 * TILE) / (150 / 1000); // lao 1.2 ô trong pha active
const COUNTER_HITBOX = { x: 0, y: -115, w: 200, h: 80 };
const COUNTER_WHIFF_COOLDOWN = 600;      // phản đòn hụt => phạt nặng hơn đỡ hụt
const COUNTER_RED = 0xff5a5a;            // kiếm loé đỏ trong khung phản đòn

// --- Nội thương: máu "tạm mất" khi đỡ thường ---
const INTERNAL_HEAL_DELAY = 2500;        // ms không bị đánh thì nội thương bắt đầu lành
const INTERNAL_HEAL_INTERVAL = 1200;     // rồi mỗi chừng này ms lành 1 tim

// --- Qi + bùa ---
export const PLAYER_MAX_QI = 3;
const TALISMAN_MOVE = { startup: 120, active: 90, recovery: 260 }; // frame data của động tác dán bùa
const TALISMAN_HITBOX = { x: 10, y: -125, w: 190, h: 110 };

// --- Kiếm: sprite item_sword 128×129, mũi kiếm hướng lên, chuôi ở (64, 104) ---
const SWORD_SCALE = 0.85;
const SWORD_ORIGIN_Y = 104 / 129;
const SHOULDER = { x: 8, y: -72 };       // vai tay cầm kiếm, tính từ chân, khi quay mặt sang phải
const HAND_RADIUS = 38;                  // tay cách vai bao xa khi vung
const SLASH_RADIUS = HAND_RADIUS + 100 * SWORD_SCALE + 8; // vệt chém ôm theo mũi kiếm
/** Góc kiếm lúc nghỉ ở từng trạng thái (độ, hệ "quay mặt sang phải": 0 = trước, -90 = lên trời). */
const SWORD_REST: Record<PlayerState, number> = {
  idle: -60, run: -35, jump: -80, fall: -100, dash: 150, attack: 0, hurt: -130, dead: 100,
  parry: -100, // dựng kiếm thẳng đứng chắn trước người
  talisman: -50,
  counter: 0,  // (tư thế phản đòn tính riêng theo pha, xem animate)
};

// Hình thân rộng 82px, cao 124px. Hitbox nhỏ hơn hình một chút => né sát vẫn không bị tính trúng
const HITBOX_W = 60;
const HITBOX_H = 112;
// Frame thân 128×128, phần có hình kết thúc ở y=124 => chân ở 125/128 chiều cao frame
const BODY_FEET_ORIGIN_Y = 125 / 128;
const DEPTH_PLAYER = 20;

export type PlayerState = 'idle' | 'run' | 'jump' | 'fall' | 'dash' | 'attack' | 'parry' | 'talisman' | 'counter' | 'hurt' | 'dead';

type Point = { x: number; y: number };

/** Input của frame hiện tại, đọc MỘT lần ở đầu update rồi các trạng thái dùng chung. */
interface FrameInput {
  moveX: number; // -1 trái, 0 đứng, 1 phải
  down: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  dashPressed: boolean;
  attackPressed: boolean;
  parryPressed: boolean;
  talismanPressed: boolean;
  counterPressed: boolean;
}

/** Tiến `current` về `target`, mỗi lần không quá `maxDelta`. */
function moveTowards(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Phaser.Math.Clamp(t, 0, 1), 3);

/**
 * Nhân vật chính. Tách làm hai phần:
 * - hitbox: hình chữ nhật VÔ HÌNH mang thân vật lý. Va chạm chỉ dựa vào nó.
 * - visual: thân + hai bàn tay + kiếm lấy từ atlas. Bộ Scribble không có animation khung hình,
 *   nên chuyển động được "diễn" bằng code (procedural animation): thân nhún, tay vung, kiếm xoay.
 * Logic điều khiển chia theo trạng thái bằng StateMachine.
 */
export class Player {
  readonly hitbox: Phaser.GameObjects.Rectangle;
  readonly body: Phaser.Physics.Arcade.Body;
  facing: 1 | -1 = 1;
  /** GameScene bật lên mỗi frame nhân vật đang đứng trên cầu một chiều. */
  standingOnOneWay = false;
  /** Còn > 0 thì cầu một chiều không chặn (đang rơi xuyên qua cầu). */
  dropThroughTimer = 0;
  hp = PLAYER_MAX_HP;
  /** Số tim đang bị nội thương (nằm trong hp): lành dần theo thời gian, trúng đòn thật thì thành mất hẳn. */
  internalDamage = 0;
  qi = 0;
  /** Tăng mỗi lần bấm dùng bùa mà không đủ Qi: HUD thấy số này đổi thì rung các ô Qi. */
  qiDeniedCount = 0;

  private readonly scene: Phaser.Scene;
  private readonly sfx: Sfx;
  private readonly hitStop: HitStop;
  private readonly fsm: StateMachine<PlayerState>;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly frontHand: Phaser.GameObjects.Image;
  private readonly backHand: Phaser.GameObjects.Image;
  private readonly sword: Phaser.GameObjects.Image;

  private input: FrameInput = {
    moveX: 0, down: false, jumpPressed: false, jumpReleased: false,
    dashPressed: false, attackPressed: false, parryPressed: false, talismanPressed: false, counterPressed: false,
  };
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private airVelocityY = 0;     // vận tốc rơi ngay trước khi chạm đất, để biết đáp mạnh hay nhẹ
  private runPhase = 0;         // góc (radian) của chu kỳ bước chạy
  private dashCooldown = 0;
  private airDashAvailable = true; // trên không chỉ được lướt 1 lần, chạm đất mới hồi lại
  private dashDir: 1 | -1 = 1;
  private afterimageTimer = 0;

  private attack: AttackDef = COMBO[0];
  private comboIndex = 0;
  private nextComboIndex = 0;
  private comboGraceTimer = 0;
  private attackBufferTimer = 0;
  private attackQueued = false;  // đã bấm chém tiếp trong lúc đang chém
  private swingId = 0;
  private swingStarted = false;
  private lungeStopped = false;  // chém trúng thì thôi bước tới, không trượt xuyên qua mục tiêu
  private swordAngle = SWORD_REST.idle;
  private swingStartAngle = SWORD_REST.idle;

  private invulnTimer = 0;
  private flashTimer = 0;
  private hitDirection: 1 | -1 = 1; // hướng đòn vừa trúng mình, để biết bị hất về phía nào

  private parryBufferTimer = 0;
  private parryCooldown = 0;
  private parryContact = false;  // thế đỡ này đã chặn được đòn nào chưa (chưa => đỡ hụt => bị phạt cooldown)
  private deflected = false;     // vừa đỡ hoàn hảo: được huỷ thế đỡ để phản công
  private internalHealTimer = 0;
  private counterCooldown = 0;
  private counterLanded = false; // cú phản đòn này đã khắc chế được đòn đỏ chưa

  private readonly leftKeys: Phaser.Input.Keyboard.Key[];
  private readonly rightKeys: Phaser.Input.Keyboard.Key[];
  private readonly downKeys: Phaser.Input.Keyboard.Key[];
  private readonly jumpKeys: Phaser.Input.Keyboard.Key[];
  private readonly dashKeys: Phaser.Input.Keyboard.Key[];
  private readonly attackKeys: Phaser.Input.Keyboard.Key[];
  private readonly parryKeys: Phaser.Input.Keyboard.Key[];
  private readonly talismanKeys: Phaser.Input.Keyboard.Key[];
  private readonly counterKeys: Phaser.Input.Keyboard.Key[];

  /** (x, feetY) là vị trí CHÂN nhân vật. */
  constructor(scene: Phaser.Scene, x: number, feetY: number, deps: { sfx: Sfx; hitStop: HitStop }) {
    this.scene = scene;
    this.sfx = deps.sfx;
    this.hitStop = deps.hitStop;

    this.hitbox = scene.add.rectangle(x, feetY - HITBOX_H / 2, HITBOX_W, HITBOX_H).setVisible(false);
    scene.physics.add.existing(this.hitbox);
    this.body = this.hitbox.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(MAX_FALL_SPEED);

    // Gốc của visual đặt ở CHÂN: co giãn khi tiếp đất thì chân vẫn bám sàn.
    // Thứ tự trong container = thứ tự vẽ: tay sau, thân, kiếm, tay trước (tay nắm đè lên chuôi).
    this.backHand = scene.add.image(-40, -52, ATLAS, 'character_handGreen');
    this.torso = scene.add.image(0, 0, ATLAS, 'character_roundGreen').setOrigin(0.5, BODY_FEET_ORIGIN_Y);
    this.sword = scene.add.image(46, -54, ATLAS, 'item_sword').setOrigin(0.5, SWORD_ORIGIN_Y).setScale(SWORD_SCALE);
    this.frontHand = scene.add.image(46, -54, ATLAS, 'character_handGreen');
    this.visual = scene.add.container(x, feetY, [this.backHand, this.torso, this.sword, this.frontHand]).setDepth(DEPTH_PLAYER);

    const keyboard = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.leftKeys = [keyboard.addKey(K.LEFT), keyboard.addKey(K.A)];
    this.rightKeys = [keyboard.addKey(K.RIGHT), keyboard.addKey(K.D)];
    this.downKeys = [keyboard.addKey(K.DOWN), keyboard.addKey(K.S)];
    this.jumpKeys = [keyboard.addKey(K.SPACE), keyboard.addKey(K.UP), keyboard.addKey(K.W)];
    this.dashKeys = [keyboard.addKey(K.SHIFT), keyboard.addKey(K.L)];
    this.attackKeys = [keyboard.addKey(K.J), keyboard.addKey(K.X)];
    this.parryKeys = [keyboard.addKey(K.K), keyboard.addKey(K.C)];
    this.talismanKeys = [keyboard.addKey(K.I), keyboard.addKey(K.V)];
    this.counterKeys = [keyboard.addKey(K.U), keyboard.addKey(K.Z)];

    // Mỗi trạng thái chỉ khai báo những móc nó cần
    this.fsm = new StateMachine<PlayerState>(
      {
        idle: { update: (d) => this.updateGrounded(d) },
        run: { update: (d) => this.updateGrounded(d) },
        jump: { enter: () => this.enterJump(), update: (d) => this.updateAir(d) },
        fall: { update: (d) => this.updateAir(d) },
        dash: { enter: () => this.enterDash(), update: (d) => this.updateDash(d), exit: () => this.exitDash() },
        attack: { enter: () => this.enterAttack(), update: (d) => this.updateAttack(d), exit: () => this.exitAttack() },
        parry: { enter: () => this.enterParry(), update: (d) => this.updateParry(d), exit: () => this.exitParry() },
        talisman: { enter: () => this.enterTalisman(), update: (d) => this.updateTalisman(d) },
        counter: { enter: () => this.enterCounter(), update: (d) => this.updateCounter(d), exit: () => this.exitCounter() },
        hurt: { enter: () => this.enterHurt(), update: (d) => this.updateHurt(d) },
        dead: { enter: () => this.enterDead() },
      },
      'idle',
    );

    // Physics ghi vị trí mới vào hitbox ở bước POST_UPDATE, SAU scene.update().
    // Đặt visual theo hitbox cũng ở POST_UPDATE (đăng ký sau physics nên chạy sau) => không trễ 1 frame.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.animate, this);
    // Restart scene thì gỡ listener, nếu không nó vẫn gọi vào object đã bị huỷ
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.animate, this);
    });
  }

  get state(): PlayerState {
    return this.fsm.current;
  }

  /** i-frames: miễn nhiễm khi đang lướt, và một lúc sau khi vừa trúng đòn. */
  get invulnerable() {
    return this.fsm.current === 'dash' || this.invulnTimer > 0 || this.fsm.current === 'dead';
  }

  get alive() {
    return this.fsm.current !== 'dead';
  }

  /** Vùng bị đánh của người chơi = đúng thân vật lý. */
  get hurtbox() {
    return new Phaser.Geom.Rectangle(this.body.x, this.body.y, this.body.width, this.body.height);
  }

  get dashReady() {
    return this.dashCooldown <= 0 && (this.body.blocked.down || this.airDashAvailable);
  }

  /** Mô tả đòn đang chém cho HUD, vd. "2/3 hất lên". */
  get attackInfo() {
    return this.fsm.current === 'attack' ? `${this.comboIndex + 1}/${COMBO.length} ${this.attack.name}` : '-';
  }

  /** Đang trong cửa sổ đỡ hoàn hảo? (kiếm loé vàng) */
  get inPerfectWindow() {
    return this.fsm.current === 'parry' && this.fsm.timeInState <= PERFECT_WINDOW;
  }

  /** Đang trong khung phản đòn? (kiếm loé đỏ) */
  get inCounterWindow() {
    return this.fsm.current === 'counter' && this.fsm.timeInState < COUNTER_MOVE.startup + COUNTER_MOVE.active;
  }

  /** Lưỡi kiếm (hoặc tay dán bùa) đang trong pha active thì trả về vùng tác động, ngoài ra trả về null. */
  activeStrike(): Strike | null {
    if (this.fsm.current === 'counter') {
      const t = this.fsm.timeInState;
      if (t < COUNTER_MOVE.startup || t >= COUNTER_MOVE.startup + COUNTER_MOVE.active) return null;
      const hb = COUNTER_HITBOX;
      const x = this.facing > 0 ? this.body.center.x + hb.x : this.body.center.x - hb.x - hb.w;
      return {
        rect: new Phaser.Geom.Rectangle(x, this.body.bottom + hb.y, hb.w, hb.h),
        swingId: this.swingId,
        direction: this.facing,
        damage: 8,
        power: 0.6,
        hitStop: 70,
      };
    }
    if (this.fsm.current === 'talisman') {
      const t = this.fsm.timeInState;
      if (t < TALISMAN_MOVE.startup || t >= TALISMAN_MOVE.startup + TALISMAN_MOVE.active) return null;
      const hb = TALISMAN_HITBOX;
      const x = this.facing > 0 ? this.body.center.x + hb.x : this.body.center.x - hb.x - hb.w;
      return {
        rect: new Phaser.Geom.Rectangle(x, this.body.bottom + hb.y, hb.w, hb.h),
        swingId: this.swingId,
        direction: this.facing,
        damage: 0,
        power: 0.4,
        hitStop: 50,
        effect: 'talisman',
      };
    }
    if (this.fsm.current !== 'attack') return null;
    const atk = this.attack;
    const t = this.fsm.timeInState;
    if (t < atk.startup || t >= atk.startup + atk.active) return null;

    const hb = atk.hitbox;
    const x = this.facing > 0 ? this.body.center.x + hb.x : this.body.center.x - hb.x - hb.w;
    return {
      rect: new Phaser.Geom.Rectangle(x, this.body.bottom + hb.y, hb.w, hb.h),
      swingId: this.swingId,
      direction: this.facing,
      damage: atk.damage,
      power: atk.power,
      hitStop: atk.hitStop,
    };
  }

  /**
   * Hứng một đòn của kẻ địch. Thứ tự xét quyết định luật chơi:
   * 1. Đang thủ thế + trong cửa sổ hoàn hảo => 'perfect': không mất gì, +1 Qi, thế đỡ làm mới (đỡ liên tiếp được).
   * 2. Đang thủ thế nhưng trễ cửa sổ => 'block': chặn được nhưng mất 1 tim thành nội thương.
   * 3. Đang miễn nhiễm (lướt, vừa bị đánh) => 'miss': coi như đòn trượt.
   * 4. Còn lại => 'hit': mất máu thật, CỘNG THÊM toàn bộ nội thương đang mang.
   */
  receiveAttack(hit: HitInfo & { unblockable?: boolean }): DefenseResult {
    const state = this.fsm.current;
    if (state === 'dead') return 'miss';

    // 0. Đòn đỏ chạm vào đúng khung phản đòn => PHẢN ĐÒN: không mất gì, +1 Qi, được nối đòn ngay
    if (hit.unblockable && this.inCounterWindow) {
      this.facing = hit.direction > 0 ? -1 : 1;
      this.counterLanded = true;
      this.qi = Math.min(PLAYER_MAX_QI, this.qi + 1);
      return 'counter';
    }

    // Đòn đỏ thì thế đỡ vô dụng: bỏ qua nhánh đỡ, rơi thẳng xuống "trúng đòn" (và gọi là vỡ thế)
    if (state === 'parry' && !hit.unblockable) {
      this.facing = hit.direction > 0 ? -1 : 1; // quay mặt về phía kẻ đánh
      this.parryContact = true;
      if (this.fsm.timeInState <= PERFECT_WINDOW) {
        this.qi = Math.min(PLAYER_MAX_QI, this.qi + 1);
        this.fsm.transition('parry', true); // làm mới thế đỡ: đỡ được tiếp đòn sau (chuỗi đòn nhiều nhát)
        this.parryContact = true;
        this.deflected = true;
        return 'perfect';
      }
      this.internalDamage = Math.min(this.hp, this.internalDamage + hit.damage);
      this.internalHealTimer = INTERNAL_HEAL_DELAY;
      this.body.setVelocityX(hit.direction * BLOCK_PUSHBACK);
      this.flash();
      return 'block';
    }

    if (this.invulnerable) return 'miss';

    // Trúng đòn thật: nội thương đang mang "vỡ ra" thành vết thương thật
    const guardBroken = state === 'parry'; // tới được đây trong lúc thủ thế = vừa đỡ nhầm đòn đỏ
    this.hp = Math.max(0, this.hp - hit.damage - this.internalDamage);
    this.internalDamage = 0;
    this.hitDirection = hit.direction;
    this.fsm.transition(this.hp > 0 ? 'hurt' : 'dead', true);
    return guardBroken ? 'guardBreak' : 'hit';
  }

  /** Bị đẩy văng mà KHÔNG mất máu (vd. boss gầm chuyển pha): dùng lại trạng thái hurt cho phần hất văng + miễn nhiễm. */
  shove(direction: 1 | -1) {
    if (this.fsm.current === 'dead') return;
    this.hitDirection = direction;
    this.fsm.transition('hurt', true);
  }

  /** Rơi xuống hố: mất 1 máu rồi xuất hiện lại ở chỗ đứng an toàn gần nhất (còn máu). */
  fallIntoPit(safe: Point) {
    this.hp = Math.max(0, this.hp - 1);
    this.internalDamage = Math.min(this.internalDamage, this.hp); // nội thương không thể nhiều hơn số máu còn lại
    if (this.hp === 0) {
      this.fsm.transition('dead');
      return;
    }
    this.body.reset(safe.x, safe.y - HITBOX_H / 2); // đặt lại vị trí, xoá vận tốc
    this.invulnTimer = INVULN_TIME;
    this.flash();
    this.fsm.transition('idle', true);
  }

  /** GameScene báo: nhát chém hiện tại vừa trúng mục tiêu. */
  onHitConfirmed() {
    this.lungeStopped = true;
    this.body.setVelocityX(this.body.velocity.x * 0.2);
  }

  update(delta: number) {
    this.readInput();
    const onGround = this.body.blocked.down;

    // --- Bộ đếm dùng chung cho mọi trạng thái ---
    // Coyote time: rời mép rồi vẫn còn một khoảnh khắc được coi như đang đứng
    this.coyoteTimer = onGround ? COYOTE_TIME : this.coyoteTimer - delta;
    // Input buffer: bấm sớm một chút thì game "nhớ" lệnh, tới lúc làm được là làm luôn
    this.jumpBufferTimer = this.input.jumpPressed ? JUMP_BUFFER : this.jumpBufferTimer - delta;
    this.attackBufferTimer = this.input.attackPressed ? ATTACK_BUFFER : this.attackBufferTimer - delta;
    this.parryBufferTimer = this.input.parryPressed ? PARRY_BUFFER : this.parryBufferTimer - delta;
    this.parryCooldown -= delta;
    this.counterCooldown -= delta;
    this.comboGraceTimer -= delta;
    // Nội thương: không bị đánh thêm một lúc thì lành dần từng tim
    if (this.internalDamage > 0) {
      this.internalHealTimer -= delta;
      if (this.internalHealTimer <= 0) {
        this.internalDamage--;
        this.internalHealTimer = INTERNAL_HEAL_INTERVAL;
      }
    }
    this.dashCooldown -= delta;
    this.dropThroughTimer -= delta;
    this.invulnTimer -= delta;
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) this.torso.clearTint();
    }
    if (onGround) this.airDashAvailable = true;

    this.fsm.update(delta);

    // Cờ này chỉ đúng cho frame hiện tại; physics frame sau sẽ bật lại nếu vẫn đứng trên cầu
    this.standingOnOneWay = false;
  }

  // ===========================================================================
  // Các trạng thái
  // ===========================================================================

  /** idle + run: đứng trên mặt đất. */
  private updateGrounded(delta: number) {
    const body = this.body;
    const input = this.input;

    if (this.tryParry() || this.tryCounter() || this.tryDash() || this.tryTalisman() || this.tryAttack()) return;
    if (!body.blocked.down) {
      this.fsm.transition('fall'); // bước hụt khỏi mép (coyote time vẫn cho nhảy thêm một chút)
      return;
    }
    // ↓ + nhảy khi đứng trên cầu: rơi xuyên qua thay vì nhảy
    if (input.jumpPressed && input.down && this.standingOnOneWay) {
      this.dropThroughTimer = DROP_THROUGH_TIME;
      this.jumpBufferTimer = 0;
      this.fsm.transition('fall');
      return;
    }
    if (this.jumpBufferTimer > 0) {
      this.fsm.transition('jump');
      return;
    }

    this.moveHorizontal(input.moveX !== 0 ? GROUND_ACCEL : GROUND_DECEL, delta);
    this.fsm.transition(input.moveX !== 0 || Math.abs(body.velocity.x) > 10 ? 'run' : 'idle');
  }

  private enterJump() {
    this.body.setVelocityY(-JUMP_SPEED);
    this.body.setGravityY(0); // lúc bay lên chỉ chịu trọng lực thường
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0; // dùng hết "quyền nhảy", không nhảy được lần hai giữa không trung
    this.squash(0.8, 1.2); // vươn dài người lúc bật lên
  }

  /** jump + fall: đang ở trên không. */
  private updateAir(delta: number) {
    const body = this.body;
    const input = this.input;

    if (this.tryParry() || this.tryCounter() || this.tryDash() || this.tryTalisman() || this.tryAttack()) return;
    // Coyote jump: vừa rơi khỏi mép (hoặc bấm nhảy ngay trước khi chạm đất) vẫn nhảy được
    if (this.fsm.current === 'fall' && this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.fsm.transition('jump');
      return;
    }

    this.moveHorizontal(AIR_ACCEL, delta);
    // Nhả nút khi còn đang bay lên => cắt vận tốc => giữ lâu nhảy cao, bấm nhanh nhảy thấp
    if (input.jumpReleased && body.velocity.y < 0) body.setVelocityY(body.velocity.y * JUMP_CUT);
    // Rơi nặng hơn lên: đường nhảy không đối xứng, có cảm giác "trọng lượng"
    body.setGravityY(body.velocity.y > 0 ? FALL_GRAVITY_EXTRA : 0);

    if (body.blocked.down && body.velocity.y >= 0) {
      this.land();
      this.fsm.transition(input.moveX !== 0 ? 'run' : 'idle');
      return;
    }
    this.airVelocityY = body.velocity.y;
    if (this.fsm.current === 'jump' && body.velocity.y >= 0) this.fsm.transition('fall');
  }

  private enterDash() {
    const body = this.body;
    const onGround = body.blocked.down;

    // Lướt theo hướng đang bấm; không bấm hướng nào thì lướt về phía đang nhìn
    this.dashDir = this.input.moveX !== 0 ? (this.input.moveX > 0 ? 1 : -1) : this.facing;
    this.facing = this.dashDir;
    if (!onGround) this.airDashAvailable = false;
    this.dashCooldown = DASH_COOLDOWN;
    this.afterimageTimer = 0;
    // Lướt tắt trọng lực nên thân rời sàn; hết lướt sẽ "tiếp đất" lại ngay.
    // Xoá vận tốc rơi cũ để lần tiếp đất đó không bị tính là đáp mạnh (bẹp người, tung bụi vô lý)
    this.airVelocityY = 0;

    // Tắt trọng lực: lướt là một đường thẳng tắp, kể cả khi đang ở trên không
    body.setAllowGravity(false);
    body.setVelocity(this.dashDir * DASH_SPEED, 0);

    // Juice: kéo dài người theo hướng lướt, vệt tốc độ, bụi dưới chân, tiếng "vút"
    this.squash(1.35, 0.8, DASH_TIME);
    this.spawnSpeedLines();
    if (onGround) this.spawnDust(this.body.center.x - this.dashDir * 30, this.body.bottom, 0.45);
    this.sfx.dash();
  }

  private updateDash(delta: number) {
    const body = this.body;
    body.setVelocity(this.dashDir * DASH_SPEED, 0);

    this.afterimageTimer -= delta;
    if (this.afterimageTimer <= 0) {
      this.spawnAfterimage();
      this.afterimageTimer += AFTERIMAGE_INTERVAL;
    }

    const hitWall = this.dashDir > 0 ? body.blocked.right : body.blocked.left;
    if (this.fsm.timeInState >= DASH_TIME || hitWall) {
      this.fsm.transition(body.blocked.down ? (this.input.moveX !== 0 ? 'run' : 'idle') : 'fall');
    }
  }

  private exitDash() {
    // Dọn những gì enterDash đã bật: trả lại trọng lực, hạ tốc độ về mức chạy (vẫn giữ đà)
    this.body.setAllowGravity(true);
    this.body.setVelocityX(this.dashDir * Math.min(Math.abs(this.body.velocity.x), RUN_SPEED));
  }

  private enterAttack() {
    this.attack = COMBO[this.comboIndex];
    this.attackBufferTimer = 0;
    this.attackQueued = false;
    this.swingStarted = false;
    this.lungeStopped = false;
    this.swingId++;
    this.swingStartAngle = this.swordAngle;
    // Giữa hai nhát được phép quay người: bấm hướng nào thì nhát mới chém về hướng đó
    if (this.input.moveX !== 0) this.facing = this.input.moveX > 0 ? 1 : -1;

    const body = this.body;
    body.setGravityY(0);
    if (!body.blocked.down && body.velocity.y > 0) body.setVelocityY(body.velocity.y * AIR_ATTACK_HANG);
  }

  private updateAttack(delta: number) {
    const atk = this.attack;
    const body = this.body;
    const t = this.fsm.timeInState;
    const activeEnd = atk.startup + atk.active;
    const onGround = body.blocked.down;

    // Bước tới trong lúc vung (trên không thì bước ngắn hơn); sang pha thu kiếm thì phanh lại
    if (t < activeEnd && !this.lungeStopped) body.setVelocityX(this.facing * atk.lunge * (onGround ? 1 : 0.5));
    else body.setVelocityX(moveTowards(body.velocity.x, 0, GROUND_DECEL * (delta / 1000)));
    if (!onGround) this.airVelocityY = body.velocity.y;

    // Đầu pha active: lưỡi kiếm bắt đầu có hiệu lực => tiếng "xoẹt" + vệt chém
    if (!this.swingStarted && t >= atk.startup) {
      this.swingStarted = true;
      this.sfx.swing(atk.power);
      this.spawnSlashTrail();
    }

    // Bấm chém trong lúc đang chém => xếp hàng nhát tiếp theo (nhát cuối thì thôi)
    if (this.attackBufferTimer > 0 && this.comboIndex < COMBO.length - 1) {
      this.attackQueued = true;
      this.attackBufferTimer = 0;
    }

    if (t >= activeEnd) {
      // Hết pha active là được "huỷ" phần thu kiếm: nối nhát tiếp theo, thủ thế đỡ, hoặc lướt đi
      if (this.attackQueued) {
        this.comboIndex++;
        this.fsm.transition('attack', true);
        return;
      }
      if (this.tryParry() || this.tryCounter() || this.tryDash()) return;
    }

    if (t >= activeEnd + atk.recovery) {
      this.fsm.transition(onGround ? (this.input.moveX !== 0 ? 'run' : 'idle') : 'fall');
    }
  }

  private exitAttack() {
    // Thu kiếm xong vẫn còn một khoảng ngắn để nối combo; nhát cuối thì combo quay về nhát 1
    this.comboGraceTimer = COMBO_GRACE;
    this.nextComboIndex = (this.comboIndex + 1) % COMBO.length;
  }

  private enterParry() {
    this.parryBufferTimer = 0;
    this.parryContact = false;
    this.deflected = false;
    const body = this.body;
    body.setGravityY(0);
    if (!body.blocked.down && body.velocity.y > 0) body.setVelocityY(body.velocity.y * 0.5); // thủ thế trên không: rơi chậm lại
  }

  private updateParry(delta: number) {
    const body = this.body;
    if (body.blocked.down) body.setVelocityX(moveTowards(body.velocity.x, 0, GROUND_DECEL * (delta / 1000)));
    else this.airVelocityY = body.velocity.y;

    // Đã chặn được đòn thì được huỷ thế đỡ ngay: phản công, dán bùa, hoặc lướt đi
    if (this.parryContact && (this.tryAttack() || this.tryTalisman() || this.tryDash())) return;

    if (this.fsm.timeInState >= PARRY_TIME) this.fsm.transition(body.blocked.down ? 'idle' : 'fall');
  }

  private exitParry() {
    // Thủ thế suông mà không có đòn nào tới => bị phạt: một lúc sau mới đỡ lại được
    if (!this.parryContact) this.parryCooldown = PARRY_WHIFF_COOLDOWN;
  }

  private enterTalisman() {
    this.qi--; // tốn Qi ngay khi ra đòn, kể cả trượt: dùng bùa là một quyết định có rủi ro
    this.swingId++;
    this.swingStarted = false;
    const body = this.body;
    body.setGravityY(0);
    if (!body.blocked.down && body.velocity.y > 0) body.setVelocityY(body.velocity.y * AIR_ATTACK_HANG);
  }

  private updateTalisman(delta: number) {
    const body = this.body;
    const t = this.fsm.timeInState;
    const activeEnd = TALISMAN_MOVE.startup + TALISMAN_MOVE.active;
    body.setVelocityX(moveTowards(body.velocity.x, 0, GROUND_DECEL * (delta / 1000)));
    if (!body.blocked.down) this.airVelocityY = body.velocity.y;

    if (!this.swingStarted && t >= TALISMAN_MOVE.startup) {
      this.swingStarted = true;
      this.sfx.swing(0.2);
    }
    if (t >= activeEnd && (this.tryParry() || this.tryDash())) return;
    if (t >= activeEnd + TALISMAN_MOVE.recovery) this.fsm.transition(body.blocked.down ? 'idle' : 'fall');
  }

  private enterCounter() {
    this.counterLanded = false;
    this.swingStarted = false;
    this.lungeStopped = false;
    this.swingId++;
    if (this.input.moveX !== 0) this.facing = this.input.moveX > 0 ? 1 : -1;
    const body = this.body;
    body.setGravityY(0);
    if (!body.blocked.down && body.velocity.y > 0) body.setVelocityY(body.velocity.y * AIR_ATTACK_HANG);
  }

  private updateCounter(delta: number) {
    const body = this.body;
    const t = this.fsm.timeInState;
    const activeEnd = COUNTER_MOVE.startup + COUNTER_MOVE.active;

    // Lao tới trong pha active (đâm thẳng vào mặt đòn đỏ); trúng gì đó thì thôi lao
    if (t >= COUNTER_MOVE.startup && t < activeEnd && !this.lungeStopped) {
      body.setVelocityX(this.facing * COUNTER_LUNGE * (body.blocked.down ? 1 : 0.6));
    } else {
      body.setVelocityX(moveTowards(body.velocity.x, 0, GROUND_DECEL * (delta / 1000)));
    }
    if (!body.blocked.down) this.airVelocityY = body.velocity.y;

    if (!this.swingStarted && t >= COUNTER_MOVE.startup) {
      this.swingStarted = true;
      this.sfx.swing(0.8);
      this.spawnSpeedLinesForward();
    }

    // Phản đòn trúng: được huỷ ngay phần còn lại để nối đòn, đúng như đỡ hoàn hảo
    if (this.counterLanded && (this.tryAttack() || this.tryTalisman() || this.tryDash())) return;
    if (t >= activeEnd + COUNTER_MOVE.recovery) this.fsm.transition(body.blocked.down ? 'idle' : 'fall');
  }

  private exitCounter() {
    // Phản đòn mà không có đòn đỏ nào => bị phạt: một lúc lâu sau mới dùng lại được
    if (!this.counterLanded) this.counterCooldown = COUNTER_WHIFF_COOLDOWN;
  }

  private enterHurt() {
    // Bị đánh giữa lúc lướt/chém cũng phải trả lại trọng lực (exit của các trạng thái đó đã lo phần lớn)
    this.body.setAllowGravity(true);
    this.body.setGravityY(0);
    this.body.setVelocity(this.hitDirection * HURT_KNOCKBACK_X, -HURT_KNOCKBACK_Y);
    this.invulnTimer = INVULN_TIME;
    this.flash();
    this.squash(1.25, 0.8);
  }

  /** Mất kiểm soát một lúc: không đọc input, chỉ bay theo cú hất rồi phanh lại. */
  private updateHurt(delta: number) {
    const body = this.body;
    if (body.blocked.down) body.setVelocityX(moveTowards(body.velocity.x, 0, GROUND_DECEL * (delta / 1000)));
    else this.airVelocityY = body.velocity.y;
    if (this.fsm.timeInState >= HURT_TIME) this.fsm.transition(body.blocked.down ? 'idle' : 'fall');
  }

  private enterDead() {
    this.body.setAllowGravity(true);
    this.body.setVelocity(this.hitDirection * HURT_KNOCKBACK_X * 0.6, -HURT_KNOCKBACK_Y * 0.6);
    this.flash();
    // Ngã ngửa về phía bị đánh (container gốc ở chân nên xoay quanh bàn chân)
    this.scene.tweens.killTweensOf(this.visual);
    this.scene.tweens.add({ targets: this.visual, angle: this.hitDirection * 90, scaleX: 1, scaleY: 1, alpha: 0.6, duration: 500, ease: 'Bounce.Out' });
  }

  // ===========================================================================
  // Hành động dùng chung
  // ===========================================================================

  private readInput() {
    const right = this.anyDown(this.rightKeys) ? 1 : 0;
    const left = this.anyDown(this.leftKeys) ? 1 : 0;
    this.input = {
      moveX: right - left,
      down: this.anyDown(this.downKeys),
      jumpPressed: this.anyJustDown(this.jumpKeys),
      jumpReleased: this.anyJustUp(this.jumpKeys),
      dashPressed: this.anyJustDown(this.dashKeys),
      attackPressed: this.anyJustDown(this.attackKeys),
      parryPressed: this.anyJustDown(this.parryKeys),
      talismanPressed: this.anyJustDown(this.talismanKeys),
      counterPressed: this.anyJustDown(this.counterKeys),
    };
  }

  /** Chạy ngang: tăng/giảm tốc dần tới vận tốc mong muốn, không nhảy cóc. */
  private moveHorizontal(accel: number, delta: number) {
    const moveX = this.input.moveX;
    if (moveX !== 0) this.facing = moveX > 0 ? 1 : -1;
    this.body.setVelocityX(moveTowards(this.body.velocity.x, moveX * RUN_SPEED, accel * (delta / 1000)));
  }

  /** Lướt được từ đứng, chạy, nhảy, rơi, và từ pha thu kiếm. */
  private tryDash() {
    if (!this.input.dashPressed || !this.dashReady) return false;
    this.fsm.transition('dash');
    return true;
  }

  /** Thủ thế đỡ (nếu có lệnh trong buffer và không bị phạt vì vừa đỡ hụt). */
  private tryParry() {
    if (this.parryBufferTimer <= 0 || this.parryCooldown > 0) return false;
    this.fsm.transition('parry');
    return true;
  }

  /** Phản đòn: bấm là ra ngay (không buffer: thời điểm bấm chính là kỹ năng), trừ khi đang bị phạt vì phản hụt. */
  private tryCounter() {
    if (!this.input.counterPressed || this.counterCooldown > 0) return false;
    this.fsm.transition('counter');
    return true;
  }

  /** Dán bùa: cần ít nhất 1 Qi. Thiếu Qi thì kêu "xì" và báo HUD rung ô Qi. */
  private tryTalisman() {
    if (!this.input.talismanPressed) return false;
    if (this.qi < 1) {
      this.qiDeniedCount++;
      this.sfx.fizzle();
      return false;
    }
    this.fsm.transition('talisman');
    return true;
  }

  /** Bắt đầu chém (nếu có lệnh trong buffer): nối tiếp combo nếu vừa chém xong, không thì từ nhát 1. */
  private tryAttack() {
    if (this.attackBufferTimer <= 0) return false;
    this.comboIndex = this.comboGraceTimer > 0 ? this.nextComboIndex : 0;
    this.fsm.transition('attack');
    return true;
  }

  /** Tiếp đất: đáp càng mạnh càng bẹp nhiều, càng to tiếng, càng tung bụi. */
  private land() {
    const impact = Phaser.Math.Clamp(this.airVelocityY / MAX_FALL_SPEED, 0, 1);
    if (impact < 0.25) return;
    this.squash(Phaser.Math.Linear(1.05, 1.3, impact), Phaser.Math.Linear(0.95, 0.7, impact));
    this.sfx.land(impact);
    if (impact > 0.45) {
      const scale = Phaser.Math.Linear(0.3, 0.55, impact);
      this.spawnDust(this.body.center.x - 34, this.body.bottom, scale);
      this.spawnDust(this.body.center.x + 34, this.body.bottom, scale);
    }
  }

  // ===========================================================================
  // Hiệu ứng (juice)
  // ===========================================================================

  /** Vệt chém vẽ bên trong container nhân vật (ngay sau thân, trước kiếm) nên đi theo người khi lao tới. */
  private spawnSlashTrail() {
    const from = this.toLocalRad(this.attack.swingFrom);
    const to = this.toLocalRad(this.attack.swingTo);
    const slash = drawSlash(this.scene, from, to, SLASH_RADIUS, this.attack.power);
    slash.setPosition(SHOULDER.x * this.facing, SHOULDER.y);
    this.visual.addAt(slash, this.visual.getIndex(this.sword));
  }

  /** Bóng mờ: bản sao thân nhân vật tô một màu, đứng yên tại chỗ rồi mờ dần. */
  private spawnAfterimage() {
    const ghost = this.scene.add
      .image(this.body.center.x, this.body.bottom, ATLAS, 'character_roundGreen')
      .setOrigin(0.5, BODY_FEET_ORIGIN_Y)
      .setScale(this.visual.scaleX, this.visual.scaleY)
      .setAngle(this.visual.angle)
      .setTintFill(PLAYER_GREEN)
      .setAlpha(0.45)
      .setDepth(DEPTH_PLAYER - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  /** Vệt tốc độ: vài vạch ngang ở lại phía sau, co ngắn rồi biến mất. */
  private spawnSpeedLines() {
    for (const offsetY of [-90, -55, -25]) {
      const line = this.scene.add
        .image(this.body.center.x - this.dashDir * 40, this.body.bottom + offsetY + Phaser.Math.Between(-6, 6), ATLAS, 'effect_shotLarge')
        .setScale(Phaser.Math.FloatBetween(0.7, 1.1), 1)
        .setDepth(DEPTH_PLAYER - 2);
      this.scene.tweens.add({ targets: line, scaleX: 0, alpha: 0, duration: Phaser.Math.Between(180, 260), ease: 'Quad.Out', onComplete: () => line.destroy() });
    }
  }

  /** Vạch tốc độ phía SAU cú đâm phản đòn (ngược với lướt: vạch nằm sau lưng theo hướng nhìn). */
  private spawnSpeedLinesForward() {
    for (const offsetY of [-100, -72, -44]) {
      const line = this.scene.add
        .image(this.body.center.x - this.facing * 30, this.body.bottom + offsetY, ATLAS, 'effect_shotLarge')
        .setTint(COUNTER_RED)
        .setDepth(DEPTH_PLAYER - 2);
      this.scene.tweens.add({ targets: line, scaleX: 0, alpha: 0, duration: 220, ease: 'Quad.Out', onComplete: () => line.destroy() });
    }
  }

  /** Bụi: một cụm tròn phình ra, bay lên chút rồi tan. */
  private spawnDust(x: number, y: number, scale: number) {
    const dust = this.scene.add.image(x, y - 10, ATLAS, 'effect_blast').setScale(scale * 0.5).setDepth(DEPTH_PLAYER + 1);
    this.scene.tweens.add({ targets: dust, scale, y: y - 30, alpha: 0, duration: 320, ease: 'Quad.Out', onComplete: () => dust.destroy() });
  }

  /** Chớp trắng thân người; đếm bằng update nên đứng hình bao lâu thì trắng bấy lâu. */
  private flash() {
    this.flashTimer = 90;
    this.torso.setTintFill(0xffffff);
  }

  /** Squash & stretch: méo hình ngay lập tức rồi đàn hồi về dáng cũ. */
  private squash(scaleX: number, scaleY: number, duration = 160) {
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setScale(scaleX, scaleY);
    this.scene.tweens.add({ targets: this.visual, scaleX: 1, scaleY: 1, duration, ease: 'Quad.Out' });
  }

  // ===========================================================================
  // Procedural animation: tính tư thế từ trạng thái + vận tốc, mỗi frame
  // ===========================================================================

  /** Góc kiếm (độ, hệ "quay mặt sang phải") => radian trong hệ của container, có tính hướng nhìn. */
  private toLocalRad(deg: number) {
    return Phaser.Math.DegToRad(this.facing > 0 ? deg : 180 - deg); // quay trái = soi gương
  }

  private animate() {
    if (this.hitStop.active) return; // đứng hình: giữ nguyên tư thế

    const dt = this.scene.game.loop.delta / 1000;
    const t = this.scene.time.now / 1000;
    const state = this.fsm.current;
    const vx = this.body.velocity.x;
    const speed01 = Math.min(1, Math.abs(vx) / RUN_SPEED);
    // Làm mượt theo hàm mũ 1 - e^(-dt × tốc độ): kết quả như nhau dù máy chạy 30 hay 144 FPS
    const k = 1 - Math.exp(-dt * 20);

    this.visual.setPosition(this.hitbox.x, this.hitbox.y + HITBOX_H / 2);
    if (state === 'dead') return; // đang diễn cảnh ngã (tween lo góc + độ mờ): chỉ bám theo thân

    // Đổ người theo hướng chạy (khi lướt vận tốc rất lớn nên giới hạn góc); bị đánh thì bật ngửa ra sau
    this.visual.angle = state === 'hurt' ? this.hitDirection * 14 : Phaser.Math.Clamp((vx / RUN_SPEED) * 6, -12, 12);
    // Đang miễn nhiễm sau khi trúng đòn: nhấp nháy để người chơi biết mình "an toàn" bao lâu
    const blinking = this.invulnTimer > 0 && state !== 'dash';
    this.visual.setAlpha(blinking && Math.floor(this.scene.time.now / 70) % 2 === 0 ? 0.35 : 1);

    // Chu kỳ bước chạy: chạy càng nhanh, chân "bước" càng dồn dập
    if (state === 'run') this.runPhase += dt * 14 * speed01;
    const step = Math.sin(this.runPhase);

    // Thân: nhún lên mỗi bước khi chạy, phập phồng nhẹ khi đứng (thở)
    const bob = state === 'run' ? -Math.abs(step) * 8 : 0;
    const breathe = state === 'idle' ? Math.sin(t * 3) * 0.02 : 0;
    this.torso.setY(bob).setScale(1, 1 + breathe);

    const f = this.facing;
    let front: Point;
    let back: Point;
    // Thủ thế và dán bùa là phản xạ: tư thế phải "bật" ngay, không trượt mềm từ từ như các tư thế khác
    const kPose = state === 'parry' || state === 'talisman' || state === 'counter' ? 1 - Math.exp(-dt * 45) : k;
    const counterThrusting = state === 'counter' && this.fsm.timeInState >= COUNTER_MOVE.startup;

    if (state === 'attack') {
      // Góc kiếm tính thẳng từ thời gian trong đòn (không làm mượt): vung phải đúng nhịp frame data
      const atk = this.attack;
      const tt = this.fsm.timeInState;
      if (tt < atk.startup) this.swordAngle = Phaser.Math.Linear(this.swingStartAngle, atk.swingFrom, easeOutCubic(tt / atk.startup));
      else if (tt < atk.startup + atk.active) this.swordAngle = Phaser.Math.Linear(atk.swingFrom, atk.swingTo, easeOutCubic((tt - atk.startup) / atk.active));
      else this.swordAngle = atk.swingTo;
      // Tay cầm kiếm chạy trên một cung tròn quanh vai, theo đúng góc kiếm
      const a = this.toLocalRad(this.swordAngle);
      front = { x: SHOULDER.x * f + Math.cos(a) * HAND_RADIUS, y: SHOULDER.y + Math.sin(a) * HAND_RADIUS };
      back = { x: -f * 30, y: -62 };
      this.frontHand.setPosition(front.x, front.y);
    } else {
      // Ngoài lúc chém: kiếm và tay trượt về tư thế nghỉ của từng trạng thái
      let swordTarget = SWORD_REST[state];
      if (state === 'parry' && this.deflected) swordTarget = -35; // đỡ được: hất kiếm tới trước
      if (state === 'counter') swordTarget = counterThrusting ? 0 : 170; // rút kiếm ra sau lưng, rồi đâm thẳng tới
      this.swordAngle += (swordTarget - this.swordAngle) * kPose;
      switch (state) {
        case 'parry': // dựng kiếm chắn trước mặt, tay sau đỡ sống kiếm; đỡ được thì đẩy kiếm tới
          front = this.deflected ? { x: f * 56, y: -86 } : { x: f * 36, y: -78 };
          back = { x: f * 12, y: -64 };
          break;
        case 'counter': // lấy đà: tay kiếm kéo về sau hông; đâm: duỗi thẳng tay ra trước
          front = counterThrusting ? { x: f * 76, y: -74 } : { x: -f * 8, y: -70 };
          back = { x: -f * 36, y: -64 };
          break;
        case 'talisman': { // kiếm thu về, tay trái rút ra sau rồi vươn thẳng tới dán bùa
          const reached = this.fsm.timeInState >= TALISMAN_MOVE.startup;
          front = { x: -f * 10, y: -56 };
          back = reached ? { x: f * 80, y: -76 } : { x: -f * 40, y: -70 };
          break;
        }
        case 'run': // hai tay vung ngược chiều nhau theo bước chạy
          front = { x: f * (44 + step * 16), y: -52 - Math.abs(step) * 6 };
          back = { x: -f * (40 + step * 16), y: -50 };
          break;
        case 'jump': // giơ tay lên khi bật nhảy
          front = { x: f * 50, y: -96 };
          back = { x: -f * 46, y: -88 };
          break;
        case 'fall': // dang tay giữ thăng bằng khi rơi
          front = { x: f * 60, y: -104 };
          back = { x: -f * 56, y: -98 };
          break;
        case 'dash': // cả hai tay bị gió hất ra sau
          front = { x: -f * 24, y: -74 };
          back = { x: -f * 60, y: -64 };
          break;
        case 'hurt': // tay vung loạn xạ khi bị hất văng
          front = { x: this.hitDirection * 40, y: -110 };
          back = { x: this.hitDirection * 70, y: -96 };
          break;
        default: // đứng: tay lắc lư nhẹ
          front = { x: f * 46, y: -54 + Math.sin(t * 3) * 3 };
          back = { x: -f * 42, y: -52 + Math.sin(t * 3 + 1) * 3 };
      }
      this.frontHand.setPosition(this.frontHand.x + (front.x - this.frontHand.x) * kPose, this.frontHand.y + (front.y - this.frontHand.y) * kPose);
    }
    this.backHand.setPosition(this.backHand.x + (back.x - this.backHand.x) * kPose, this.backHand.y + (back.y - this.backHand.y) * kPose);

    // Kiếm luôn nằm trong tay trước; sprite kiếm vẽ mũi hướng lên nên xoay thêm 90°
    this.sword.setPosition(this.frontHand.x, this.frontHand.y).setRotation(this.toLocalRad(this.swordAngle) + Math.PI / 2).setFlipX(f < 0);
    // Kiếm loé vàng đúng trong cửa sổ đỡ hoàn hảo: người chơi NHÌN THẤY cửa sổ dài bao nhiêu
    // Kiếm loé đỏ trong khung phản đòn: hai cửa sổ thời gian, hai màu, không lẫn được
    if (this.inPerfectWindow) this.sword.setTintFill(QI_GOLD);
    else if (this.inCounterWindow) this.sword.setTintFill(COUNTER_RED);
    else this.sword.clearTint();
  }

  // ===========================================================================
  // Đọc phím: mỗi hành động gán được nhiều phím
  // ===========================================================================

  private anyDown(keys: Phaser.Input.Keyboard.Key[]) {
    return keys.some((k) => k.isDown);
  }

  private anyJustDown(keys: Phaser.Input.Keyboard.Key[]) {
    // Không dùng .some(): JustDown "tiêu thụ" trạng thái phím, phải gọi đủ cho mọi phím
    return keys.map((k) => Phaser.Input.Keyboard.JustDown(k)).includes(true);
  }

  private anyJustUp(keys: Phaser.Input.Keyboard.Key[]) {
    return keys.map((k) => Phaser.Input.Keyboard.JustUp(k)).includes(true);
  }
}
