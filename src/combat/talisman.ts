import Phaser from 'phaser';
import { ATLAS } from '../config';

/** Bùa dán lên mục tiêu bao lâu thì nổ (ms). Đủ ngắn để không phải chờ, đủ dài để kịp thấy bùa nhấp nháy. */
export const TALISMAN_FUSE = 450;
export const TALISMAN_DAMAGE = 30;

const PAPER = 0xf2d16b;
const RED_INK = 0xc0392b;
const INK = 0x2b2b2b;
const DEPTH = 48;

/** Lá bùa giấy vàng, viền mực, vẽ "chữ" đỏ ngoằn ngoèo bằng Graphics (bộ Scribble không có sprite bùa). */
export function createCharm(scene: Phaser.Scene, x: number, y: number) {
  const g = scene.add.graphics();
  g.fillStyle(PAPER, 1).fillRect(-13, -26, 26, 52);
  g.lineStyle(3, INK, 1).strokeRect(-13, -26, 26, 52);
  g.lineStyle(3, RED_INK, 1).strokeRect(-8, -21, 16, 42);
  g.beginPath();
  g.moveTo(-4, -14);
  g.lineTo(4, -8);
  g.lineTo(-4, -1);
  g.lineTo(4, 6);
  g.lineTo(-4, 13);
  g.strokePath();

  // Không dùng tween "nảy từ 0": ngay lúc dán là hit-stop (mọi tween bị dừng) => bùa sẽ vô hình trong khung đứng hình.
  // Hiện sẵn ở cỡ to; GameScene.updateTalismans lo phần nhấp nháy sau đó.
  return scene.add.container(x, y, [g]).setDepth(DEPTH).setAngle(Phaser.Math.Between(-18, 18)).setScale(1.4);
}

/** Bùa nổ: chớp vàng lớn + vòng xung kích + giấy vụn bay tung toé. */
export function spawnTalismanBurst(scene: Phaser.Scene, x: number, y: number) {
  const flash = scene.add.image(x, y, ATLAS, 'effect_blastLarge').setTint(0xffe7a0).setScale(1.1).setDepth(DEPTH);
  scene.tweens.add({ targets: flash, scale: 1.9, alpha: 0, duration: 320, ease: 'Quad.Out', onComplete: () => flash.destroy() });

  const ring = scene.add.graphics().setPosition(x, y).setDepth(DEPTH).setScale(1.5);
  ring.lineStyle(8, RED_INK, 1);
  ring.strokeCircle(0, 0, 40);
  scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => ring.destroy() });

  for (let i = 0; i < 10; i++) {
    const rad = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const distance = Phaser.Math.Between(120, 240);
    const scrap = scene.add.rectangle(x, y, 10, 18, PAPER).setStrokeStyle(2, INK).setDepth(DEPTH).setAngle(Phaser.Math.Between(0, 359));
    scene.tweens.add({
      targets: scrap,
      x: x + Math.cos(rad) * distance,
      y: y + Math.sin(rad) * distance + 60, // giấy vụn rơi dần xuống
      angle: scrap.angle + Phaser.Math.Between(-540, 540),
      alpha: 0,
      duration: Phaser.Math.Between(500, 800),
      ease: 'Cubic.Out',
      onComplete: () => scrap.destroy(),
    });
  }
}
