import type { MoveTiming } from '../looks/PlayerLook';

/**
 * Chiêu đặc biệt (phím I / V, tốn 1 Qi). Mỗi chế độ chơi chọn một chiêu.
 * Player chỉ lo nhịp ra chiêu (frame data) và báo "đang ra chiêu" qua activeStrike() kèm `effect`;
 * tác dụng thật (dán bùa, bắn mũi tên) do GameScene xử lý.
 */
export interface SpecialDef extends MoveTiming {
  kind: 'talisman' | 'arrow';
  /** Tên chiêu trong bảng điều khiển. */
  label: string;
  /**
   * Vùng tác động trong pha active, tính từ CHÂN khi quay mặt sang PHẢI (x tính từ tâm thân).
   * Bùa: vùng tay với tới để dán. Mũi tên: chỗ mũi tên rời cung (tâm vùng này = chỗ mũi tên xuất hiện).
   */
  hitbox: { x: number; y: number; w: number; h: number };
  /** Độ mạnh tiếng "vút" lúc ra chiêu (0..1). Bỏ trống nếu chiêu có tiếng riêng (tiếng bật dây cung). */
  swingSound?: number;
}

/** Dán bùa: tay vươn tới dán lên mục tiêu gần nhất, bùa nổ sau một nhịp. */
export const TALISMAN_SPECIAL: SpecialDef = {
  kind: 'talisman',
  label: 'dán bùa',
  startup: 120, active: 90, recovery: 260,
  hitbox: { x: 10, y: -125, w: 190, h: 110 },
  swingSound: 0.2,
};

/**
 * Bắn cung: lấy đà lâu (giương cung, kéo dây) nên dễ bị đánh trúng giữa chừng; đổi lại đánh được từ xa.
 * Mũi tên xuất hiện đúng chỗ mũi tên nằm trên cung trong khung hình (đo từ sheet: cao 7 pixel ảnh × 8 = 56px).
 */
export const ARROW_SPECIAL: SpecialDef = {
  kind: 'arrow',
  label: 'bắn cung',
  startup: 380, active: 60, recovery: 220,
  hitbox: { x: 0, y: -68, w: 48, h: 24 },
};
