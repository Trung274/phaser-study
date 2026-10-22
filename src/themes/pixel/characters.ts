import type { SpritePlayerDef } from '../../looks/SpritePlayerLook';
import type { SpriteEnemyDef } from '../../looks/SpriteEnemyLook';
import { CHARACTER_TEXTURES, PIXEL_SCALE } from './textures';

// Bảng "trạng thái => khung hình" (phần NHÌN) của từng nhân vật sprite sheet.
// Chỉ số luật chơi của kẻ địch (máu, tốc độ, đòn) nằm riêng ở entities/enemyStats.ts.
// Số đo (gốc chân, chỗ vũ khí) lấy bằng cách in từng khung ra dạng chữ / phóng to rồi đếm pixel.
const S = PIXEL_SCALE;

/**
 * Lính (Tiny RPG 01). Ô 100×100, thân ở giữa (x ≈ 41..56), đế giày ở hàng y = 56 => gốc chân (0.495, 0.57).
 * Tag: idle(6) walk(8) attack01(6: chém ngang) attack02(6: nhảy chém dọc) attack03(9: bắn cung) hurt(4) death(4).
 * Sheet không có nhảy, lướt, đỡ đòn => mượn khung của động tác khác có dáng gần giống nhất.
 */
export const SOLDIER_SPRITE: SpritePlayerDef = {
  texture: CHARACTER_TEXTURES.soldier,
  scale: S,
  origin: { x: 0.495, y: 0.57 },
  idle: 'idle',
  run: 'walk',
  hurt: 'hurt',
  death: 'death',
  jump: { tag: 'attack02', frame: 1 },    // khung bật người lên của đòn chém dọc: hai chân co, rời mặt đất
  fall: { tag: 'attack02', frame: 2 },
  dash: { tag: 'walk', frame: 2 },        // sải chân dài nhất
  parry: { tag: 'attack01', frame: 1 },   // dựng kiếm thẳng đứng trước người
  deflect: { tag: 'attack02', frame: 5 }, // đỡ được: hất kiếm tới trước
  combo: [
    { tag: 'attack01', startup: [1, 2], active: [3, 4], recovery: [5] }, // chém ngang
    { tag: 'attack02', startup: [1, 2], active: [3, 4], recovery: [5] }, // nhảy chém dọc
    { tag: 'attack01', startup: [1, 2], active: [3, 4], recovery: [5] }, // nhát bổ: cùng khung nhưng lấy đà lâu gấp đôi (frame data)
  ],
  counter: { tag: 'attack02', startup: [2], active: [3, 4], recovery: [5] },
  // Bắn cung: 7 khung giương cung + kéo dây cho pha lấy đà, khung buông dây đúng pha active (lúc mũi tên bay ra)
  special: { tag: 'attack03', startup: [0, 1, 2, 3, 4, 5, 6], active: [7], recovery: [8] },
  ghostColor: 0x8fb8ff,
};

/**
 * Orc (Tiny RPG 01). Thân ở x ≈ 44..65 (gồm cả rìu), đế giày y = 56 => gốc chân (0.533, 0.57).
 * Tag: idle(6) walk(8) attack01(6: bổ rìu) attack02(6: vung rìu qua đầu) hurt(4) death(4: rơi đầu).
 */
export const ORC_SPRITE: SpriteEnemyDef = {
  texture: CHARACTER_TEXTURES.orc,
  scale: S,
  origin: { x: 0.533, y: 0.57 },
  idle: 'idle',
  walk: 'walk',
  hurt: 'hurt',
  death: 'death',
  // Lưỡi rìu ở khung cuối pha lấy đà: giơ cao sau đầu (lệch -12, -21 pixel ảnh so với gốc chân)
  normal: { tag: 'attack01', startup: [0, 1, 2], active: [3, 4], recovery: [5], tip: { x: -12 * S, y: -21 * S } },
  red: { tag: 'attack02', startup: [0, 1, 2], active: [3, 4], recovery: [5], tip: { x: -12 * S, y: -21 * S } },
  staggered: { tag: 'hurt', frame: 2 },
  broken: { tag: 'death', frame: 1 }, // ngã quỵ, chưa chết
};

/**
 * Quỷ (Tiny RPG 02, Demon_A). Thân ở x ≈ 47..58, lưỡi đao chạm đất ở hàng y = 58 => gốc chân (0.525, 0.59).
 * Tag: idle(6) walk(8) attack01(7: thu người rồi đâm lướt) attack02(7: giơ đao chém bổ) hurt(4) death(4).
 */
export const DEMON_SPRITE: SpriteEnemyDef = {
  texture: CHARACTER_TEXTURES.demon,
  scale: S,
  origin: { x: 0.525, y: 0.59 },
  idle: 'idle',
  walk: 'walk',
  hurt: 'hurt',
  death: 'death',
  // Đâm lướt: 4 khung thu người, 2 khung có vệt đâm, 1 khung thu đao. Lưỡi đao lúc lấy đà nằm sát chân
  normal: { tag: 'attack01', startup: [0, 1, 2, 3], active: [4, 5], recovery: [6], tip: { x: 0, y: -4 * S } },
  // Chém bổ: giơ đao lên rồi vòng ra sau lưng (lệch -18, -14 pixel ảnh), vệt chém ở khung 3-4
  red: { tag: 'attack02', startup: [0, 1, 2], active: [3, 4], recovery: [5, 6], tip: { x: -18 * S, y: -14 * S } },
  staggered: { tag: 'hurt', frame: 2 },
  broken: { tag: 'death', frame: 1 },
};

/**
 * Huyết quái (Tiny RPG 02, Blood Monster_A). Thân ở x ≈ 42..61, chân ở hàng y = 56 => gốc chân (0.515, 0.57).
 * Tag: idle(6) walk(8) attack01(8: giơ vuốt rồi vồ) attack02(8: há miệng rồi lao tới cắn) hurt(4) death(4).
 */
export const BLOOD_MONSTER_SPRITE: SpriteEnemyDef = {
  texture: CHARACTER_TEXTURES.bloodMonster,
  scale: S,
  origin: { x: 0.515, y: 0.57 },
  idle: 'idle',
  walk: 'walk',
  hurt: 'hurt',
  death: 'death',
  // Vồ: móng giơ cao phía trước (lệch 9, -19 pixel ảnh), vệt vuốt ở khung 4-5
  normal: { tag: 'attack01', startup: [0, 1, 2, 3], active: [4, 5], recovery: [6, 7], tip: { x: 9 * S, y: -19 * S } },
  // Cắn: miệng há dần trong 5 khung (chỗ loé sáng là cái miệng), lao tới ở khung 5-6
  red: { tag: 'attack02', startup: [0, 1, 2, 3, 4], active: [5, 6], recovery: [7], tip: { x: 0, y: -11 * S } },
  staggered: { tag: 'hurt', frame: 2 },
  broken: { tag: 'death', frame: 1 },
};
