import Phaser from 'phaser';
import { ATLAS } from '../config';
import type { HitInfo, Hittable } from '../combat/types';

const MAX_HP = 120;
const REGEN_DELAY = 2000;      // ms không bị đánh thì hồi đầy máu
const GET_UP_DELAY = 1500;     // ms nằm sàn trước khi tự đứng dậy
// Lò xo xoay quanh chân: độ cứng càng lớn bật về càng nhanh, giảm chấn càng lớn rung càng ít
const SPRING_STIFFNESS = 180;
const SPRING_DAMPING = 11;
// Frame thân vuông 128×128, phần có hình kết thúc ở y=126 => chân ở 127/128
const FEET_ORIGIN_Y = 127 / 128;
const HURTBOX_W = 80;
const HURTBOX_H = 124;
const BAR_W = 100;
const HP_COLOR = 0xf2545b;

/**
 * Hình nộm luyện chém: đứng yên, chịu đòn, lắc lư như lò xo, hết máu thì ngã rồi tự đứng dậy.
 * Có hai vùng khác nhau:
 * - hurtbox: vùng BỊ đánh trúng (đối lập với hitbox của đòn đánh).
 * - blocker: thân vật lý tĩnh để người chơi không đi xuyên qua.
 */
export class TrainingDummy implements Hittable {
  readonly blocker: Phaser.GameObjects.Zone;
  hp = MAX_HP;

  private readonly scene: Phaser.Scene;
  private readonly x: number;
  private readonly feetY: number;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly hpFill: Phaser.GameObjects.Rectangle;
  private readonly hpGhost: Phaser.GameObjects.Rectangle;

  private tilt = 0;      // góc nghiêng hiện tại (độ)
  private tiltVel = 0;   // vận tốc góc (độ/giây)
  private flashTimer = 0;
  private regenTimer = 0;
  private knockedDown = false;

  constructor(scene: Phaser.Scene, x: number, feetY: number) {
    this.scene = scene;
    this.x = x;
    this.feetY = feetY;

    // Gốc ở chân: nghiêng, bẹp, ngã đều xoay quanh chỗ chân chạm đất
    this.sprite = scene.add.image(0, 0, ATLAS, 'character_squareYellow').setOrigin(0.5, FEET_ORIGIN_Y);
    this.visual = scene.add.container(x, feetY, [this.sprite]).setDepth(15);

    this.blocker = scene.add.zone(x, feetY - 50, 70, 100);
    scene.physics.add.existing(this.blocker, true);

    // Thanh máu: nền đen, "bóng" trắng tụt chậm, máu đỏ tụt ngay
    const barY = feetY - 160;
    scene.add.rectangle(x, barY, BAR_W + 6, 14, 0x000000, 0.55).setDepth(40);
    this.hpGhost = scene.add.rectangle(x - BAR_W / 2, barY, BAR_W, 8, 0xffffff).setOrigin(0, 0.5).setDepth(40);
    this.hpFill = scene.add.rectangle(x - BAR_W / 2, barY, BAR_W, 8, HP_COLOR).setOrigin(0, 0.5).setDepth(40);
  }

  get hurtbox() {
    return new Phaser.Geom.Rectangle(this.x - HURTBOX_W / 2, this.feetY - HURTBOX_H, HURTBOX_W, HURTBOX_H);
  }

  /** Trả về false nếu đang nằm sàn (không nhận đòn) để bên gọi bỏ qua hiệu ứng trúng đòn. */
  takeHit(hit: HitInfo) {
    if (this.knockedDown) return false;

    this.hp = Math.max(0, this.hp - hit.damage);
    this.regenTimer = REGEN_DELAY;

    // Chớp trắng: đếm bằng update (giờ "trong game"), nên đứng hình bao lâu thì trắng bấy lâu
    this.flashTimer = 70;
    this.sprite.setTintFill(0xffffff);

    // Cú đánh = một cú "đẩy" vào lò xo; lò xo tự lắc rồi dịu lại trong update
    this.tiltVel += hit.direction * Phaser.Math.Linear(220, 520, hit.power);

    // Bẹp ngang rồi nảy về
    this.scene.tweens.killTweensOf(this.visual);
    this.visual.setScale(1.15, 0.88);
    this.scene.tweens.add({ targets: this.visual, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.Out' });

    this.refreshBars(350);
    if (this.hp === 0) this.knockDown(hit.direction);
    return true;
  }

  update(delta: number) {
    const dt = Math.min(delta, 33) / 1000; // chặn dt quá lớn (tab bị ẩn...) để lò xo không "nổ"

    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      if (this.flashTimer <= 0) this.sprite.clearTint();
    }

    if (!this.knockedDown) {
      // Lò xo + giảm chấn: lực kéo về tỉ lệ với độ lệch, lực cản tỉ lệ với vận tốc
      const accel = -SPRING_STIFFNESS * this.tilt - SPRING_DAMPING * this.tiltVel;
      this.tiltVel += accel * dt;
      this.tilt += this.tiltVel * dt;
      this.visual.angle = this.tilt;

      if (this.hp < MAX_HP) {
        this.regenTimer -= delta;
        if (this.regenTimer <= 0) {
          this.hp = MAX_HP;
          this.refreshBars(0);
        }
      }
    }
  }

  private knockDown(direction: 1 | -1) {
    this.knockedDown = true;
    this.tilt = 0;
    this.tiltVel = 0;
    this.scene.tweens.add({ targets: this.visual, angle: direction * 80, duration: 600, ease: 'Bounce.Out' });
    this.scene.time.delayedCall(GET_UP_DELAY, () => {
      this.scene.tweens.add({
        targets: this.visual,
        angle: 0,
        duration: 450,
        ease: 'Back.Out',
        onComplete: () => {
          this.knockedDown = false;
          this.hp = MAX_HP;
          this.refreshBars(0);
        },
      });
    });
  }

  /** Máu đỏ cập nhật ngay; "bóng" trắng đứng yên một nhịp rồi mới tụt theo (dư âm của cú đánh). */
  private refreshBars(ghostDelay: number) {
    const ratio = this.hp / MAX_HP;
    this.scene.tweens.killTweensOf(this.hpFill);
    this.scene.tweens.killTweensOf(this.hpGhost);
    if (ratio >= this.hpFill.scaleX) {
      // Hồi máu: cả hai thanh cùng đầy lên mượt
      this.scene.tweens.add({ targets: [this.hpFill, this.hpGhost], scaleX: ratio, duration: 300, ease: 'Quad.Out' });
      return;
    }
    this.hpFill.setScale(ratio, 1);
    this.scene.tweens.add({ targets: this.hpGhost, scaleX: ratio, delay: ghostDelay, duration: 350, ease: 'Cubic.In' });
  }
}
