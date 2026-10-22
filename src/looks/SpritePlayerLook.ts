import Phaser from 'phaser';
import { PLAYER_DEPTH, type PlayerLook, type PlayerView } from './PlayerLook';
import { movePhase, SpriteRig, type FrameRef, type PhasedAnim, type SpriteSheetDef } from './SpriteRig';

/**
 * Bảng "trạng thái người chơi → khung hình" của một nhân vật sprite sheet.
 * Thay nhân vật (vd. nhân vật tự vẽ hoặc tạo bằng AI) = nạp sheet mới + điền một bảng như thế này, không sửa code.
 */
export interface SpritePlayerDef extends SpriteSheetDef {
  /** Tag lặp do Phaser tự chạy. */
  idle: string;
  run: string;
  /** Tag chạy theo thời gian trong trạng thái. */
  hurt: string;
  death: string;
  /** Sheet không có sẵn chuyển động này: mượn một khung đứng yên. */
  jump: FrameRef;
  fall: FrameRef;
  dash: FrameRef;
  parry: FrameRef;
  /** Vừa đỡ hoàn hảo trong thế đỡ. */
  deflect: FrameRef;
  /** Mỗi nhát combo một animation, chia khung theo frame data của nhát đó (lặp lại nếu ít hơn số nhát). */
  combo: PhasedAnim[];
  counter: PhasedAnim;
  special: PhasedAnim;
  /** Màu bóng mờ khi lướt. */
  ghostColor: number;
}

const QI_GOLD = 0xf2c94c;      // viền vàng: cửa sổ đỡ hoàn hảo
const COUNTER_RED = 0xff5a5a;  // viền đỏ: khung phản đòn
/** Pixel art méo nhiều trông "vỡ hình": chỉ giữ 35% độ squash & stretch so với bộ Scribble. */
const SQUASH_AMOUNT = 0.35;

/**
 * Bộ da sprite sheet: animation vẽ sẵn từng khung (Tiny RPG Soldier...).
 * Không xoay, không nghiêng người như bộ Scribble: xoay pixel art làm các ô pixel bị méo, răng cưa.
 */
export class SpritePlayerLook implements PlayerLook {
  private readonly scene: Phaser.Scene;
  private readonly def: SpritePlayerDef;
  private readonly rig: SpriteRig;
  private flashTimer = 0;
  private flashFresh = false;

  constructor(scene: Phaser.Scene, x: number, feetY: number, def: SpritePlayerDef) {
    this.scene = scene;
    this.def = def;
    this.rig = new SpriteRig(scene, x, feetY, def, PLAYER_DEPTH);
    this.rig.loop(def.idle);
  }

  update(view: PlayerView, frozen: boolean) {
    const sprite = this.rig.sprite;
    if (frozen) this.flashFresh = false;
    else this.tickFlash(this.scene.game.loop.delta);

    sprite.setPosition(view.x, view.feetY);
    this.rig.face(view.facing);
    // Chọn khung kể cả lúc đứng hình: khung đứng yên phải là khung lưỡi kiếm đang chém trúng
    this.pose(view);

    if (this.flashTimer > 0) sprite.setTintFill(0xffffff);
    else sprite.clearTint();
    sprite.setAlpha(view.blinking && Math.floor(this.scene.time.now / 70) % 2 === 0 ? 0.35 : 1);
    // Cửa sổ đỡ hoàn hảo / khung phản đòn: viền vàng / đỏ quanh cả người (bộ Scribble chỉ tô màu thanh kiếm)
    this.rig.setOutline(view.perfectWindow ? QI_GOLD : view.counterWindow ? COUNTER_RED : null);
    this.rig.freeze(frozen);
  }

  flash(ms: number) {
    this.flashTimer = ms;
    this.flashFresh = true;
    this.rig.sprite.setTintFill(0xffffff);
  }

  squash(scaleX: number, scaleY: number, duration: number) {
    const base = this.def.scale;
    const sprite = this.rig.sprite;
    this.scene.tweens.killTweensOf(sprite);
    sprite.setScale(base * (1 + (scaleX - 1) * SQUASH_AMOUNT), base * (1 + (scaleY - 1) * SQUASH_AMOUNT));
    this.scene.tweens.add({ targets: sprite, scaleX: base, scaleY: base, duration, ease: 'Quad.Out' });
  }

  afterimage() {
    this.rig.ghost(this.def.ghostColor, 0.45, 220, PLAYER_DEPTH - 1);
  }

  /** Không cần vẽ vệt chém: khung hình trong sheet đã vẽ sẵn vệt chém. */
  swing() {}

  /** Cảnh chết là tag 'death', chạy theo thời gian trong trạng thái dead (xem pose). */
  die() {}

  private pose(view: PlayerView) {
    const { rig, def } = this;
    const t = view.timeInState;
    switch (view.state) {
      case 'idle':
        rig.loop(def.idle);
        break;
      case 'run': // chạy càng nhanh, bước càng dồn dập
        rig.loop(def.run, Phaser.Math.Linear(0.8, 1.6, Math.min(1, Math.abs(view.runRatio))));
        break;
      case 'jump':
        rig.hold(def.jump);
        break;
      case 'fall':
        rig.hold(def.fall);
        break;
      case 'dash':
        rig.hold(def.dash);
        break;
      case 'parry':
        rig.hold(view.deflected ? def.deflect : def.parry);
        break;
      case 'hurt':
        rig.atTime(def.hurt, t);
        break;
      case 'dead':
        rig.atTime(def.death, t);
        break;
      case 'attack':
        this.phased(def.combo[view.comboIndex % def.combo.length], view);
        break;
      case 'counter':
        this.phased(def.counter, view);
        break;
      case 'special':
        this.phased(def.special, view);
        break;
    }
  }

  /** Khung hình theo frame data của động tác đang ra: đúng pha active thì chiếu đúng khung "chém trúng". */
  private phased(anim: PhasedAnim, view: PlayerView) {
    if (!view.move) return;
    const { phase, progress } = movePhase(view.move, view.timeInState);
    this.rig.phase(anim, phase, progress);
  }

  private tickFlash(delta: number) {
    if (this.flashFresh) {
      this.flashFresh = false;
      return;
    }
    if (this.flashTimer > 0) this.flashTimer -= delta;
  }
}
