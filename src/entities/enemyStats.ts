import { TILE } from '../config';

/**
 * Một kiểu đánh của kẻ địch, mô tả bằng dữ liệu (như COMBO của người chơi). Startup (windup) DÀI để người chơi kịp phản ứng.
 *   |------ windup: "!" + lấy đà ------|-- flash --|-- thrust --|------ recover: đứng hớ ------|
 */
export interface ThrustDef {
  windup: number;      // ms lấy đà (gồm cả flash)
  flashBefore: number; // ms cuối của windup: chớp sáng = "NGAY BÂY GIỜ"
  thrust: number;      // ms vũ khí có hiệu lực
  distance: number;    // lao tới bao xa khi đánh
  recover: number;     // ms đứng hớ sau khi đánh: cửa sổ để người chơi phản công
  damage: number;      // số tim
  power: number;
  hitStop: number;
  unblockable: boolean;
  /** Vùng vũ khí khi quay mặt sang PHẢI, tính từ chân (x tính từ tâm thân). */
  hitbox: { x: number; y: number; w: number; h: number };
}

/**
 * Chỉ số (phần LUẬT CHƠI) của một loại kẻ địch. Thêm loại mới = thêm một bảng như dưới đây,
 * không sửa Enemy.ts. Phần nhìn (bộ da) khai báo riêng trong theme.
 */
export interface EnemyStats {
  maxHp: number;
  patrolSpeed: number;
  chaseSpeed: number;
  /** Cách người chơi chừng này thì bắt đầu ra đòn. */
  attackRange: number;
  /** Bị đánh văng xa bao nhiêu so với bình thường: con nặng < 1, con nhẹ > 1. */
  knockback: number;
  /** Thân vật lý (cũng là vùng bị đánh). */
  body: { w: number; h: number };
  normal: ThrustDef;
  /** Đòn đỏ: không đỡ được, chỉ né hoặc phản đòn. */
  red: ThrustDef;
  /** Xác suất mỗi lần ra đòn là đòn đỏ. */
  redChance: number;
}

/** Lính thường (lính giáo của bộ Scribble, orc của bộ Pixel): cân bằng, dễ đọc đòn. */
export const GRUNT: EnemyStats = {
  maxHp: 40, // ~ một combo 3 nhát là hạ
  patrolSpeed: 1.2 * TILE,
  chaseSpeed: 2.6 * TILE,
  attackRange: 1.5 * TILE,
  knockback: 1,
  body: { w: 60, h: 112 },
  normal: {
    windup: 520, flashBefore: 130, thrust: 140, distance: 1.2 * TILE, recover: 520,
    damage: 1, power: 0.6, hitStop: 90, unblockable: false,
    hitbox: { x: 20, y: -100, w: 170, h: 75 },
  },
  // Lấy đà lâu hơn (dễ thấy), lao xa hơn, đau gấp đôi; đổi lại đứng hớ rất lâu
  red: {
    windup: 720, flashBefore: 170, thrust: 230, distance: 3 * TILE, recover: 850,
    damage: 2, power: 0.9, hitStop: 110, unblockable: true,
    hitbox: { x: 20, y: -100, w: 170, h: 75 },
  },
  redChance: 0.35,
};

/**
 * Quỷ: nhanh, ít máu, nhẹ (bị chém văng xa). Báo trước ngắn hơn lính thường => phải phản xạ nhanh hơn,
 * nhưng chỉ cần 2-3 nhát là hạ. Đòn thường: đâm lướt sát đất. Đòn đỏ: giơ đao chém bổ.
 */
export const DEMON: EnemyStats = {
  maxHp: 28,
  patrolSpeed: 1.6 * TILE,
  chaseSpeed: 3.4 * TILE,
  attackRange: 1.6 * TILE,
  knockback: 1.25,
  body: { w: 60, h: 104 },
  normal: {
    windup: 400, flashBefore: 120, thrust: 130, distance: 1.6 * TILE, recover: 440,
    damage: 1, power: 0.55, hitStop: 80, unblockable: false,
    hitbox: { x: 10, y: -80, w: 190, h: 70 }, // lưỡi đao sát đất, với xa
  },
  red: {
    windup: 620, flashBefore: 150, thrust: 200, distance: 2.6 * TILE, recover: 760,
    damage: 2, power: 0.9, hitStop: 110, unblockable: true,
    hitbox: { x: 0, y: -150, w: 160, h: 150 }, // chém bổ từ trên xuống: cao, gần
  },
  redChance: 0.3,
};

/**
 * Huyết quái: chậm, trâu, nặng (chém không văng mấy). Đòn thường: vồ móng (vùng đánh rất cao, nhảy qua khó).
 * Đòn đỏ: há miệng lao tới cắn, với cực xa => thấy "!!" thì lùi xa hoặc phản đòn.
 */
export const BLOOD_MONSTER: EnemyStats = {
  maxHp: 70,
  patrolSpeed: 0.8 * TILE,
  chaseSpeed: 1.7 * TILE,
  attackRange: 1.6 * TILE,
  knockback: 0.45,
  body: { w: 80, h: 100 },
  normal: {
    windup: 640, flashBefore: 150, thrust: 160, distance: 0.6 * TILE, recover: 640,
    damage: 1, power: 0.7, hitStop: 100, unblockable: false,
    hitbox: { x: 10, y: -190, w: 150, h: 190 },
  },
  red: {
    windup: 820, flashBefore: 180, thrust: 260, distance: 3.6 * TILE, recover: 950,
    damage: 2, power: 1, hitStop: 120, unblockable: true,
    hitbox: { x: 20, y: -120, w: 210, h: 80 },
  },
  redChance: 0.4,
};
