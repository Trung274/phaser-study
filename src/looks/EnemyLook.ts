import type { EnemyState } from '../entities/Enemy';

export const ENEMY_DEPTH = 18;
/** Màu "không đỡ được": dấu !!, hào quang, chớp, bóng mờ của đòn đỏ. */
export const DANGER_RED = 0xff3b3b;

/** Ảnh chụp trạng thái kẻ địch trong frame này (xem PlayerView). */
export interface EnemyView {
  /** Vị trí CHÂN. */
  x: number;
  feetY: number;
  state: EnemyState;
  timeInState: number;
  facing: 1 | -1;
  vx: number;
  /** vx / tốc độ đuổi tối đa: ±1 là đang chạy hết tốc. */
  runRatio: number;
  onGround: boolean;
  /** Đòn đang ra (hoặc vừa ra): thời lượng từng pha và có phải đòn đỏ không. */
  move: { windup: number; thrust: number; recover: number; unblockable: boolean };
  /** Đã chớp sáng "NGAY BÂY GIỜ" trước cú đánh chưa. */
  flashedBeforeThrust: boolean;
}

/** "Bộ da" của kẻ địch: như PlayerLook, chỉ lo phần nhìn thấy. */
export interface EnemyLook {
  /** Mũi vũ khí lúc sắp đánh, tính từ chân khi quay mặt sang PHẢI: chỗ loé sáng báo trước. */
  readonly weaponTip: { x: number; y: number };
  /** Gọi mỗi frame SAU physics, kể cả lúc đang chết (để diễn cảnh chết). */
  update(view: EnemyView, frozen: boolean): void;
  /** Phủ kín một màu trong `ms` mili giây: trắng = trúng đòn / báo trước đòn thường, đỏ = báo trước đòn đỏ. */
  flash(color: number, ms: number): void;
  /** Bóng mờ một màu đứng lại tại chỗ. */
  afterimage(color: number): void;
  /** Diễn cảnh chết, xong thì gọi onDone (kẻ địch được dọn đi). */
  die(facing: 1 | -1, onDone: () => void): void;
  destroy(): void;
}
