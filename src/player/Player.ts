import Phaser from 'phaser';
import { GRAVITY, TILE } from '../config';
import { StateMachine } from '../core/StateMachine';
import { COMBO, type AttackDef } from '../combat/attacks';
import { fxStyle } from '../combat/fxStyle';
import type { SpecialDef } from '../combat/specials';
import type { DefenseResult, HitInfo, Strike } from '../combat/types';
import type { HitStop } from '../combat/HitStop';
import type { Sfx } from '../audio/Sfx';
import { PLAYER_DEPTH, type MoveTiming, type PlayerLook, type PlayerView } from '../looks/PlayerLook';

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
const FLASH_TIME = 90;                   // ms chớp trắng khi trúng đòn

// --- Đỡ đòn (parry) ---
//   |-- PERFECT_WINDOW --|------ đỡ thường ------|   (hết PARRY_TIME mà không đỡ trúng gì => phải chờ cooldown)
const PARRY_TIME = 320;                  // ms giữ thế đỡ
const PERFECT_WINDOW = 160;              // ms đầu: đỡ hoàn hảo (gạt văng đòn, không mất gì, +1 Qi)
const PARRY_WHIFF_COOLDOWN = 300;        // đỡ hụt => chờ chừng này mới đỡ lại được: chống bấm đỡ liên tục
const PARRY_BUFFER = 80;                 // ms: bấm đỡ hơi sớm (đang thu kiếm) vẫn được tính, nhưng ngắn để giữ độ chính xác
const BLOCK_PUSHBACK = 2.5 * TILE;       // đỡ thường bị đẩy lùi nhẹ

// --- Phản đòn (counter): khắc chế ĐÒN ĐỎ ---
//   |-- startup --|------ active: đâm kiếm lao tới ------|---- recovery ----|
//   |<------- khung phản đòn: đòn ĐỎ chạm vào lúc này = PHẢN ĐÒN ------->|
// Chỉ khắc chế đòn đỏ. Đòn thường đâm trúng lúc đang phản đòn thì vẫn trúng => phải nhìn màu mà chọn nút.
const COUNTER_MOVE: MoveTiming = { startup: 60, active: 150, recovery: 380 };
const COUNTER_LUNGE = (1.2 * TILE) / (150 / 1000); // lao 1.2 ô trong pha active
const COUNTER_HITBOX = { x: 0, y: -115, w: 200, h: 80 };
const COUNTER_WHIFF_COOLDOWN = 600;      // phản đòn hụt => phạt nặng hơn đỡ hụt
const COUNTER_RED = 0xff5a5a;            // vệt tốc độ đỏ khi lao tới phản đòn

// --- Nội thương: máu "tạm mất" khi đỡ thường ---
const INTERNAL_HEAL_DELAY = 2500;        // ms không bị đánh thì nội thương bắt đầu lành
const INTERNAL_HEAL_INTERVAL = 1200;     // rồi mỗi chừng này ms lành 1 tim

// --- Qi: tích được khi đỡ hoàn hảo / phản đòn, tiêu vào chiêu đặc biệt ---
export const PLAYER_MAX_QI = 3;

// Thân hình rộng ~82px, cao ~124px. Hitbox nhỏ hơn hình một chút => né sát vẫn không bị tính trúng
const HITBOX_W = 60;
const HITBOX_H = 112;

export type PlayerState = 'idle' | 'run' | 'jump' | 'fall' | 'dash' | 'attack' | 'parry' | 'special' | 'counter' | 'hurt' | 'dead';

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
  specialPressed: boolean;
  counterPressed: boolean;
}

export interface PlayerDeps {
  sfx: Sfx;
  hitStop: HitStop;
  /** Bộ da: toàn bộ phần nhìn thấy của nhân vật. */
  look: PlayerLook;
  /** Chiêu đặc biệt tốn Qi của chế độ chơi này (dán bùa, bắn cung...). */
  special: SpecialDef;
}

