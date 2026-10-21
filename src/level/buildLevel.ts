import Phaser from 'phaser';
import { ATLAS, TILE } from '../config';
import { mergeCells } from './mergeCells';

type TileKind = 'solid' | 'oneWay' | 'decor';

/** Ký tự trên bản đồ => loại ô + frame trong atlas. */
const LEGEND: Record<string, { kind: TileKind; frame: string }> = {
  '#': { kind: 'solid', frame: 'tile' }, // đất; ô nào lộ mặt trên thì đổi sang 'tile_top'
  B: { kind: 'solid', frame: 'tile_brick' },
  C: { kind: 'solid', frame: 'tile_crate' },
  '=': { kind: 'oneWay', frame: 'tile_bridge' },
  b: { kind: 'decor', frame: 'tile_bushHalf' },
  f: { kind: 'decor', frame: 'tile_fenceHigh' },
  T: { kind: 'decor', frame: 'tile_tree' },
  F: { kind: 'decor', frame: 'tile_flag' },
};

/** Tấm ván cầu chỉ dày ~46px ở phần trên ô => vùng va chạm cũng chỉ mỏng như vậy. */
const ONE_WAY_THICKNESS = 40;

const DEPTH_DECOR = 5;
const DEPTH_TILES = 10;

export interface BuiltLevel {
  width: number;
  height: number;
  /** Vị trí CHÂN người chơi lúc xuất phát. */
  spawn: { x: number; y: number };
  /** Vị trí CHÂN các hình nộm luyện chém (ký tự 'D'). */
  dummySpawns: { x: number; y: number }[];
  /** Vị trí CHÂN kẻ địch (ký tự 'E'). */
  enemySpawns: { x: number; y: number }[];
  /** Vị trí CHÂN boss (ký tự 'X'), không có thì null. */
  bossSpawn: { x: number; y: number } | null;
  /** Điểm (x, y) nằm trong ô đặc (đất, gạch, thùng)? */
  isSolidAt: (x: number, y: number) => boolean;
  /** Điểm (x, y) nằm trong ô đứng được (ô đặc hoặc cầu)? Dùng làm cảm biến mép vực cho kẻ địch. */
  isGroundAt: (x: number, y: number) => boolean;
  solids: Phaser.Physics.Arcade.StaticGroup;
  oneWays: Phaser.Physics.Arcade.StaticGroup;
}

/**
 * Dựng màn chơi từ lưới ký tự. Hai việc tách riêng:
 * 1. HÌNH: mỗi ô một ảnh từ atlas.
 * 2. VA CHẠM: gộp các ô đặc liền nhau thành ít hình chữ nhật lớn (vô hình).
 *    Ít vật thể hơn => nhanh hơn, và nhân vật không bị "vấp" ở khe giữa hai ô cạnh nhau.
 */
export function buildLevel(scene: Phaser.Scene, map: string[]): BuiltLevel {
  const rows = map.length;
  const cols = map[0].length;
  map.forEach((line, r) => {
    if (line.length !== cols) throw new Error(`Bản đồ: hàng ${r} dài ${line.length} ký tự, cần đúng ${cols}`);
  });

  const at = (c: number, r: number) => (r >= 0 && r < rows && c >= 0 && c < cols ? map[r][c] : '.');
  const solidCells: boolean[][] = [];
  const oneWayCells: boolean[][] = [];
  let spawn = { x: TILE, y: (rows - 1) * TILE };
  const dummySpawns: { x: number; y: number }[] = [];
  const enemySpawns: { x: number; y: number }[] = [];
  let bossSpawn: { x: number; y: number } | null = null;

  for (let r = 0; r < rows; r++) {
    solidCells.push([]);
    oneWayCells.push([]);
    for (let c = 0; c < cols; c++) {
      const ch = at(c, r);
      const def = LEGEND[ch];
      solidCells[r].push(def?.kind === 'solid');
      oneWayCells[r].push(def?.kind === 'oneWay');

      // Ký tự đánh dấu vị trí (không vẽ ô gạch): người chơi, hình nộm, kẻ địch
      const feet = { x: c * TILE + TILE / 2, y: (r + 1) * TILE };
      if (ch === 'P') spawn = feet;
      if (ch === 'D') dummySpawns.push(feet);
      if (ch === 'E') enemySpawns.push(feet);
      if (ch === 'X') bossSpawn = feet;
      if (ch === '.' || ch === 'P' || ch === 'D' || ch === 'E' || ch === 'X') continue;
      if (!def) throw new Error(`Bản đồ: ký tự lạ '${ch}' ở hàng ${r}, cột ${c}`);

      if (def.kind === 'decor') {
        // Đồ trang trí "đứng" trên đáy ô (gốc ở chân), vẽ sau lưng nhân vật
        scene.add.image(c * TILE + TILE / 2, (r + 1) * TILE + 2, ATLAS, def.frame).setOrigin(0.5, 1).setDepth(DEPTH_DECOR);
        continue;
      }
      // Autotile đơn giản: ô đất không có đất phía trên => đây là mặt đất => dùng hình có viền mặt
      const frame = ch === '#' && at(c, r - 1) !== '#' ? 'tile_top' : def.frame;
      scene.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2, ATLAS, frame).setDepth(DEPTH_TILES);
    }
  }

  // --- Vùng va chạm: Zone = hình chữ nhật vô hình, chỉ để gắn thân vật lý ---
  const solids = scene.physics.add.staticGroup();
  for (const { col, row, w, h } of mergeCells(solidCells, true)) {
    solids.add(scene.add.zone((col + w / 2) * TILE, (row + h / 2) * TILE, w * TILE, h * TILE));
  }

  const oneWays = scene.physics.add.staticGroup();
  for (const { col, row, w } of mergeCells(oneWayCells, false)) {
    const zone = scene.add.zone((col + w / 2) * TILE, row * TILE + ONE_WAY_THICKNESS / 2, w * TILE, ONE_WAY_THICKNESS);
    oneWays.add(zone);
    // Cầu một chiều: chỉ chặn khi đáp xuống từ phía trên.
    // Tắt va chạm mặt dưới và hai bên => nhảy từ dưới lên hay đi ngang đều xuyên qua.
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = false;
    body.checkCollision.left = false;
    body.checkCollision.right = false;
  }

  // Hỏi bản đồ trực tiếp theo ô: nhanh và đơn giản hơn nhiều so với dò va chạm vật lý
  const cellAt = (grid: boolean[][], x: number, y: number) => {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    return r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c];
  };
  const isSolidAt = (x: number, y: number) => cellAt(solidCells, x, y);
  const isGroundAt = (x: number, y: number) => cellAt(solidCells, x, y) || cellAt(oneWayCells, x, y);

  return { width: cols * TILE, height: rows * TILE, spawn, dummySpawns, enemySpawns, bossSpawn, isSolidAt, isGroundAt, solids, oneWays };
}
