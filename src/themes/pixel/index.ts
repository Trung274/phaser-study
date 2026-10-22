import Phaser from 'phaser';
import { ARROW_SPECIAL } from '../../combat/specials';
import type { BuiltLevel } from '../../level/buildLevel';
import { SpritePlayerLook } from '../../looks/SpritePlayerLook';
import { SpriteEnemyLook } from '../../looks/SpriteEnemyLook';
import { HEAVY_FONT } from '../../ui/textStyle';
import type { Theme } from '../types';
import { ORC, SOLDIER } from './characters';
import { PIXEL_LEVEL } from './level';
import { PALETTE } from './pixelArt';
import { BG, PIXEL_SCALE, PX } from './textures';

// Vị trí các lớp nền trong thế giới, chọn sao cho lúc camera chạm đáy màn (đứng trên mặt đất)
// đỉnh núi ở khoảng y 400 trên màn hình, ngọn cây ở khoảng y 560, mặt đất ở y 824.
const STARS_FACTOR = 0.02;
const MOON_FACTOR = 0.03;
const MOUNTAINS_FACTOR = 0.15;
const MOUNTAINS_Y = 430;
const FOREST_FACTOR = 0.35;
const FOREST_Y = 630;

/**
 * Nền nhiều lớp kiểu pixel. Vẫn là parallax bằng scrollFactor như bộ Scribble, chỉ khác:
 * mỗi lớp là một dải ảnh nhỏ (vẽ bằng code) phóng ×8 rồi xếp nối tiếp nhau cho đủ dài.
 */
function createPixelBackground(scene: Phaser.Scene, level: BuiltLevel) {
  const S = PIXEL_SCALE;
  const viewW = scene.scale.width;
  const coverWidth = (factor: number) => viewW + (level.width - viewW) * factor;
  const repeatLayer = (key: string, factor: number, y: number, depth: number) => {
    const step = BG.layerWidth * S;
    for (let x = 0; x < coverWidth(factor); x += step) {
      scene.add.image(x, y, key).setOrigin(0, 0).setScale(S).setScrollFactor(factor).setDepth(depth);
    }
  };

  // Trời: ảnh rộng 1 pixel kéo giãn ngang, dính chặt vào camera (scrollFactor 0).
  // Làm to hơn màn hình một chút: lúc camera rung, mép ảnh không bị lộ ra.
  scene.add.image(-64, -64, PX.sky).setOrigin(0, 0).setScale(viewW + 128, S + 1).setScrollFactor(0).setDepth(-40);
  repeatLayer(PX.stars, STARS_FACTOR, 0, -39);
  scene.add.image(1440, 140, PX.moon).setOrigin(0, 0).setScale(S).setScrollFactor(MOON_FACTOR).setDepth(-38);
  repeatLayer(PX.mountains, MOUNTAINS_FACTOR, MOUNTAINS_Y, -30);
  repeatLayer(PX.forest, FOREST_FACTOR, FOREST_Y, -20);
  // Chân rừng kéo dài xuống tận đáy: nhìn xuống hố thấy bóng tối của rừng, không lộ bầu trời phía dưới
  const forestBottom = FOREST_Y + BG.forestHeight * S;
  scene.add.rectangle(0, forestBottom, coverWidth(FOREST_FACTOR), 1200, PALETTE.forest).setOrigin(0, 0).setScrollFactor(FOREST_FACTOR).setDepth(-20);
}

/** Chế độ Pixel: gói Tiny RPG (lính + orc vẽ sẵn từng khung), gạch và nền vẽ bằng code, bắn cung thay dán bùa. */
export const PIXEL_THEME: Theme = {
  id: 'pixel',
  name: 'Pixel: Lính & Orc',
  description: 'Gói Tiny RPG: animation vẽ sẵn từng khung, phóng ×8. Chiêu đặc biệt là bắn cung. Hạ hết orc để thắng.',
  map: PIXEL_LEVEL,
  arena: null,
  backgroundColor: '#0f1029',
  tileset: {
    texture: PX.tiles,
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
    texture: PX.fx,
    font: HEAVY_FONT,
    ink: PALETTE.paper,       // nền tối => nét sáng
    calloutInk: '#f4ecd8',
    calloutStroke: '#14121f',
  },
  hud: {
    heart: { texture: PX.fx, frame: 'heart', scale: 0.5 },          // 16px × 4 = 64px: vẫn là số nguyên lần
    qiOrb: { texture: PX.fx, full: 'orb_full', empty: 'orb_empty', scale: 0.375 }, // × 3
    text: '#f4ecd8',
    ink: PALETTE.paper,
    panel: PALETTE.ink,
    panelAlpha: 0.8,
    corner: 0,
  },
  special: ARROW_SPECIAL,
  createBackground: createPixelBackground,
  createPlayerLook: (scene, x, feetY) => new SpritePlayerLook(scene, x, feetY, SOLDIER),
  createEnemyLook: (scene, x, feetY) => new SpriteEnemyLook(scene, x, feetY, ORC),
};
