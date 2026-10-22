/**
 * Bảng màu cho pixel art vẽ bằng code. Hàm vẽ (pixelArt.ts) chỉ biết "vai trò" của màu
 * (lớp mặt đất, đất bên dưới, đá, gỗ, lá...), còn màu cụ thể lấy từ bảng.
 * Đổi bảng màu = cùng hình vẽ ra một vùng đất khác (palette swap): game NES dùng mẹo này để có thêm
 * quái, thêm màn mà không tốn thêm bộ nhớ. Ít màu, có chủ đích => mọi thứ tự vẽ hợp tông với nhau.
 */
export interface Palette {
  /** Bầu trời / vòm hang: các mốc màu từ đỉnh màn hình (0) xuống đáy (1). */
  sky: [number, number][];
  star: number;
  starBright: number;
  moon: number;
  moonShade: number;
  /** Lớp nền xa (núi) và lớp nền gần (rừng / gai băng). */
  far: number;
  farLight: number;
  near: number;
  nearLight: number;
  /** Lớp phủ mặt đất: cỏ / tuyết. */
  surfaceLight: number;
  surface: number;
  surfaceDark: number;
  /** Đất bên dưới: đất nâu / đá đông cứng. */
  soil: number;
  soilLight: number;
  soilDark: number;
  soilDeep: number;
  /** Gạch đá, sỏi. */
  stone: number;
  stoneLight: number;
  stoneDark: number;
  mortar: number;
  /** Gỗ (thùng, cầu, hàng rào) + màu viền. */
  wood: number;
  woodLight: number;
  woodDark: number;
  outline: number;
  /** Tán lá: cây thông, bụi cây (bảng băng: cây băng, gò tuyết). */
  foliage: number;
  foliageLight: number;
  foliageDark: number;
  trunk: number;
  /** Pha lê trang trí. */
  crystal: number;
  crystalLight: number;
  crystalDark: number;
  /** Cờ: KHÔNG dùng đỏ (trong game đỏ = đòn không đỡ được). */
  flag: number;
  flagDark: number;
  pole: number;
  /** Màu Qi: giữ vàng ở mọi bảng màu, vì vàng = cửa sổ đỡ hoàn hảo / Qi trong ngôn ngữ hình ảnh của game. */
  gold: number;
  /** Giao diện + hiệu ứng: nền tối, nét sáng, trái tim. */
  ink: number;
  paper: number;
  paperShade: number;
  heart: number;
  heartLight: number;
  heartDark: number;
}

/** Hoàng hôn tím: rừng thông, cỏ xanh, đất nâu (chế độ Pixel: Lính & Orc). */
export const DUSK: Palette = {
  sky: [
    [0, 0x0f1029],
    [0.28, 0x221d4d],
    [0.48, 0x43296a],
    [0.62, 0x7a3a74],
    [0.72, 0xb8566f],
    [0.8, 0xe07f6c],
    [1, 0xf4a873],
  ],
  star: 0x9d93c4,
  starBright: 0xfff4d6,
  moon: 0xf3e3b8,
  moonShade: 0xd9c08a,
  far: 0x3d2f63,
  farLight: 0x5a4a86,
  near: 0x1d1838,
  nearLight: 0x2f2858,
  surfaceLight: 0x8ccf52,
  surface: 0x5aa83f,
  surfaceDark: 0x2f6b34,
  soil: 0x7a4f2e,
  soilLight: 0x9a6a3c,
  soilDark: 0x5a3822,
  soilDeep: 0x3e2618,
  stone: 0x6e6a7c,
  stoneLight: 0x8c88a0,
  stoneDark: 0x4a4658,
  mortar: 0x2a2736,
  wood: 0xa0683a,
  woodLight: 0xc48a4e,
  woodDark: 0x6a4024,
  outline: 0x24160e,
  foliage: 0x3f7a45,
  foliageLight: 0x5c9a52,
  foliageDark: 0x24452e,
  trunk: 0x5a3a24,
  crystal: 0x7a5ccf,
  crystalLight: 0xb79cff,
  crystalDark: 0x3d2c78,
  flag: 0x3f6fd8,
  flagDark: 0x2a4a9a,
  pole: 0xc8c8d0,
  gold: 0xf2c94c,
  ink: 0x14121f,
  paper: 0xf4ecd8,
  paperShade: 0xb9a68c,
  heart: 0xe04050,
  heartLight: 0xff8a96,
  heartDark: 0x5a1020,
};

/**
 * Hang băng: xanh lạnh, ít bão hoà. Quái của gói Tiny RPG 02 màu đỏ sẫm => nền phải lạnh để quái nổi lên,
 * và để màu đỏ của "đòn không đỡ được" không bị chìm vào nền.
 */
export const ICE: Palette = {
  sky: [
    [0, 0x04070f],
    [0.3, 0x0a1528],
    [0.55, 0x10284a],
    [0.78, 0x174469],
    [1, 0x2a6f8f],
  ],
  star: 0x3f7fa0,
  starBright: 0xbfefff,
  moon: 0xdff6ff,
  moonShade: 0xa9d8e8,
  far: 0x112640,
  farLight: 0x1f4a6e,
  near: 0x0a1830,
  nearLight: 0x1d4f73,
  surfaceLight: 0xf4fbff,
  surface: 0xd2e9f5,
  surfaceDark: 0x8fb5cc,
  soil: 0x3b5068,
  soilLight: 0x55708a,
  soilDark: 0x2a3a4e,
  soilDeep: 0x1c2838,
  stone: 0x6f9bbd,
  stoneLight: 0xa6d1ea,
  stoneDark: 0x46708f,
  mortar: 0x1d2c40,
  wood: 0x7b6a5e,
  woodLight: 0x9c8a7c,
  woodDark: 0x51443c,
  outline: 0x141c28,
  foliage: 0x8fd3ea,
  foliageLight: 0xe2f8ff,
  foliageDark: 0x3c86a6,
  trunk: 0x4b5d70,
  crystal: 0x5fd3e8,
  crystalLight: 0xd4fbff,
  crystalDark: 0x1f6f8f,
  flag: 0x2f9aa0,
  flagDark: 0x1d6468,
  pole: 0xc8d8e4,
  gold: 0xf2c94c,
  ink: 0x0b1220,
  paper: 0xe8f4ff,
  paperShade: 0x9cc0d8,
  heart: 0xe04050,
  heartLight: 0xff8a96,
  heartDark: 0x5a1020,
};
