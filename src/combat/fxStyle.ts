import type Phaser from 'phaser';
import { ATLAS } from '../config';
import { HEAVY_FONT } from '../ui/textStyle';

/**
 * Phong cách hiệu ứng của chế độ chơi đang chạy. Code hiệu ứng (tia lửa, bụi, chữ nổi...) dùng chung,
 * chỉ khác ảnh, font và màu nét. Lưu trong registry: kho dữ liệu dùng chung của MỌI scene trong game,
 * nên hàm hiệu ứng nào có `scene` cũng đọc được mà không phải truyền thêm tham số.
 */
export interface FxStyle {
  /** Texture có các frame effect_blast, effect_blastLarge, effect_shot, effect_shotLarge (ô 128px). */
  texture: string;
  /** Font chữ đậm: số sát thương, dòng gọi tên tình huống, dấu "!". */
  font: string;
  /** Màu nét vẽ (vòng xung kích, viền chữ X phản đòn): phải tương phản với nền. */
  ink: number;
  /** Màu chữ gọi tên tình huống trung tính ("PHÁ THẾ!"). */
  calloutInk: string;
  /** Màu viền chữ gọi tên tình huống: ngược màu với nền để chữ nổi lên. */
  calloutStroke: string;
}

/** Bộ Scribble: nền giấy sáng => nét mực đen, viền chữ trắng. */
export const SCRIBBLE_FX: FxStyle = {
  texture: ATLAS,
  font: HEAVY_FONT,
  ink: 0x2b2b2b,
  calloutInk: '#2b2b2b',
  calloutStroke: '#ffffff',
};

const REGISTRY_KEY = 'fxStyle';

export function setFxStyle(scene: Phaser.Scene, style: FxStyle) {
  scene.registry.set(REGISTRY_KEY, style);
}

export function fxStyle(scene: Phaser.Scene): FxStyle {
  return (scene.registry.get(REGISTRY_KEY) as FxStyle | undefined) ?? SCRIBBLE_FX;
}
