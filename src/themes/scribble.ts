import Phaser from 'phaser';
import { ATLAS } from '../config';
import { SCRIBBLE_FX } from '../combat/fxStyle';
import { TALISMAN_SPECIAL } from '../combat/specials';
import { GRUNT } from '../entities/enemyStats';
import { LEVEL_1, LEVEL_1_ARENA } from '../level/level1';
import type { BuiltLevel } from '../level/buildLevel';
import { ScribblePlayerLook } from '../looks/ScribblePlayerLook';
import { ScribbleEnemyLook } from '../looks/ScribbleEnemyLook';
import type { Theme } from './types';

/**
 * Parallax: lớp càng xa càng trôi chậm khi camera di chuyển (scrollFactor < 1).
 * Mắt người hiểu đó là chiều sâu => màn hình 2D trông có không gian.
 * Lớp xa còn được làm mờ (alpha) để lùi hẳn ra sau, không tranh chú ý với màn chơi.
 */
function createScribbleBackground(scene: Phaser.Scene, level: BuiltLevel) {
  const viewW = scene.scale.width;
  // Lớp có scrollFactor s chỉ trôi s × quãng camera đi => chỉ cần phủ kín chừng này chiều ngang
  const coverWidth = (s: number) => viewW + (level.width - viewW) * s;

  // Mây: rất xa, trôi chậm nhất
  const cloudFactor = 0.15;
  for (let i = 0, x = 120; x < coverWidth(cloudFactor); i++, x += 520 + ((i * 173) % 260)) {
    const frame = i % 2 === 0 ? 'background_cloudA' : 'background_cloudB';
    const y = 140 + ((i * 97) % 220); // "ngẫu nhiên" nhưng cố định giữa các lần chạy
    scene.add.image(x, y, ATLAS, frame).setScrollFactor(cloudFactor).setAlpha(0.8).setDepth(-20);
  }

  // Hàng cây xa: trôi bằng nửa tốc độ camera; gốc cây khuất sau mặt đất
  const treeFactor = 0.5;
  for (let i = 0, x = 60; x < coverWidth(treeFactor); i++, x += 190 + ((i * 131) % 150)) {
    const frame = i % 3 === 0 ? 'background_tree' : 'background_treeLarge';
    scene.add.image(x, 960, ATLAS, frame).setOrigin(0.5, 1).setScrollFactor(treeFactor).setAlpha(0.4).setDepth(-10);
  }
}

/** Chế độ gốc: bộ Kenney Scribble (nét vẽ tay), nhân vật diễn bằng code, cuối màn có boss. */
export const SCRIBBLE_THEME: Theme = {
  id: 'scribble',
  name: 'Giấy & Mực',
  description: 'Bộ Kenney Scribble: nét vẽ tay trên nền giấy, chuyển động tính bằng code. Cuối màn có boss Hắc Tướng.',
  map: LEVEL_1,
  arena: LEVEL_1_ARENA,
  backgroundColor: '#e4e2dd', // màu giấy: hợp nét vẽ đen trắng
  tileset: {
    texture: ATLAS,
    scale: 1,
    legend: {
      '#': { kind: 'solid', frame: 'tile' },
      B: { kind: 'solid', frame: 'tile_brick' },
      C: { kind: 'solid', frame: 'tile_crate' },
      '=': { kind: 'oneWay', frame: 'tile_bridge' },
      b: { kind: 'decor', frame: 'tile_bushHalf' },
      f: { kind: 'decor', frame: 'tile_fenceHigh' },
      T: { kind: 'decor', frame: 'tile_tree' },
      F: { kind: 'decor', frame: 'tile_flag' },
    },
    groundTop: 'tile_top',
    oneWayThickness: 40, // tấm ván cầu chỉ dày ~46px ở phần trên ô
  },
  fx: SCRIBBLE_FX,
  hud: {
    heart: { texture: ATLAS, frame: 'tile_heart', scale: 0.75 },
    qiOrb: null,
    text: '#2b2b2b',
    ink: 0x2b2b2b,
    panel: 0xffffff,
    panelAlpha: 0.8,
    corner: 14,
  },
  special: TALISMAN_SPECIAL,
  enemies: {
    E: { stats: GRUNT, createLook: (scene, x, feetY) => new ScribbleEnemyLook(scene, x, feetY) }, // lính giáo
  },
  createBackground: createScribbleBackground,
  createPlayerLook: (scene, x, feetY) => new ScribblePlayerLook(scene, x, feetY),
};
