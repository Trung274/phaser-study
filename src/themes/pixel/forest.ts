import { ARROW_SPECIAL } from '../../combat/specials';
import { GRUNT } from '../../entities/enemyStats';
import { FOREST_LEVEL } from '../../level/forest';
import { SpritePlayerLook } from '../../looks/SpritePlayerLook';
import { SpriteEnemyLook } from '../../looks/SpriteEnemyLook';
import { HEAVY_FONT } from '../../ui/textStyle';
import type { Theme } from '../types';
import { createPixelBackground } from './background';
import { ORC_SPRITE, SOLDIER_SPRITE } from './characters';
import { DUSK } from './palettes';
import { DUSK_TEXTURES, PIXEL_SCALE } from './textures';

/** Chế độ Pixel: Lính & Orc. Gói Tiny RPG 01 (lính + orc vẽ sẵn từng khung), gạch và nền bảng màu hoàng hôn. */
export const PIXEL_THEME: Theme = {
  id: 'pixel',
  name: 'Pixel: Lính & Orc',
  description: 'Gói Tiny RPG: animation vẽ sẵn từng khung, phóng ×8. Chiêu đặc biệt là bắn cung. Hạ hết orc để thắng.',
  map: FOREST_LEVEL,
  arena: null,
  backgroundColor: '#0f1029',
  tileset: {
    texture: DUSK_TEXTURES.tiles,
    scale: PIXEL_SCALE,
    legend: {
      '#': { kind: 'solid', frame: 'ground' },
      B: { kind: 'solid', frame: 'brick' },
      C: { kind: 'solid', frame: 'crate' },
      '=': { kind: 'oneWay', frame: 'bridge' },
      b: { kind: 'decor', frame: 'bush' },
      f: { kind: 'decor', frame: 'fence' },
      T: { kind: 'decor', frame: 'tree' },
      F: { kind: 'decor', frame: 'banner' },
    },
    groundTop: 'ground_top',
    oneWayThickness: 5 * PIXEL_SCALE, // tấm ván cầu dày 5 pixel ảnh
  },
  fx: {
    texture: DUSK_TEXTURES.fx,
    font: HEAVY_FONT,
    ink: DUSK.paper, // nền tối => nét sáng
    calloutInk: '#f4ecd8',
    calloutStroke: '#14121f',
  },
  hud: {
    heart: { texture: DUSK_TEXTURES.fx, frame: 'heart', scale: 0.5 },          // 16px × 4 = 64px: vẫn là số nguyên lần
    qiOrb: { texture: DUSK_TEXTURES.fx, full: 'orb_full', empty: 'orb_empty', scale: 0.375 }, // × 3
    text: '#f4ecd8',
    ink: DUSK.paper,
    panel: DUSK.ink,
    panelAlpha: 0.8,
    corner: 0,
  },
  special: ARROW_SPECIAL,
  enemies: {
    E: { stats: GRUNT, createLook: (scene, x, feetY) => new SpriteEnemyLook(scene, x, feetY, ORC_SPRITE) }, // orc: cùng chỉ số với lính giáo
  },
  createBackground: (scene, level) =>
    createPixelBackground(scene, level, { textures: DUSK_TEXTURES, palette: DUSK, moon: true, ceiling: false, snow: false }),
  createPlayerLook: (scene, x, feetY) => new SpritePlayerLook(scene, x, feetY, SOLDIER_SPRITE),
};
