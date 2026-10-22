import type Phaser from 'phaser';
import type { BuiltLevel, Tileset } from '../level/buildLevel';
import type { PlayerLook } from '../looks/PlayerLook';
import type { EnemyLook } from '../looks/EnemyLook';
import type { FxStyle } from '../combat/fxStyle';
import type { SpecialDef } from '../combat/specials';

export type ThemeId = 'scribble' | 'pixel';

/** Đấu trường boss (xem LEVEL_1_ARENA). */
export interface ArenaDef {
  leftCol: number;
  rightCol: number;
  triggerCol: number;
  checkpointCol: number;
}

/** Phần nhìn của HUD: trái tim, ô Qi, khung chữ. */
export interface HudStyle {
  heart: { texture: string; frame: string; scale: number };
  /** Ô Qi vẽ bằng ảnh; null = vẽ hình tròn bằng code (bộ Scribble không có ảnh ô Qi). */
  qiOrb: { texture: string; full: string; empty: string; scale: number } | null;
  /** Màu chữ (CSS). */
  text: string;
  /** Màu viền khung. */
  ink: number;
  panel: number;
  panelAlpha: number;
  /** Bo góc khung (pixel art: 0, góc vuông). */
  corner: number;
}

/**
 * Một "chế độ chơi": cùng luật chơi, cùng code gameplay, khác toàn bộ phần nhìn (và chiêu đặc biệt).
 * GameScene/UIScene chỉ đọc theme, không có chỗ nào if/else theo tên theme:
 * thêm chế độ mới = viết thêm một theme, không sửa scene.
 */
export interface Theme {
  id: ThemeId;
  /** Tên và mô tả trên màn hình chọn chế độ. */
  name: string;
  description: string;
  map: string[];
  arena: ArenaDef | null;
  /** Màu nền camera (chỗ không có hình nào phủ). */
  backgroundColor: string;
  tileset: Tileset;
  fx: FxStyle;
  hud: HudStyle;
  special: SpecialDef;
  createBackground(scene: Phaser.Scene, level: BuiltLevel): void;
  createPlayerLook(scene: Phaser.Scene, x: number, feetY: number): PlayerLook;
  createEnemyLook(scene: Phaser.Scene, x: number, feetY: number): EnemyLook;
}
