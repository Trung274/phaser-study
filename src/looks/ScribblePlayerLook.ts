import Phaser from 'phaser';
import { ATLAS } from '../config';
import { drawSlash } from '../combat/hitEffects';
import type { PlayerState } from '../player/Player';
import { PLAYER_DEPTH, type PlayerLook, type PlayerView } from './PlayerLook';

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
  special: -50,
  counter: 0,  // (tư thế phản đòn tính riêng theo pha, xem update)
};
const PLAYER_GREEN = 0x39d98d;           // màu thân nhân vật (lấy mẫu từ sprite)
const QI_GOLD = 0xf2c94c;                // kiếm loé vàng trong cửa sổ đỡ hoàn hảo
const COUNTER_RED = 0xff5a5a;            // kiếm loé đỏ trong khung phản đòn
// Frame thân 128×128, phần có hình kết thúc ở y=124 => chân ở 125/128 chiều cao frame
const BODY_FEET_ORIGIN_Y = 125 / 128;

type Point = { x: number; y: number };

const easeOutCubic = (t: number) => 1 - Math.pow(1 - Phaser.Math.Clamp(t, 0, 1), 3);

/**
 * Bộ da Scribble: thân + hai bàn tay + kiếm lấy từ atlas.
 * Bộ Scribble không có animation khung hình, nên chuyển động được "diễn" bằng code (procedural animation):
 * thân nhún, tay vung, kiếm xoay, tất cả tính từ trạng thái + vận tốc mỗi frame.
 */
export class ScribblePlayerLook implements PlayerLook {
  private readonly scene: Phaser.Scene;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly frontHand: Phaser.GameObjects.Image;
  private readonly backHand: Phaser.GameObjects.Image;
  private readonly sword: Phaser.GameObjects.Image;

  private facing: 1 | -1 = 1;
  private runPhase = 0;         // góc (radian) của chu kỳ bước chạy
  private swordAngle = SWORD_REST.idle;
  private swingStartAngle = SWORD_REST.idle;
  private lastSwingId = -1;
  private flashTimer = 0;
  private flashFresh = false;   // vừa chớp trong frame này: frame sau mới bắt đầu đếm

  /** (x, feetY) là vị trí CHÂN nhân vật. */
  constructor(scene: Phaser.Scene, x: number, feetY: number) {
    this.scene = scene;
    // Gốc của visual đặt ở CHÂN: co giãn khi tiếp đất thì chân vẫn bám sàn.
    // Thứ tự trong container = thứ tự vẽ: tay sau, thân, kiếm, tay trước (tay nắm đè lên chuôi).
    this.backHand = scene.add.image(-40, -52, ATLAS, 'character_handGreen');
    this.torso = scene.add.image(0, 0, ATLAS, 'character_roundGreen').setOrigin(0.5, BODY_FEET_ORIGIN_Y);
    this.sword = scene.add.image(46, -54, ATLAS, 'item_sword').setOrigin(0.5, SWORD_ORIGIN_Y).setScale(SWORD_SCALE);
    this.frontHand = scene.add.image(46, -54, ATLAS, 'character_handGreen');
    this.visual = scene.add.container(x, feetY, [this.backHand, this.torso, this.sword, this.frontHand]).setDepth(PLAYER_DEPTH);
  }

  /** Chớp trắng thân người; đếm bằng update nên đứng hình bao lâu thì trắng bấy lâu. */
  flash(ms: number) {
    this.flashTimer = ms;
    this.flashFresh = true;
    this.torso.setTintFill(0xffffff);
  }

  /** Squash & stretch: méo hình ngay lập tức rồi đàn hồi về dáng cũ. */
  squash(scaleX: number, scaleY: number, duration: number) {
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setScale(scaleX, scaleY);
    this.scene.tweens.add({ targets: this.visual, scaleX: 1, scaleY: 1, duration, ease: 'Quad.Out' });
  }

