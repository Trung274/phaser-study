import Phaser from 'phaser';
import { ATLAS } from '../config';
import { lerpColor } from '../core/color';
import { DANGER_RED, ENEMY_DEPTH, type EnemyLook, type EnemyView } from './EnemyLook';

// item_spear 128×256, mũi hướng lên; cầm ở y=175 (khoảng 70% thân giáo), mũi ở y=12
const SPEAR_SCALE = 0.8;
const SPEAR_ORIGIN_Y = 175 / 256;
const SPEAR_REACH = (175 - 12) * SPEAR_SCALE;
const BODY_FEET_ORIGIN_Y = 125 / 128;

type Point = { x: number; y: number };

/** Bộ da Scribble của lính giáo: thân tím + hai tay + cây giáo, tư thế tính bằng code như ScribblePlayerLook. */
export class ScribbleEnemyLook implements EnemyLook {
  readonly weaponTip = { x: 8 + SPEAR_REACH, y: -66 };

  private readonly scene: Phaser.Scene;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly torso: Phaser.GameObjects.Image;
  private readonly frontHand: Phaser.GameObjects.Image;
  private readonly backHand: Phaser.GameObjects.Image;
  private readonly spear: Phaser.GameObjects.Image;
  private readonly redAura: Phaser.GameObjects.Image; // hào quang đỏ sau lưng khi chuẩn bị đòn đỏ

  private facing: 1 | -1 = -1;
  private spearAngle = -70; // độ, hệ "quay mặt sang phải"
  private flashTimer = 0;
  private flashFresh = false;

  /** (x, feetY) là vị trí CHÂN. */
  constructor(scene: Phaser.Scene, x: number, feetY: number) {
    this.scene = scene;
    this.backHand = scene.add.image(-30, -58, ATLAS, 'character_handPurple');
    this.torso = scene.add.image(0, 0, ATLAS, 'character_roundPurple').setOrigin(0.5, BODY_FEET_ORIGIN_Y);
    this.spear = scene.add.image(0, -60, ATLAS, 'item_spear').setOrigin(0.5, SPEAR_ORIGIN_Y).setScale(SPEAR_SCALE);
    this.frontHand = scene.add.image(30, -58, ATLAS, 'character_handPurple');
    this.redAura = scene.add.image(0, -62, ATLAS, 'effect_blastLarge').setTint(DANGER_RED).setAlpha(0);
    this.visual = scene.add.container(x, feetY, [this.redAura, this.backHand, this.torso, this.spear, this.frontHand]).setDepth(ENEMY_DEPTH);
  }

  flash(color: number, ms: number) {
    this.flashTimer = ms;
    this.flashFresh = true;
    this.torso.setTintFill(color);
  }

  afterimage(color: number) {
    const ghost = this.scene.add
      .image(this.visual.x, this.visual.y, ATLAS, 'character_roundPurple')
      .setOrigin(0.5, BODY_FEET_ORIGIN_Y)
      .setAngle(this.visual.angle)
      .setTintFill(color)
      .setAlpha(0.45)
      .setDepth(ENEMY_DEPTH - 1);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 240, onComplete: () => ghost.destroy() });
  }

  /** Văng lên, xoay tròn, mờ dần rồi biến mất. */
  die(facing: 1 | -1, onDone: () => void) {
    this.torso.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: this.visual,
      y: this.visual.y - 90,
      angle: -facing * 220,
      alpha: 0,
      duration: 650,
      ease: 'Quad.Out',
      onComplete: onDone,
    });
  }

  destroy() {
    this.visual.destroy();
  }

  update(view: EnemyView, frozen: boolean) {
    if (frozen) {
      this.flashFresh = false;
      return; // đứng hình: không đụng vào
    }
    const delta = this.scene.game.loop.delta;
    this.tickFlash(delta);
    if (view.state === 'dead') return; // đang diễn cảnh chết (tween lo)

    const dt = delta / 1000;
    const t = this.scene.time.now / 1000;
    const state = view.state;
    const f = view.facing;
    this.facing = f;

    this.visual.setPosition(view.x, view.feetY);

    // Dáng người: ngả ra sau khi lấy đà (anticipation), chúi tới khi đâm, bật ngửa khi trúng đòn
    const windupT = Phaser.Math.Clamp(view.timeInState / view.move.windup, 0, 1);
    const red = view.move.unblockable && (state === 'windup' || state === 'attack');
    let lean: number;
    switch (state) {
      case 'windup': lean = -f * (red ? 16 : 10) * windupT; break; // đòn đỏ ngả sâu hơn: "dồn sức"
      case 'attack': lean = f * (red ? 18 : 12); break;
      case 'hurt': lean = -f * 14; break;
      case 'staggered': lean = -f * 16 + Math.sin(t * 18) * 5; break; // lảo đảo
      case 'broken': lean = -f * 28 + Math.sin(t * 9) * 4; break;     // ngã quỵ ra sau, chao đảo chậm
      default: lean = view.runRatio * 5;
    }

    // Đòn đỏ: hào quang đỏ sau lưng phình dần + thân ửng đỏ theo nhịp, nhịp nhanh dần khi sắp đâm
    if (red) {
      const pulse = Math.abs(Math.sin(t * Phaser.Math.Linear(6, 18, windupT)));
      this.redAura.setAlpha(0.25 + 0.35 * pulse).setScale(Phaser.Math.Linear(0.8, 1.4, windupT) + 0.1 * pulse);
      // (đang chớp trắng vì trúng đòn thì để chớp trắng hiện: giáp cứng vẫn phải cho thấy là mình chém trúng)
      if (state === 'windup' && !view.flashedBeforeThrust && this.flashTimer <= 0) this.torso.setTint(lerpColor(0xffffff, 0xff7070, pulse));
    } else if (this.redAura.alpha > 0) {
      this.redAura.setAlpha(Math.max(0, this.redAura.alpha - dt * 4)); // tắt dần, không vụt mất
    }
    const k = 1 - Math.exp(-dt * (state === 'attack' ? 60 : 22));
    this.visual.angle += (lean - this.visual.angle) * k;

    // Thân nhún theo bước chân; khi sắp đâm thì run run
    const moving = Math.abs(view.vx) > 20 && view.onGround;
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

  private tickFlash(delta: number) {
    if (this.flashFresh) {
      this.flashFresh = false;
      return;
    }
    if (this.flashTimer <= 0) return;
    this.flashTimer -= delta;
    if (this.flashTimer <= 0) this.torso.clearTint();
  }

  private toLocalRad(deg: number) {
    return Phaser.Math.DegToRad(this.facing > 0 ? deg : 180 - deg);
  }
}
