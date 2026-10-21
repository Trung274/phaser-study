import type Phaser from 'phaser';

/** Thông tin một đòn đánh trúng; bên bị đánh dựa vào đây để tự phản ứng (giật lùi bao xa, chớp bao lâu...). */
export interface HitInfo {
  damage: number;
  power: number; // 0..1: đòn nhẹ hay nặng
  direction: 1 | -1; // hướng đòn đi tới
  /** Sát thương vào thanh choáng (poise) của boss. Đòn thường = 0: muốn làm boss kiệt sức phải đỡ/phản đòn/dùng bùa. */
  poiseDamage?: number;
}

/** Bất cứ thứ gì bị chém được: hình nộm, kẻ địch, boss, (sau này) thùng gỗ... */
export interface Hittable {
  readonly hurtbox: Phaser.Geom.Rectangle;
  /** Có thì cho biết đã chết chưa (để tính "nhát kết liễu"); hình nộm không chết nên không có. */
  readonly isDead?: boolean;
  /** Đã bị dọn khỏi màn chơi (diễn xong cảnh chết / rơi xuống hố): đừng đọc hurtbox nữa. */
  readonly gone?: boolean;
  /** Sát thương THỰC nhận ở lần trúng gần nhất, nếu khác sát thương của đòn (vd. boss kiệt sức nhận ×1.5). */
  readonly lastDamageTaken?: number;
  /** Trả về false nếu lúc này không nhận đòn (đang nằm sàn, đã chết, đang miễn nhiễm...). */
  takeHit(hit: HitInfo): boolean;
}

/** Bất cứ thứ gì ra đòn vào người chơi: lính giáo, boss. GameScene xử lý chung một vòng lặp. */
export interface Attacker {
  readonly hurtbox: Phaser.Geom.Rectangle;
  /** Đòn đang trong pha active (và chưa chạm người chơi) thì trả về, ngoài ra null. */
  activeStrike(): Strike | null;
  /** Đòn vừa chạm người chơi (trúng hoặc bị đỡ): tắt hitbox, không chạm lần hai. */
  onStrikeConnected(): void;
  /** Bị người chơi đỡ hoàn hảo. */
  onParried(pushDirection: 1 | -1): void;
  /** Bị phản đòn giữa lúc tung đòn đỏ. Trả về true nếu chết luôn. */
  onCountered(pushDirection: 1 | -1, damage: number): boolean;
}

/** Một đòn đang trong pha active (vùng gây sát thương đang bật). */
export interface Strike extends HitInfo {
  rect: Phaser.Geom.Rectangle;
  /** Mỗi nhát một số riêng: một nhát chỉ trúng mỗi mục tiêu MỘT lần. */
  swingId: number;
  /** ms đứng hình khi trúng. */
  hitStop: number;
  /** Đòn đặc biệt: 'talisman' = không gây sát thương ngay mà dán bùa lên mục tiêu. */
  effect?: 'talisman';
  /** Đòn đỏ: không đỡ được (đỡ = vỡ thế). Chỉ né, hoặc phản đòn đúng lúc. */
  unblockable?: boolean;
}

/**
 * Kết quả khi người chơi hứng một đòn:
 * - perfect: đỡ hoàn hảo     - block: đỡ thường (nội thương)   - counter: phản đòn trúng đòn đỏ
 * - guardBreak: đỡ nhầm đòn đỏ, vỡ thế, trúng đòn   - hit: trúng đòn   - miss: đang miễn nhiễm, đòn trượt
 */
export type DefenseResult = 'perfect' | 'block' | 'counter' | 'guardBreak' | 'hit' | 'miss';
