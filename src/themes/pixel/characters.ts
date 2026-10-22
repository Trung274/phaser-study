import type { SpritePlayerDef } from '../../looks/SpritePlayerLook';
import type { SpriteEnemyDef } from '../../looks/SpriteEnemyLook';
import { PIXEL_SCALE, PX } from './textures';

/**
 * Lính (Tiny RPG Soldier). Ô 100×100, thân ở giữa (x ≈ 41..56), đế giày ở hàng y = 56 => gốc chân (0.495, 0.57).
 * Tag trong file: idle(6) walk(8) attack01(6: chém ngang) attack02(6: nhảy chém dọc) attack03(9: bắn cung) hurt(4) death(4).
 * Sheet không có nhảy, lướt, đỡ đòn => mượn khung của động tác khác có dáng gần giống nhất.
 */
export const SOLDIER: SpritePlayerDef = {
  texture: PX.soldier,
  scale: PIXEL_SCALE,
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
 * Orc (Tiny RPG Orc). Ô 100×100, thân ở x ≈ 44..65 (gồm cả rìu), đế giày y = 56 => gốc chân (0.533, 0.57).
 * Tag: idle(6) walk(8) attack01(6: bổ rìu) attack02(6: vung rìu qua đầu, dùng cho đòn đỏ) hurt(4) death(4: rơi đầu).
 */
export const ORC: SpriteEnemyDef = {
  texture: PX.orc,
  scale: PIXEL_SCALE,
  origin: { x: 0.533, y: 0.57 },
  idle: 'idle',
  walk: 'walk',
  hurt: 'hurt',
  death: 'death',
  normal: { tag: 'attack01', startup: [0, 1, 2], active: [3, 4], recovery: [5] },
  red: { tag: 'attack02', startup: [0, 1, 2], active: [3, 4], recovery: [5] },
  staggered: { tag: 'hurt', frame: 2 },
  broken: { tag: 'death', frame: 1 },  // ngã quỵ, chưa chết
  // Lưỡi rìu ở khung cuối của pha lấy đà: giơ cao sau đầu (đo từ sheet: lệch -12, -21 pixel ảnh so với gốc chân)
  weaponTip: { x: -12 * PIXEL_SCALE, y: -21 * PIXEL_SCALE },
};
