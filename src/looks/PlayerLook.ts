import type { AttackDef } from '../combat/attacks';
import type { PlayerState } from '../player/Player';

/** Thứ tự vẽ của người chơi; hiệu ứng quanh người (bụi, vệt tốc độ, bóng mờ) xếp quanh số này. */
export const PLAYER_DEPTH = 20;

/** Frame data của động tác đang ra: chém, chiêu đặc biệt hay phản đòn đều có 3 pha này. */
export interface MoveTiming {
  startup: number;
  active: number;
  recovery: number;
}

/**
 * Ảnh chụp trạng thái người chơi trong frame này. Player gửi cho "bộ da" mỗi frame.
 * Bộ da chỉ ĐỌC để vẽ, không sửa được gì: thay bộ da không thể làm game chơi khác đi.
 */
export interface PlayerView {
  /** Vị trí CHÂN (giữa hai bàn chân). */
  x: number;
  feetY: number;
  state: PlayerState;
  timeInState: number;
  facing: 1 | -1;
  /** vx / tốc độ chạy tối đa: ±1 là chạy hết tốc, lớn hơn 1 khi đang lướt. */
  runRatio: number;
  /** Hướng của đòn vừa trúng mình (để biết bật ngửa về phía nào). */
  hitDirection: 1 | -1;
  /** Đang miễn nhiễm sau khi trúng đòn: nhân vật nhấp nháy. */
  blinking: boolean;
  /** Thế đỡ hiện tại vừa đỡ hoàn hảo một đòn. */
  deflected: boolean;
  perfectWindow: boolean;
  counterWindow: boolean;
  /** Mỗi nhát chém một số riêng: số đổi = vừa bắt đầu nhát mới. */
  swingId: number;
  /** Nhát thứ mấy trong combo (0, 1, 2) và dữ liệu nhát đó. */
  comboIndex: number;
  attack: AttackDef;
  /** Frame data của động tác đang ra; null khi không ra đòn. */
  move: MoveTiming | null;
}

/**
 * "Bộ da" (look) của người chơi: mọi thứ NHÌN THẤY được, tách khỏi logic điều khiển trong Player.
 * Player gọi các hàm này đúng lúc (bắt đầu vung, trúng đòn, chết...), còn vẽ ra sao là việc của bộ da.
 * Có hai bộ: ScribblePlayerLook (tư thế tính bằng code) và SpritePlayerLook (animation từng khung hình).
 */
export interface PlayerLook {
  /** Gọi mỗi frame SAU physics. frozen = đang đứng hình (hit-stop): không cho thời gian trôi. */
  update(view: PlayerView, frozen: boolean): void;
  /** Chớp trắng `ms` mili giây (chỉ đếm lúc không đứng hình). */
  flash(ms: number): void;
  /** Squash & stretch: méo ngay lập tức rồi đàn hồi về dáng cũ. */
  squash(scaleX: number, scaleY: number, duration: number): void;
  /** Bóng mờ đứng lại tại chỗ (khi lướt). */
  afterimage(): void;
  /** Đầu pha active của một nhát chém: lúc lưỡi kiếm bắt đầu có hiệu lực. */
  swing(view: PlayerView): void;
  /** Bắt đầu cảnh chết. */
  die(hitDirection: 1 | -1): void;
}