/** Tiến `current` về `target`, mỗi lần không quá `maxDelta`. */
function moveTowards(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/**
 * Nhân vật chính, chỉ gồm LOGIC. Tách làm hai phần:
 * - hitbox: hình chữ nhật VÔ HÌNH mang thân vật lý. Va chạm chỉ dựa vào nó.
 * - look ("bộ da"): mọi thứ nhìn thấy. Player báo trạng thái mỗi frame và gọi bộ da đúng lúc
 *   (vung kiếm, trúng đòn...), còn vẽ ra sao là việc của bộ da. Đổi bộ da = đổi hình, luật chơi giữ nguyên.
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
  /** Tăng mỗi lần bấm chiêu đặc biệt mà không đủ Qi: HUD thấy số này đổi thì rung các ô Qi. */
  qiDeniedCount = 0;

  private readonly scene: Phaser.Scene;
  private readonly sfx: Sfx;
  private readonly hitStop: HitStop;
  private readonly look: PlayerLook;
  private readonly special: SpecialDef;
  private readonly fsm: StateMachine<PlayerState>;

  private input: FrameInput = {
    moveX: 0, down: false, jumpPressed: false, jumpReleased: false,
    dashPressed: false, attackPressed: false, parryPressed: false, specialPressed: false, counterPressed: false,
  };
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private airVelocityY = 0;     // vận tốc rơi ngay trước khi chạm đất, để biết đáp mạnh hay nhẹ
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

  private invulnTimer = 0;
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
  private readonly specialKeys: Phaser.Input.Keyboard.Key[];
  private readonly counterKeys: Phaser.Input.Keyboard.Key[];

  /** (x, feetY) là vị trí CHÂN nhân vật. */
  constructor(scene: Phaser.Scene, x: number, feetY: number, deps: PlayerDeps) {
    this.scene = scene;
    this.sfx = deps.sfx;
    this.hitStop = deps.hitStop;
    this.look = deps.look;
    this.special = deps.special;

    this.hitbox = scene.add.rectangle(x, feetY - HITBOX_H / 2, HITBOX_W, HITBOX_H).setVisible(false);
    scene.physics.add.existing(this.hitbox);
    this.body = this.hitbox.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocityY(MAX_FALL_SPEED);

    const keyboard = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.leftKeys = [keyboard.addKey(K.LEFT), keyboard.addKey(K.A)];
    this.rightKeys = [keyboard.addKey(K.RIGHT), keyboard.addKey(K.D)];
    this.downKeys = [keyboard.addKey(K.DOWN), keyboard.addKey(K.S)];
    this.jumpKeys = [keyboard.addKey(K.SPACE), keyboard.addKey(K.UP), keyboard.addKey(K.W)];
    this.dashKeys = [keyboard.addKey(K.SHIFT), keyboard.addKey(K.L)];
    this.attackKeys = [keyboard.addKey(K.J), keyboard.addKey(K.X)];
    this.parryKeys = [keyboard.addKey(K.K), keyboard.addKey(K.C)];
    this.specialKeys = [keyboard.addKey(K.I), keyboard.addKey(K.V)];
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
        special: { enter: () => this.enterSpecial(), update: (d) => this.updateSpecial(d) },
        counter: { enter: () => this.enterCounter(), update: (d) => this.updateCounter(d), exit: () => this.exitCounter() },
        hurt: { enter: () => this.enterHurt(), update: (d) => this.updateHurt(d) },
        dead: { enter: () => this.enterDead(), update: (d) => this.updateDead(d) },
      },
      'idle',
    );

    // Physics ghi vị trí mới vào hitbox ở bước POST_UPDATE, SAU scene.update().
    // Cập nhật bộ da cũng ở POST_UPDATE (đăng ký sau physics nên chạy sau) => hình không trễ 1 frame so với thân.
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncLook, this);
    // Restart scene thì gỡ listener, nếu không nó vẫn gọi vào object đã bị huỷ
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncLook, this);
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

  /** Đang trong cửa sổ đỡ hoàn hảo? (bộ da loé vàng) */
  get inPerfectWindow() {
    return this.fsm.current === 'parry' && this.fsm.timeInState <= PERFECT_WINDOW;
  }

  /** Đang trong khung phản đòn? (bộ da loé đỏ) */
  get inCounterWindow() {
    return this.fsm.current === 'counter' && this.fsm.timeInState < COUNTER_MOVE.startup + COUNTER_MOVE.active;
  }

  /** Lưỡi kiếm (hoặc chiêu đặc biệt) đang trong pha active thì trả về vùng tác động, ngoài ra trả về null. */
  activeStrike(): Strike | null {
    if (this.fsm.current === 'counter') {
      const t = this.fsm.timeInState;
      if (t < COUNTER_MOVE.startup || t >= COUNTER_MOVE.startup + COUNTER_MOVE.active) return null;
      return {
        rect: this.strikeRect(COUNTER_HITBOX),
        swingId: this.swingId,
        direction: this.facing,
        damage: 8,
        power: 0.6,
        hitStop: 70,
      };
    }
    if (this.fsm.current === 'special') {
      // Chiêu đặc biệt không gây sát thương tại chỗ: GameScene đọc `effect` để dán bùa / bắn mũi tên
      const sp = this.special;
      const t = this.fsm.timeInState;
      if (t < sp.startup || t >= sp.startup + sp.active) return null;
      return {
        rect: this.strikeRect(sp.hitbox),
        swingId: this.swingId,
        direction: this.facing,
        damage: 0,
        power: 0.4,
        hitStop: 50,
        effect: sp.kind,
      };
    }
    if (this.fsm.current !== 'attack') return null;
    const atk = this.attack;
    const t = this.fsm.timeInState;
    if (t < atk.startup || t >= atk.startup + atk.active) return null;
    return {
      rect: this.strikeRect(atk.hitbox),
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
      this.look.flash(FLASH_TIME);
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
    this.look.flash(FLASH_TIME);
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

    if (this.tryParry() || this.tryCounter() || this.tryDash() || this.trySpecial() || this.tryAttack()) return;
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
    this.look.squash(0.8, 1.2, 160); // vươn dài người lúc bật lên
  }

  /** jump + fall: đang ở trên không. */
  private updateAir(delta: number) {
    const body = this.body;
    const input = this.input;

    if (this.tryParry() || this.tryCounter() || this.tryDash() || this.trySpecial() || this.tryAttack()) return;
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
    this.look.squash(1.35, 0.8, DASH_TIME);
    this.spawnSpeedLines();
    if (onGround) this.spawnDust(this.body.center.x - this.dashDir * 30, this.body.bottom, 0.45);
    this.sfx.dash();
  }

  private updateDash(delta: number) {
    const body = this.body;
    body.setVelocity(this.dashDir * DASH_SPEED, 0);

    this.afterimageTimer -= delta;
    if (this.afterimageTimer <= 0) {
      this.look.afterimage();
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
      this.look.swing(this.view());
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

    // Đã chặn được đòn thì được huỷ thế đỡ ngay: phản công, ra chiêu đặc biệt, hoặc lướt đi
    if (this.parryContact && (this.tryAttack() || this.trySpecial() || this.tryDash())) return;

    if (this.fsm.timeInState >= PARRY_TIME) this.fsm.transition(body.blocked.down ? 'idle' : 'fall');
  }

  private exitParry() {
    // Thủ thế suông mà không có đòn nào tới => bị phạt: một lúc sau mới đỡ lại được
    if (!this.parryContact) this.parryCooldown = PARRY_WHIFF_COOLDOWN;
  }

  private enterSpecial() {
    this.qi--; // tốn Qi ngay khi ra chiêu, kể cả trượt: dùng chiêu là một quyết định có rủi ro
    this.swingId++;
    this.swingStarted = false;
    const body = this.body;
    body.setGravityY(0);
    if (!body.blocked.down && body.velocity.y > 0) body.setVelocityY(body.velocity.y * AIR_ATTACK_HANG);
  }

  private updateSpecial(delta: number) {
    const sp = this.special;
    const body = this.body;
    const t = this.fsm.timeInState;
    const activeEnd = sp.startup + sp.active;
    body.setVelocityX(moveTowards(body.velocity.x, 0, GROUND_DECEL * (delta / 1000)));
    if (!body.blocked.down) this.airVelocityY = body.velocity.y;

    if (!this.swingStarted && t >= sp.startup) {
      this.swingStarted = true;
      if (sp.swingSound !== undefined) this.sfx.swing(sp.swingSound);
    }
    if (t >= activeEnd && (this.tryParry() || this.tryDash())) return;
    if (t >= activeEnd + sp.recovery) this.fsm.transition(body.blocked.down ? 'idle' : 'fall');
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
    if (this.counterLanded && (this.tryAttack() || this.trySpecial() || this.tryDash())) return;
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
    this.look.flash(FLASH_TIME);
    this.look.squash(1.25, 0.8, 160);
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
    this.look.flash(FLASH_TIME);
    this.look.die(this.hitDirection);
  }

  /** Ngã xuống rồi thì trượt chậm lại và nằm yên (không có dòng này xác sẽ trượt mãi vì Arcade không có ma sát). */
  private updateDead(delta: number) {
    if (this.body.blocked.down) this.body.setVelocityX(moveTowards(this.body.velocity.x, 0, GROUND_DECEL * 0.25 * (delta / 1000)));
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
      specialPressed: this.anyJustDown(this.specialKeys),
      counterPressed: this.anyJustDown(this.counterKeys),
    };
  }

  /** Vùng tác động của một đòn (khai báo khi quay mặt sang PHẢI, tính từ chân) => toạ độ thế giới, có tính hướng nhìn. */
  private strikeRect(hb: { x: number; y: number; w: number; h: number }) {
    const x = this.facing > 0 ? this.body.center.x + hb.x : this.body.center.x - hb.x - hb.w;
    return new Phaser.Geom.Rectangle(x, this.body.bottom + hb.y, hb.w, hb.h);
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

  /** Chiêu đặc biệt: cần ít nhất 1 Qi. Thiếu Qi thì kêu "xì" và báo HUD rung ô Qi. */
  private trySpecial() {
    if (!this.input.specialPressed) return false;
    if (this.qi < 1) {
      this.qiDeniedCount++;
      this.sfx.fizzle();
      return false;
    }
    this.fsm.transition('special');
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
    this.look.squash(Phaser.Math.Linear(1.05, 1.3, impact), Phaser.Math.Linear(0.95, 0.7, impact), 160);
    this.sfx.land(impact);
    if (impact > 0.45) {
      const scale = Phaser.Math.Linear(0.3, 0.55, impact);
      this.spawnDust(this.body.center.x - 34, this.body.bottom, scale);
      this.spawnDust(this.body.center.x + 34, this.body.bottom, scale);
    }
  }

  // ===========================================================================
  // Hiệu ứng (juice) dùng chung mọi bộ da: ảnh lấy từ phong cách hiệu ứng của chế độ đang chơi
  // ===========================================================================

  /** Vệt tốc độ: vài vạch ngang ở lại phía sau, co ngắn rồi biến mất. */
  private spawnSpeedLines() {
    const texture = fxStyle(this.scene).texture;
    for (const offsetY of [-90, -55, -25]) {
      const line = this.scene.add
        .image(this.body.center.x - this.dashDir * 40, this.body.bottom + offsetY + Phaser.Math.Between(-6, 6), texture, 'effect_shotLarge')
        .setScale(Phaser.Math.FloatBetween(0.7, 1.1), 1)
        .setDepth(PLAYER_DEPTH - 2);
      this.scene.tweens.add({ targets: line, scaleX: 0, alpha: 0, duration: Phaser.Math.Between(180, 260), ease: 'Quad.Out', onComplete: () => line.destroy() });
    }
  }

  /** Vạch tốc độ phía SAU cú đâm phản đòn (ngược với lướt: vạch nằm sau lưng theo hướng nhìn). */
  private spawnSpeedLinesForward() {
    const texture = fxStyle(this.scene).texture;
    for (const offsetY of [-100, -72, -44]) {
      const line = this.scene.add
        .image(this.body.center.x - this.facing * 30, this.body.bottom + offsetY, texture, 'effect_shotLarge')
        .setTint(COUNTER_RED)
        .setDepth(PLAYER_DEPTH - 2);
      this.scene.tweens.add({ targets: line, scaleX: 0, alpha: 0, duration: 220, ease: 'Quad.Out', onComplete: () => line.destroy() });
    }
  }

  /** Bụi: một cụm tròn phình ra, bay lên chút rồi tan. */
  private spawnDust(x: number, y: number, scale: number) {
    const dust = this.scene.add.image(x, y - 10, fxStyle(this.scene).texture, 'effect_blast').setScale(scale * 0.5).setDepth(PLAYER_DEPTH + 1);
    this.scene.tweens.add({ targets: dust, scale, y: y - 30, alpha: 0, duration: 320, ease: 'Quad.Out', onComplete: () => dust.destroy() });
  }

  // ===========================================================================
  // Gửi trạng thái cho bộ da
  // ===========================================================================

  private syncLook() {
    this.look.update(this.view(), this.hitStop.active);
  }

  /** Frame data của động tác đang ra, để bộ da biết lúc nào là lấy đà, lúc nào là chém trúng. */
  private currentMove(): MoveTiming | null {
    switch (this.fsm.current) {
      case 'attack': return this.attack;
      case 'special': return this.special;
      case 'counter': return COUNTER_MOVE;
      default: return null;
    }
  }

  private view(): PlayerView {
    return {
      x: this.hitbox.x,
      feetY: this.hitbox.y + HITBOX_H / 2,
      state: this.fsm.current,
      timeInState: this.fsm.timeInState,
      facing: this.facing,
      runRatio: this.body.velocity.x / RUN_SPEED,
      hitDirection: this.hitDirection,
      blinking: this.invulnTimer > 0 && this.fsm.current !== 'dash',
      deflected: this.deflected,
      perfectWindow: this.inPerfectWindow,
      counterWindow: this.inCounterWindow,
      swingId: this.swingId,
      comboIndex: this.comboIndex,
      attack: this.attack,
      move: this.currentMove(),
    };
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
