import Phaser from 'phaser';
import { ATLAS } from '../config';
import { HEAVY_FONT, VI_TEXT } from '../ui/textStyle';

const lerp = Phaser.Math.Linear;
const DEPTH_EFFECTS = 50;
const SCRIBBLE_GRAY = 0xb4b4b4; // màu viền các sprite hiệu ứng trong bộ Scribble

/**
 * Vệt chém: hình lưỡi liềm bám theo cung kiếm vừa vung, nhọn ở đuôi, dày ở đầu lưỡi.
 * Vẽ bằng Graphics thay vì sprite effect_trail cố định, vì mỗi đòn có một cung khác nhau.
 * Phong cách lấy từ effect_trail: nền trắng, viền xám.
 *
 * Toạ độ góc tính bằng radian trong hệ của Graphics (gốc đặt ở vai nhân vật).
 */
export function drawSlash(scene: Phaser.Scene, fromRad: number, toRad: number, radius: number, power: number) {
  const g = scene.add.graphics();
  const steps = 18;
  const outer: Phaser.Math.Vector2[] = [];
  const inner: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps; // 0 = đuôi vệt (chỗ bắt đầu vung), 1 = đầu vệt (chỗ lưỡi kiếm dừng)
    const angle = fromRad + (toRad - fromRad) * s;
    const thickness = 4 + lerp(36, 60, power) * s * s;
    outer.push(new Phaser.Math.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
    inner.push(new Phaser.Math.Vector2(Math.cos(angle) * (radius - thickness), Math.sin(angle) * (radius - thickness)));
  }
  const points = [...outer, ...inner.reverse()];
  g.fillStyle(0xffffff, 0.95);
  g.fillPoints(points, true);
  g.lineStyle(4, SCRIBBLE_GRAY, 1);
  g.strokePoints(points, true);

  scene.tweens.add({ targets: g, alpha: 0, scale: 1.06, duration: 160, ease: 'Quad.Out', onComplete: () => g.destroy() });
  return g;
}

/**
 * Tia va chạm tại điểm trúng: một chớp tròn + các vạch toé ra, chủ yếu theo hướng chém.
 * Hiện ở trạng thái lớn nhất NGAY lúc tạo, vì liền sau đó hit-stop sẽ đóng băng mọi tween:
 * khung hình đứng yên phải là khung "đã" nhất.
 */
export function spawnHitSpark(scene: Phaser.Scene, x: number, y: number, power: number, direction: 1 | -1) {
  const flashScale = lerp(0.6, 1.05, power);
  const flash = scene.add.image(x, y, ATLAS, 'effect_blast').setScale(flashScale).setDepth(DEPTH_EFFECTS);
  scene.tweens.add({ targets: flash, scale: flashScale * 1.35, alpha: 0, duration: 150, ease: 'Quad.Out', onComplete: () => flash.destroy() });

  const rays = Math.round(lerp(5, 9, power));
  const baseAngle = direction > 0 ? 0 : 180;
  for (let i = 0; i < rays; i++) {
    // Phần lớn tia văng về phía lưỡi kiếm đi tới, vài tia văng lung tung cho tự nhiên
    const angleDeg = i < rays - 2 ? baseAngle + Phaser.Math.Between(-70, 70) : Phaser.Math.Between(0, 359);
    const rad = Phaser.Math.DegToRad(angleDeg);
    const distance = lerp(70, 140, power) * Phaser.Math.FloatBetween(0.7, 1.1);
    const ray = scene.add
      .image(x + Math.cos(rad) * 24, y + Math.sin(rad) * 24, ATLAS, 'effect_shot')
      .setRotation(rad)
      .setScale(lerp(0.8, 1.3, power), 1)
      .setDepth(DEPTH_EFFECTS);
    scene.tweens.add({
      targets: ray,
      x: x + Math.cos(rad) * distance,
      y: y + Math.sin(rad) * distance,
      scaleX: 0.2,
      alpha: 0,
      duration: Phaser.Math.Between(150, 220),
      ease: 'Cubic.Out',
      onComplete: () => ray.destroy(),
    });
  }
}

/**
 * Đỡ hoàn hảo: chớp lớn + vòng xung kích nét mực + tia toé ra MỌI hướng (khác với chém trúng chỉ toé một phía).
 * Hình dạng khác hẳn tia chém trúng để mắt phân biệt được ngay "mình đỡ được" hay "mình chém trúng".
 */
export function spawnParrySpark(scene: Phaser.Scene, x: number, y: number) {
  const flash = scene.add.image(x, y, ATLAS, 'effect_blastLarge').setScale(0.55).setDepth(DEPTH_EFFECTS);
  scene.tweens.add({ targets: flash, scale: 0.95, alpha: 0, duration: 200, ease: 'Quad.Out', onComplete: () => flash.destroy() });

  // Vòng xung kích: hiện sẵn ở cỡ vừa để khung hình đứng yên (hit-stop) vẫn thấy rõ
  const ring = scene.add.graphics().setPosition(x, y).setDepth(DEPTH_EFFECTS).setScale(1.5);
  ring.lineStyle(6, 0x2b2b2b, 1);
  ring.strokeCircle(0, 0, 30);
  scene.tweens.add({ targets: ring, scale: 4.5, alpha: 0, duration: 280, ease: 'Cubic.Out', onComplete: () => ring.destroy() });

  for (let i = 0; i < 12; i++) {
    const rad = (i / 12) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
    const distance = Phaser.Math.Between(110, 170);
    const ray = scene.add
      .image(x + Math.cos(rad) * 30, y + Math.sin(rad) * 30, ATLAS, 'effect_shotLarge')
      .setRotation(rad)
      .setScale(0.7, 1)
      .setDepth(DEPTH_EFFECTS);
    scene.tweens.add({
      targets: ray,
      x: x + Math.cos(rad) * distance,
      y: y + Math.sin(rad) * distance,
      scaleX: 0.1,
      alpha: 0,
      duration: Phaser.Math.Between(180, 260),
      ease: 'Cubic.Out',
      onComplete: () => ray.destroy(),
    });
  }
}

