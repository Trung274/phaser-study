import { TILE } from '../config';

/**
 * Một đòn đánh mô tả bằng dữ liệu. Thời lượng chia 3 pha (frame data, khái niệm từ game đối kháng):
 *
 *   |--- startup ---|--- active ---|------ recovery ------|
 *     vung lấy đà     lưỡi kiếm có     thu kiếm: chưa làm gì
 *     (chưa gây       hiệu lực         khác được (trừ lướt
 *      sát thương)    (hitbox bật)     để huỷ đòn)
 *
 * Startup dài = đòn nặng nhưng dễ bị phản. Recovery dài = chém hụt thì bị phạt.
 * Cân chỉnh ba con số này chính là cân bằng game.
 */
export interface AttackDef {
  name: string;
  startup: number; // ms
  active: number; // ms
  recovery: number; // ms
  damage: number;
  /** 0..1: độ "nặng" của đòn, điều khiển mọi hiệu ứng (rung, đứng hình, tia lửa, cỡ chữ...). */
  power: number;
  /** ms cả thế giới đứng hình khi chém trúng. */
  hitStop: number;
  /** Vùng gây sát thương, tính từ CHÂN nhân vật khi quay mặt sang PHẢI (x tính từ tâm thân). */
  hitbox: { x: number; y: number; w: number; h: number };
  /** Bước tới trong lúc startup + active (px/giây): chém có lực đẩy người tới trước. */
  lunge: number;
  /** Góc kiếm (độ) khi quay mặt sang phải: 0 = chĩa thẳng tới trước, -90 = lên trời, 90 = xuống đất. */
  swingFrom: number;
  swingTo: number;
}

/**
 * Combo 3 đòn: hai nhát nhanh rồi một nhát bổ mạnh kết thúc.
 * Góc lớn hơn ~36° thì mũi kiếm chìm xuống dưới mặt đất (vai cao 72px, tầm kiếm ~123px: sin θ = 72/123).
 */
export const COMBO: AttackDef[] = [
  {
    name: 'chém xéo',
    startup: 70, active: 80, recovery: 170,
    damage: 10, power: 0.3, hitStop: 55,
    hitbox: { x: 0, y: -190, w: 170, h: 190 },
    lunge: 1.6 * TILE,
    swingFrom: -120, swingTo: 40, // từ trên-sau chém chéo xuống trước
  },
  {
    name: 'hất lên',
    startup: 60, active: 80, recovery: 170,
    damage: 12, power: 0.4, hitStop: 60,
    hitbox: { x: 0, y: -200, w: 170, h: 200 },
    lunge: 1.6 * TILE,
    swingFrom: 35, swingTo: -110, // từ dưới-trước hất ngược lên (35° = mũi kiếm vừa sát đất)
  },
  {
    name: 'bổ',
    startup: 140, active: 100, recovery: 320,
    damage: 24, power: 1, hitStop: 120,
    hitbox: { x: -20, y: -220, w: 210, h: 220 },
    lunge: 3.2 * TILE,
    swingFrom: -160, swingTo: 48, // vòng qua đầu bổ mạnh xuống, mũi kiếm chạm đất
  },
];
