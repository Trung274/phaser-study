import { ARROW_SPECIAL } from '../../combat/specials';
import { BLOOD_MONSTER, DEMON } from '../../entities/enemyStats';
import { ICE_CAVE_LEVEL } from '../../level/iceCave';
import { SpritePlayerLook } from '../../looks/SpritePlayerLook';
import { SpriteEnemyLook } from '../../looks/SpriteEnemyLook';
import { HEAVY_FONT } from '../../ui/textStyle';
import type { Theme } from '../types';
import { createPixelBackground } from './background';
import { BLOOD_MONSTER_SPRITE, DEMON_SPRITE, SOLDIER_SPRITE } from './characters';
import { ICE } from './palettes';
import { ICE_TEXTURES, PIXEL_SCALE } from './textures';

/**
 * Chế độ Hang Băng: quỷ và huyết quái của gói Tiny RPG 02 (gói này chỉ có quái => dùng lại lính của gói 01).
 * Gạch, nền, hiệu ứng là ĐÚNG bộ hàm vẽ của chế độ Pixel, chỉ đổi bảng màu sang băng (palette swap),
 * thêm trần hang treo chông và bụi băng rơi.
 */
export const ICE_THEME: Theme = {
  id: 'ice',
  name: 'Hang Băng',
  description: 'Gói Tiny RPG 02: quỷ cầm đao (nhanh, ít máu) và huyết quái (chậm, trâu, lao tới cắn rất xa). Gạch và nền là bộ Pixel đổi bảng màu.',
  map: ICE_CAVE_LEVEL,
  arena: null,
  backgroundColor: '#04070f',
  tileset: {
    texture: ICE_TEXTURES.tiles,
    scale: PIXEL_SCALE,
    legend: {
      '#': { kind: 'solid', frame: 'ground' },
      B: { kind: 'solid', frame: 'brick' },
      C: { kind: 'solid', frame: 'crate' },
      '=': { kind: 'oneWay', frame: 'bridge' },
      b: { kind: 'decor', frame: 'bush' },    // gò tuyết
      f: { kind: 'decor', frame: 'fence' },
      T: { kind: 'decor', frame: 'tree' },    // cây băng
      F: { kind: 'decor', frame: 'banner' },
      c: { kind: 'decor', frame: 'crystal' }, // cụm pha lê
    },
    groundTop: 'ground_top',
    oneWayThickness: 5 * PIXEL_SCALE,
  },
  fx: {
    texture: ICE_TEXTURES.fx,
    font: HEAVY_FONT,
    ink: ICE.paper,
    calloutInk: '#e8f4ff',
    calloutStroke: '#0b1220',
  },
  hud: {
    heart: { texture: ICE_TEXTURES.fx, frame: 'heart', scale: 0.5 },
    qiOrb: { texture: ICE_TEXTURES.fx, full: 'orb_full', empty: 'orb_empty', scale: 0.375 },
    text: '#e8f4ff',
    ink: ICE.paper,
    panel: ICE.ink,
    panelAlpha: 0.8,
    corner: 0,
  },
  special: ARROW_SPECIAL,
  enemies: {
    E: { stats: DEMON, createLook: (scene, x, feetY) => new SpriteEnemyLook(scene, x, feetY, DEMON_SPRITE) },
    M: { stats: BLOOD_MONSTER, createLook: (scene, x, feetY) => new SpriteEnemyLook(scene, x, feetY, BLOOD_MONSTER_SPRITE) },
  },
  createBackground: (scene, level) =>
    createPixelBackground(scene, level, { textures: ICE_TEXTURES, palette: ICE, moon: false, ceiling: true, snow: true }),
  createPlayerLook: (scene, x, feetY) => new SpritePlayerLook(scene, x, feetY, SOLDIER_SPRITE),
};
