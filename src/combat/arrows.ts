import Phaser from 'phaser';
import { TILE } from '../config';

/** Key ảnh mũi tên (32×32, phần có hình ở x 7..25, mũi hướng sang phải), nạp trong PreloadScene. */
export const ARROW_TEXTURE = 'arrow';
/** Cùng tỉ lệ ×8 với nhân vật: mũi tên bay ra dài đúng bằng mũi tên đang nằm trên cung trong khung hình. */
const ARROW_SCALE = 8;
/** Đầu mũi tên cách tâm ảnh 9.5 pixel ảnh (x = 25.5 so với tâm 16). */
const TIP_OFFSET = 9.5 * ARROW_SCALE;
const ARROW_HIT_H = 28;              // độ dày vùng chạm của mũi tên
const FADE_DISTANCE = 2 * TILE;      // đoạn cuối tầm bay: mờ dần thay vì biến mất đột ngột
const DEPTH = 22;

export const ARROW_SPEED = 14 * TILE; // px/giây: đủ nhanh để trúng, đủ chậm để mắt theo kịp
export const ARROW_RANGE = 11 * TILE;
export const ARROW_DAMAGE = 18;
export const ARROW_POWER = 0.5;
export const ARROW_POISE = 15;
export const ARROW_HIT_STOP = 70;

export interface Arrow {
  sprite: Phaser.GameObjects.Image;
  dir: 1 | -1;
  traveled: number;
  /** Đầu mũi tên ở frame trước: đoạn từ đây tới đầu mũi tên hiện tại là vùng quét va chạm. */
  prevTipX: number;
}

export function createArrow(scene: Phaser.Scene, x: number, y: number, dir: 1 | -1): Arrow {
  const sprite = scene.add.image(x, y, ARROW_TEXTURE).setScale(ARROW_SCALE).setFlipX(dir < 0).setDepth(DEPTH);
  // Lần quét đầu tiên bắt đầu từ tâm mũi tên (sát trước người bắn), không phải từ đầu mũi tên:
  // kẻ địch đứng sát mặt vẫn trúng, không bị mũi tên "bay vượt qua đầu"
  return { sprite, dir, traveled: 0, prevTipX: x };
}

/** Toạ độ x của đầu mũi tên. */
export function arrowTipX(arrow: Arrow) {
  return arrow.sprite.x + arrow.dir * TIP_OFFSET;
}

/**
 * Bay thêm một đoạn. Trả về vùng mà đầu mũi tên QUÉT QUA trong frame này (từ chỗ cũ tới chỗ mới):
 * dò va chạm bằng cả đoạn quét chứ không chỉ điểm cuối => bay nhanh hay máy giật lag cũng không xuyên qua mục tiêu.
 */
export function advanceArrow(arrow: Arrow, delta: number) {
  const before = arrow.prevTipX;
  const step = ARROW_SPEED * (delta / 1000);
  arrow.sprite.x += arrow.dir * step;
  arrow.traveled += step;
  arrow.sprite.setAlpha(Phaser.Math.Clamp((ARROW_RANGE - arrow.traveled) / FADE_DISTANCE, 0, 1));
  const after = arrowTipX(arrow);
  arrow.prevTipX = after;
  return new Phaser.Geom.Rectangle(Math.min(before, after), arrow.sprite.y - ARROW_HIT_H / 2, Math.abs(after - before), ARROW_HIT_H);
}

/** Vùng chạm của đầu mũi tên (để vẽ khi bấm H). */
export function arrowTipRect(arrow: Arrow) {
  const tip = arrowTipX(arrow);
  return new Phaser.Geom.Rectangle(tip - 12, arrow.sprite.y - ARROW_HIT_H / 2, 24, ARROW_HIT_H);
}

export function arrowSpent(arrow: Arrow) {
  return arrow.traveled >= ARROW_RANGE;
}

/** Cắm vào tường: mũi ngập vào mặt tường 2 pixel ảnh, rung rung, nằm lại một lúc rồi mờ đi. */
export function stickArrow(scene: Phaser.Scene, arrow: Arrow, wallX: number) {
  const sprite = arrow.sprite;
  sprite.x = wallX - arrow.dir * (TIP_OFFSET - 2 * ARROW_SCALE);
  scene.tweens.add({ targets: sprite, x: sprite.x - arrow.dir * 6, duration: 40, yoyo: true, repeat: 2 });
  scene.tweens.add({ targets: sprite, alpha: 0, delay: 700, duration: 250, onComplete: () => sprite.destroy() });
}