/**
 * Phản đòn: hai vệt chém chéo hình chữ X (mực đen viền, lõi đỏ) + chớp lớn + tia toé mọi hướng.
 * To và "nặng" nhất trong mọi hiệu ứng va chạm: đây là phần thưởng lớn nhất của hệ thống chiến đấu.
 */
export function spawnCounterBurst(scene: Phaser.Scene, x: number, y: number) {
  const flash = scene.add.image(x, y, ATLAS, 'effect_blastLarge').setTint(0xffb0b0).setScale(0.9).setDepth(DEPTH_EFFECTS);
  scene.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: 280, ease: 'Quad.Out', onComplete: () => flash.destroy() });

  const cross = scene.add.graphics().setPosition(x, y).setDepth(DEPTH_EFFECTS + 1).setScale(1.2);
  for (const angle of [-35, 35]) {
    const rad = Phaser.Math.DegToRad(angle);
    const dx = Math.cos(rad) * 110;
    const dy = Math.sin(rad) * 110;
    cross.lineStyle(22, 0x2b2b2b, 1).lineBetween(-dx, -dy, dx, dy); // viền mực
    cross.lineStyle(12, 0xff3b3b, 1).lineBetween(-dx, -dy, dx, dy); // lõi đỏ
  }
  scene.tweens.add({ targets: cross, scale: 1.5, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => cross.destroy() });

  for (let i = 0; i < 14; i++) {
    const rad = (i / 14) * Math.PI * 2;
    const distance = Phaser.Math.Between(140, 220);
    const ray = scene.add.image(x, y, ATLAS, 'effect_shotLarge').setRotation(rad).setDepth(DEPTH_EFFECTS);
    scene.tweens.add({
      targets: ray,
      x: x + Math.cos(rad) * distance,
      y: y + Math.sin(rad) * distance,
      scaleX: 0.1,
      alpha: 0,
      duration: Phaser.Math.Between(220, 320),
      ease: 'Cubic.Out',
      onComplete: () => ray.destroy(),
    });
  }
}

/** Dòng chữ gọi tên tình huống ("PHẢN ĐÒN!", "PHÁ THẾ!"): giúp người mới học luật bằng mắt. */
export function spawnCallout(scene: Phaser.Scene, x: number, y: number, message: string, color: string) {
  const text = scene.add
    .text(x, y, message, {
      ...VI_TEXT,
      fontFamily: HEAVY_FONT,
      fontSize: '44px',
      color,
      stroke: '#ffffff',
      strokeThickness: 10,
    })
    .setOrigin(0.5)
    .setDepth(DEPTH_EFFECTS + 20)
    .setScale(1.6);
  scene.tweens.add({ targets: text, scale: 1, duration: 240, ease: 'Back.Out' });
  scene.tweens.add({ targets: text, y: y - 70, alpha: 0, delay: 500, duration: 450, ease: 'Quad.In', onComplete: () => text.destroy() });
}

/** Kẻ địch tan biến: chớp lớn + các cụm khói văng ra mọi hướng. */
export function spawnDeathBurst(scene: Phaser.Scene, x: number, y: number) {
  const flash = scene.add.image(x, y, ATLAS, 'effect_blastLarge').setScale(0.9).setDepth(DEPTH_EFFECTS);
  scene.tweens.add({ targets: flash, scale: 1.4, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => flash.destroy() });

  for (let i = 0; i < 7; i++) {
    const rad = (i / 7) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
    const distance = Phaser.Math.Between(70, 130);
    const puff = scene.add.image(x, y, ATLAS, 'effect_blast').setScale(Phaser.Math.FloatBetween(0.35, 0.55)).setDepth(DEPTH_EFFECTS);
    scene.tweens.add({
      targets: puff,
      x: x + Math.cos(rad) * distance,
      y: y + Math.sin(rad) * distance - 30, // khói bốc nhẹ lên trên
      scale: 0.1,
      alpha: 0,
      duration: Phaser.Math.Between(380, 520),
      ease: 'Cubic.Out',
      onComplete: () => puff.destroy(),
    });
  }
}

/** Số sát thương: bật to, co lại, bay lên lệch ngẫu nhiên rồi mờ dần. */
export function spawnDamageNumber(scene: Phaser.Scene, x: number, y: number, damage: number, power: number) {
  const isHeavy = power >= 1;
  const text = scene.add
    .text(x, y - 30, isHeavy ? `${damage}!` : `${damage}`, {
      fontFamily: HEAVY_FONT,
      fontSize: `${Math.round(lerp(38, 64, power))}px`,
      color: '#ffffff',
      stroke: '#2b2b2b',
      strokeThickness: 9,
    })
    .setOrigin(0.5)
    .setDepth(DEPTH_EFFECTS + 10)
    .setScale(1.7); // to quá cỡ trong khung hình đứng yên, rồi co về

  scene.tweens.add({ targets: text, scale: 1, duration: 220, ease: 'Back.Out' });
  scene.tweens.add({ targets: text, x: x + Phaser.Math.Between(-40, 40), y: y - 130, duration: 800, ease: 'Cubic.Out' });
  scene.tweens.add({ targets: text, alpha: 0, delay: 500, duration: 300, onComplete: () => text.destroy() });
}