  /** Bóng mờ: bản sao thân nhân vật tô một màu, đứng yên tại chỗ rồi mờ dần. */
  afterimage() {
    const ghost = this.scene.add
      .image(this.visual.x, this.visual.y, ATLAS, 'character_roundGreen')
      .setOrigin(0.5, BODY_FEET_ORIGIN_Y)
      .setScale(this.visual.scaleX, this.visual.scaleY)
      .setAngle(this.visual.angle)
      .setTintFill(PLAYER_GREEN)
      .setAlpha(0.45)
      .setDepth(PLAYER_DEPTH - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
  }

  /** Vệt chém vẽ bên trong container nhân vật (ngay sau thân, trước kiếm) nên đi theo người khi lao tới. */
  swing(view: PlayerView) {
    this.facing = view.facing;
    const from = this.toLocalRad(view.attack.swingFrom);
    const to = this.toLocalRad(view.attack.swingTo);
    const slash = drawSlash(this.scene, from, to, SLASH_RADIUS, view.attack.power);
    slash.setPosition(SHOULDER.x * view.facing, SHOULDER.y);
    this.visual.addAt(slash, this.visual.getIndex(this.sword));
  }

  /** Ngã ngửa về phía bị đánh (container gốc ở chân nên xoay quanh bàn chân). */
  die(hitDirection: 1 | -1) {
    this.scene.tweens.killTweensOf(this.visual);
    this.scene.tweens.add({ targets: this.visual, angle: hitDirection * 90, scaleX: 1, scaleY: 1, alpha: 0.6, duration: 500, ease: 'Bounce.Out' });
  }

  // ===========================================================================
  // Procedural animation: tính tư thế từ trạng thái + vận tốc, mỗi frame
  // ===========================================================================

  update(view: PlayerView, frozen: boolean) {
    if (frozen) {
      this.flashFresh = false;
      return; // đứng hình: giữ nguyên tư thế
    }
    const delta = this.scene.game.loop.delta;
    this.tickFlash(delta);

    const dt = delta / 1000;
    const t = this.scene.time.now / 1000;
    const state = view.state;
    const speed01 = Math.min(1, Math.abs(view.runRatio));
    // Làm mượt theo hàm mũ 1 - e^(-dt × tốc độ): kết quả như nhau dù máy chạy 30 hay 144 FPS
    const k = 1 - Math.exp(-dt * 20);
    this.facing = view.facing;

    this.visual.setPosition(view.x, view.feetY);
    if (state === 'dead') return; // đang diễn cảnh ngã (tween lo góc + độ mờ): chỉ bám theo thân

    // Đổ người theo hướng chạy (khi lướt vận tốc rất lớn nên giới hạn góc); bị đánh thì bật ngửa ra sau
    this.visual.angle = state === 'hurt' ? view.hitDirection * 14 : Phaser.Math.Clamp(view.runRatio * 6, -12, 12);
    // Đang miễn nhiễm sau khi trúng đòn: nhấp nháy để người chơi biết mình "an toàn" bao lâu
    this.visual.setAlpha(view.blinking && Math.floor(this.scene.time.now / 70) % 2 === 0 ? 0.35 : 1);

    // Chu kỳ bước chạy: chạy càng nhanh, chân "bước" càng dồn dập
    if (state === 'run') this.runPhase += dt * 14 * speed01;
    const step = Math.sin(this.runPhase);

    // Thân: nhún lên mỗi bước khi chạy, phập phồng nhẹ khi đứng (thở)
    const bob = state === 'run' ? -Math.abs(step) * 8 : 0;
    const breathe = state === 'idle' ? Math.sin(t * 3) * 0.02 : 0;
    this.torso.setY(bob).setScale(1, 1 + breathe);

    const f = view.facing;
    let front: Point;
    let back: Point;
    // Thủ thế, chiêu đặc biệt, phản đòn là phản xạ: tư thế phải "bật" ngay, không trượt mềm từ từ như các tư thế khác
    const kPose = state === 'parry' || state === 'special' || state === 'counter' ? 1 - Math.exp(-dt * 45) : k;
    const pastStartup = view.move !== null && view.timeInState >= view.move.startup;

    if (state === 'attack') {
      // Nhát mới: kiếm bắt đầu vung từ chỗ nó đang nằm (có thể là cuối nhát trước)
      if (view.swingId !== this.lastSwingId) {
        this.lastSwingId = view.swingId;
        this.swingStartAngle = this.swordAngle;
      }
      // Góc kiếm tính thẳng từ thời gian trong đòn (không làm mượt): vung phải đúng nhịp frame data
      const atk = view.attack;
      const tt = view.timeInState;
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
      if (state === 'parry' && view.deflected) swordTarget = -35; // đỡ được: hất kiếm tới trước
      if (state === 'counter') swordTarget = pastStartup ? 0 : 170; // rút kiếm ra sau lưng, rồi đâm thẳng tới
      this.swordAngle += (swordTarget - this.swordAngle) * kPose;
      switch (state) {
        case 'parry': // dựng kiếm chắn trước mặt, tay sau đỡ sống kiếm; đỡ được thì đẩy kiếm tới
          front = view.deflected ? { x: f * 56, y: -86 } : { x: f * 36, y: -78 };
          back = { x: f * 12, y: -64 };
          break;
        case 'counter': // lấy đà: tay kiếm kéo về sau hông; đâm: duỗi thẳng tay ra trước
          front = pastStartup ? { x: f * 76, y: -74 } : { x: -f * 8, y: -70 };
          back = { x: -f * 36, y: -64 };
          break;
        case 'special': // kiếm thu về, tay trái rút ra sau rồi vươn thẳng tới (dán bùa)
          front = { x: -f * 10, y: -56 };
          back = pastStartup ? { x: f * 80, y: -76 } : { x: -f * 40, y: -70 };
          break;
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
          front = { x: view.hitDirection * 40, y: -110 };
          back = { x: view.hitDirection * 70, y: -96 };
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
    if (view.perfectWindow) this.sword.setTintFill(QI_GOLD);
    else if (view.counterWindow) this.sword.setTintFill(COUNTER_RED);
    else this.sword.clearTint();
  }

  private tickFlash(delta: number) {
    if (this.flashFresh) {
      this.flashFresh = false;
      return;
    }
    if (this.flashTimer <= 0) return;
    this.flashTimer -= delta;
    if (this.flashTimer <= 0) this.torso.clearTint();
  }

  /** Góc kiếm (độ, hệ "quay mặt sang phải") => radian trong hệ của container, có tính hướng nhìn. */
  private toLocalRad(deg: number) {
    return Phaser.Math.DegToRad(this.facing > 0 ? deg : 180 - deg); // quay trái = soi gương
  }
}
