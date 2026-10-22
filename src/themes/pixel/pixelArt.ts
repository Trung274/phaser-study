/**
 * Vẽ pixel art bằng code cho chế độ Pixel: gạch 16×16, nền nhiều lớp, hiệu ứng, trái tim, ô Qi.
 * Gói Tiny RPG chỉ có NHÂN VẬT, nên phần còn lại phải tự vẽ cho cùng phong cách.
 *
 * Toàn bộ file là HÀM THUẦN: chỉ tạo mảng pixel RGBA, không đụng tới trình duyệt hay Phaser.
 * => Xem trước được bằng Node (xuất PNG) trước khi đưa vào game; game chỉ việc chép mảng vào canvas.
 * Ngẫu nhiên nhưng có "hạt giống" (seed) cố định => lần nào chạy cũng ra đúng một hình.
 */

export interface PixelImage {
  w: number;
  h: number;
  /** RGBA, 4 byte mỗi pixel. <ArrayBuffer>: ImageData của trình duyệt không nhận vùng nhớ chia sẻ (SharedArrayBuffer). */
  data: Uint8ClampedArray<ArrayBuffer>;
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Một ảnh lớn + bảng vị trí các hình con: giống atlas, chỉ khác là vẽ bằng code. */
export interface PixelSheet {
  image: PixelImage;
  frames: Record<string, FrameRect>;
}

// ============================================================================
// Bảng màu: hoàng hôn tím. Ít màu, có chủ đích => các phần tự vẽ hợp tông với nhau
// ============================================================================
export const PALETTE = {
  night: 0x0f1029,
  star: 0x9d93c4,
  starBright: 0xfff4d6,
  moon: 0xf3e3b8,
  moonShade: 0xd9c08a,
  mountain: 0x3d2f63,
  mountainLight: 0x5a4a86,
  forest: 0x1d1838,
  forestLight: 0x2f2858,
  grassLight: 0x8ccf52,
  grass: 0x5aa83f,
  grassDark: 0x2f6b34,
  dirt: 0x7a4f2e,
  dirtLight: 0x9a6a3c,
  dirtDark: 0x5a3822,
  dirtDeep: 0x3e2618,
  stone: 0x6e6a7c,
  stoneLight: 0x8c88a0,
  stoneDark: 0x4a4658,
  mortar: 0x2a2736,
  wood: 0xa0683a,
  woodLight: 0xc48a4e,
  woodDark: 0x6a4024,
  outline: 0x24160e,
  leaf: 0x3f7a45,
  leafLight: 0x5c9a52,
  leafDark: 0x24452e,
  bark: 0x5a3a24,
  banner: 0x3f6fd8,
  bannerDark: 0x2a4a9a,
  gold: 0xf2c94c,
  pole: 0xc8c8d0,
  ink: 0x14121f,
  paper: 0xf4ecd8,
  paperShade: 0xb9a68c,
  heart: 0xe04050,
  heartLight: 0xff8a96,
  heartDark: 0x5a1020,
} as const;

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32): cùng seed => cùng dãy số. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createImage(w: number, h: number): PixelImage {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}

function setPixel(img: PixelImage, x: number, y: number, color: number, alpha = 255) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (Math.floor(y) * img.w + Math.floor(x)) * 4;
  img.data[i] = (color >> 16) & 255;
  img.data[i + 1] = (color >> 8) & 255;
  img.data[i + 2] = color & 255;
  img.data[i + 3] = alpha;
}

function fillRect(img: PixelImage, x: number, y: number, w: number, h: number, color: number) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPixel(img, xx, yy, color);
}

/** Chép ảnh con vào ảnh lớn, phóng to `scale` lần theo kiểu "khối vuông" (không làm mượt). */
function blit(dst: PixelImage, src: PixelImage, dx: number, dy: number, scale = 1) {
  for (let y = 0; y < src.h * scale; y++) {
    for (let x = 0; x < src.w * scale; x++) {
      const si = (Math.floor(y / scale) * src.w + Math.floor(x / scale)) * 4;
      if (src.data[si + 3] === 0) continue;
      const di = ((dy + y) * dst.w + dx + x) * 4;
      dst.data.set(src.data.subarray(si, si + 4), di);
    }
  }
}

/** Hình tròn đặc (tâm, bán kính tính bằng pixel), viền 1 pixel màu khác. */
function disc(img: PixelImage, cx: number, cy: number, r: number, fill: number, outline: number) {
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r - 1) setPixel(img, x, y, fill);
      else if (d <= r) setPixel(img, x, y, outline);
    }
  }
}

// ============================================================================
// Gạch 16×16 (cây, cờ cao 16×32)
// ============================================================================
const T = 16;

/** Đất có cỏ: mép cỏ lởm chởm ngẫu nhiên, bên dưới là đất lốm đốm. */
function groundTop(seed: number) {
  const img = createImage(T, T);
  const rand = seeded(seed);
  dirtNoise(img, 0, rand);
  for (let x = 0; x < T; x++) {
    const tip = rand() < 0.45 ? 0 : 1; // ngọn cỏ cao thấp xen kẽ
    const depth = 4 + (rand() < 0.35 ? 1 : 0); // lớp cỏ dày 4-5 pixel
    for (let y = 0; y < tip; y++) setPixel(img, x, y, 0, 0);
    setPixel(img, x, tip, PALETTE.grassLight);
    for (let y = tip + 1; y < depth; y++) setPixel(img, x, y, rand() < 0.25 ? PALETTE.grassLight : PALETTE.grass);
    setPixel(img, x, depth, PALETTE.grassDark); // bóng cỏ đổ xuống đất
    if (rand() < 0.3) setPixel(img, x, depth + 1, PALETTE.grassDark); // rễ cỏ thòng xuống
  }
  return img;
}

/** Đất lốm đốm: nền nâu + chấm sáng/tối + thỉnh thoảng một viên sỏi. */
function dirtNoise(img: PixelImage, fromY: number, rand: () => number) {
  for (let y = fromY; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const r = rand();
      setPixel(img, x, y, r < 0.12 ? PALETTE.dirtDark : r < 0.18 ? PALETTE.dirtLight : r < 0.2 ? PALETTE.dirtDeep : PALETTE.dirt);
    }
  }
  for (let i = 0; i < 2; i++) {
    const px = Math.floor(rand() * (T - 2));
    const py = fromY + 4 + Math.floor(rand() * (T - fromY - 6));
    fillRect(img, px, py, 2, 2, PALETTE.stoneDark);
    setPixel(img, px, py, PALETTE.stoneLight);
  }
}

function ground(seed: number) {
  const img = createImage(T, T);
  dirtNoise(img, 0, seeded(seed));
  return img;
}

/** Gạch đá: 2 hàng viên gạch so le, mỗi viên sáng ở mép trên-trái, tối ở mép dưới-phải. */
function brick() {
  const img = createImage(T, T);
  fillRect(img, 0, 0, T, T, PALETTE.mortar);
  const rows = [
    { y: 0, offset: 0 },
    { y: 8, offset: 4 },
  ];
  for (const { y, offset } of rows) {
    for (let bx = -offset; bx < T; bx += 8) {
      const x0 = Math.max(0, bx + 1);
      const x1 = Math.min(T - 1, bx + 7);
      if (x1 <= x0) continue;
      fillRect(img, x0, y + 1, x1 - x0 + 1, 6, PALETTE.stone);
      fillRect(img, x0, y + 1, x1 - x0 + 1, 1, PALETTE.stoneLight);
      fillRect(img, x0, y + 1, 1, 6, PALETTE.stoneLight);
      fillRect(img, x0, y + 6, x1 - x0 + 1, 1, PALETTE.stoneDark);
      fillRect(img, x1, y + 1, 1, 6, PALETTE.stoneDark);
    }
  }
  return img;
}

/** Thùng gỗ: khung viền tối, ván ngang, thanh chéo, đinh ở 4 góc. */
function crate() {
  const img = createImage(T, T);
  fillRect(img, 0, 0, T, T, PALETTE.outline);
  fillRect(img, 1, 1, T - 2, T - 2, PALETTE.woodDark);
  fillRect(img, 2, 2, T - 4, T - 4, PALETTE.wood);
  for (const y of [5, 10]) fillRect(img, 2, y, T - 4, 1, PALETTE.woodDark);
  for (let i = 2; i < T - 2; i++) {
    setPixel(img, i, T - 1 - i, PALETTE.woodLight);
    setPixel(img, i, T - i, PALETTE.woodDark);
  }
  for (const [x, y] of [[2, 2], [T - 3, 2], [2, T - 3], [T - 3, T - 3]]) setPixel(img, x, y, PALETTE.stoneLight);
  return img;
}

/** Cầu gỗ một chiều: một tấm ván mỏng ở trên cùng + hai thanh chống, phần dưới trống. */
function bridge() {
  const img = createImage(T, T);
  fillRect(img, 0, 0, T, 5, PALETTE.outline);
  fillRect(img, 0, 1, T, 3, PALETTE.wood);
  fillRect(img, 0, 1, T, 1, PALETTE.woodLight);
  for (const x of [4, 11]) setPixel(img, x, 2, PALETTE.woodDark);
  for (const x of [2, 13]) {
    fillRect(img, x, 5, 1, 4, PALETTE.outline);
    setPixel(img, x + (x < 8 ? 1 : -1), 5, PALETTE.outline);
  }
  return img;
}

/** Bụi cây thấp: nửa vòm lá, đốm sáng phía trên. */
function bush(seed: number) {
  const img = createImage(T, T);
  const rand = seeded(seed);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = Math.hypot((x + 0.5 - 8) / 8, (y + 0.5 - 16) / 8);
      if (d > 1) continue;
      const edge = d > 0.86;
      setPixel(img, x, y, edge ? PALETTE.leafDark : rand() < 0.3 && y < 12 ? PALETTE.leafLight : PALETTE.leaf);
    }
  }
  return img;
}

/** Hàng rào gỗ: 2 cọc + 2 thanh ngang. */
function fence() {
  const img = createImage(T, T);
  for (const y of [7, 11]) {
    fillRect(img, 0, y - 1, T, 3, PALETTE.outline);
    fillRect(img, 0, y, T, 1, PALETTE.wood);
  }
  for (const x of [2, 12]) {
    fillRect(img, x - 1, 3, 4, 13, PALETTE.outline);
    fillRect(img, x, 4, 2, 12, PALETTE.wood);
    setPixel(img, x, 4, PALETTE.woodLight);
  }
  return img;
}

/** Cây thông cao 2 ô: 3 tầng lá tam giác chồng lên nhau + thân. */
function pine(seed: number) {
  const img = createImage(T, T * 2);
  const rand = seeded(seed);
  fillRect(img, 7, 24, 2, 8, PALETTE.bark);
  const tiers = [
    { top: 2, bottom: 12, half: 4 },
    { top: 8, bottom: 19, half: 6 },
    { top: 14, bottom: 26, half: 8 },
  ];
  for (const { top, bottom, half } of tiers) {
    for (let y = top; y < bottom; y++) {
      const w = Math.round(((y - top) / (bottom - top)) * half);
      for (let x = 8 - w; x < 8 + w; x++) {
        const edge = x === 8 - w || x === 8 + w - 1 || y === bottom - 1;
        setPixel(img, x, y, edge ? PALETTE.leafDark : x < 8 && rand() < 0.35 ? PALETTE.leafLight : PALETTE.leaf);
      }
    }
  }
  return img;
}

/** Cờ hiệu cao 2 ô: cột + lá cờ xanh có viền vàng (KHÔNG dùng đỏ: trong game đỏ = đòn không đỡ được). */
function banner() {
  const img = createImage(T, T * 2);
  fillRect(img, 3, 2, 2, 30, PALETTE.pole);
  setPixel(img, 3, 1, PALETTE.gold);
  setPixel(img, 4, 1, PALETTE.gold);
  for (let y = 4; y < 16; y++) {
    const w = y < 13 ? 10 : 10 - (y - 12) * 3; // đuôi cờ xẻ chữ V
    for (let x = 5; x < 5 + w; x++) setPixel(img, x, y, x === 5 + w - 1 || y === 4 ? PALETTE.bannerDark : PALETTE.banner);
  }
  fillRect(img, 8, 8, 3, 3, PALETTE.gold);
  return img;
}

/** Bộ gạch: mọi hình 16×16 xếp một hàng, cây và cờ (16×32) xếp hàng dưới. */
export function makeTileset(): PixelSheet {
  const parts: [string, PixelImage][] = [
    ['ground_top', groundTop(11)],
    ['ground', ground(23)],
    ['brick', brick()],
    ['crate', crate()],
    ['bridge', bridge()],
    ['bush', bush(5)],
    ['fence', fence()],
  ];
  const tall: [string, PixelImage][] = [
    ['tree', pine(7)],
    ['banner', banner()],
  ];
  const sheet = createImage(parts.length * T, T + T * 2);
  const frames: Record<string, FrameRect> = {};
  parts.forEach(([name, img], i) => {
    blit(sheet, img, i * T, 0);
    frames[name] = { x: i * T, y: 0, w: T, h: T };
  });
  tall.forEach(([name, img], i) => {
    blit(sheet, img, i * T, T);
    frames[name] = { x: i * T, y: T, w: T, h: T * 2 };
  });
  return { image: sheet, frames };
}

// ============================================================================
// Nền nhiều lớp. Các lớp núi/rừng/sao lặp lại theo chiều ngang: mép trái khớp mép phải.
// ============================================================================

/** Các mốc màu trời từ đỉnh màn hình (0) xuống đáy (1): đêm => tím => hồng => cam ở chân trời. */
const SKY_STOPS: [number, number][] = [
  [0, 0x0f1029],
  [0.28, 0x221d4d],
  [0.48, 0x43296a],
  [0.62, 0x7a3a74],
  [0.72, 0xb8566f],
  [0.8, 0xe07f6c],
  [1, 0xf4a873],
];
const SKY_BANDS = 14;

function mix(a: number, b: number, t: number) {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function skyColor(t: number) {
  for (let i = 1; i < SKY_STOPS.length; i++) {
    const [t0, c0] = SKY_STOPS[i - 1];
    const [t1, c1] = SKY_STOPS[i];
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}

/**
 * Bầu trời: ảnh rộng 1 pixel, game kéo giãn ngang cho phủ màn hình.
 * Pixel art không chuyển màu mượt mà chia thành từng DẢI màu; cuối mỗi dải xen kẽ hàng màu của dải sau
 * (dithering) để mắt thấy chuyển màu mềm hơn mà vẫn giữ chất pixel.
 */
export function makeSky(height: number): PixelImage {
  const img = createImage(1, height);
  for (let y = 0; y < height; y++) {
    const pos = (y / (height - 1)) * (SKY_BANDS - 1);
    const band = Math.floor(pos);
    const useNext = pos - band > 0.7 && y % 2 === 0;
    setPixel(img, 0, y, skyColor((band + (useNext ? 1 : 0)) / (SKY_BANDS - 1)));
  }
  return img;
}

/** Trăng tròn có vài vết rỗ. */
export function makeMoon(): PixelImage {
  const img = createImage(24, 24);
  disc(img, 12, 12, 11, PALETTE.moon, PALETTE.moonShade);
  for (const [x, y, r] of [[8, 9, 2], [15, 14, 3], [11, 17, 1.5]]) disc(img, x, y, r, PALETTE.moonShade, PALETTE.moonShade);
  return img;
}

/** Sao: đa số là chấm mờ 1 pixel, vài ngôi sáng hình dấu cộng. */
export function makeStars(width: number, height: number): PixelImage {
  const img = createImage(width, height);
  const rand = seeded(17);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height * rand()); // dồn nhiều sao lên cao, gần chân trời ít sao
    if (rand() < 0.15) {
      setPixel(img, x, y, PALETTE.starBright);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) setPixel(img, (x + dx + width) % width, y + dy, PALETTE.star);
    } else {
      setPixel(img, x, y, rand() < 0.3 ? PALETTE.starBright : PALETTE.star);
    }
  }
  return img;
}

/**
 * Dải núi lặp lại liền mạch: chiều cao sinh bằng "chia đôi đoạn thẳng rồi lệch ngẫu nhiên" (midpoint displacement).
 * Hai đầu dải bằng nhau nên ghép nối tiếp không lộ đường nối.
 */
function ridge(width: number, rand: () => number, base: number, spread: number, roughness: number) {
  const heights = new Array<number>(width + 1).fill(0);
  heights[0] = heights[width] = base;
  const divide = (a: number, b: number, spread: number) => {
    if (b - a < 2) return;
    const mid = (a + b) >> 1;
    heights[mid] = (heights[a] + heights[b]) / 2 + (rand() - 0.5) * spread;
    divide(a, mid, spread * roughness);
    divide(mid, b, spread * roughness);
  };
  divide(0, width, spread);
  return heights;
}

/** Núi xa: tím đậm hơn trời; sườn dốc xuống bên phải (hướng mặt trời lặn) có viền sáng dày hơn. */
export function makeMountains(width: number, height: number): PixelImage {
  const img = createImage(width, height);
  const h = ridge(width, seeded(3), height * 0.45, height * 1.1, 0.62);
  for (let x = 0; x < width; x++) {
    const top = Math.max(0, Math.round(height - h[x]));
    const lit = h[x + 1] < h[x];
    for (let y = top; y < height; y++) setPixel(img, x, y, y < top + (lit ? 3 : 1) ? PALETTE.mountainLight : PALETTE.mountain);
  }
  return img;
}

/** Rừng thông xa: hàng cây tam giác cao thấp khác nhau, phần dưới đặc (chân rừng che kín đáy hố). */
export function makeForest(width: number, height: number): PixelImage {
  const img = createImage(width, height);
  const rand = seeded(9);
  const solidFrom = height - 12;
  fillRect(img, 0, solidFrom, width, height - solidFrom, PALETTE.forest);
  for (let cx = 4; cx < width; cx += 9 + Math.floor(rand() * 7)) {
    const treeH = 16 + Math.floor(rand() * 20);
    const half = 5 + Math.floor(rand() * 3);
    const top = solidFrom - treeH;
    for (let y = top; y < solidFrom; y++) {
      const w = Math.round(((y - top) / treeH) * half);
      for (let x = cx - w; x <= cx + w; x++) {
        const wrapped = (x + width) % width; // tràn mép phải thì vẽ tiếp ở mép trái => lặp liền mạch
        setPixel(img, wrapped, y, y < top + 2 || x === cx - w ? PALETTE.forestLight : PALETTE.forest);
      }
    }
  }
  return img;
}

// ============================================================================
// Hiệu ứng + giao diện: vẽ ở cỡ 16×16 rồi phóng ×8 thành ô 128×128,
// đúng bằng cỡ các hình hiệu ứng của bộ Scribble => code hiệu ứng dùng chung không phải sửa tỉ lệ.
// ============================================================================
const FX = 128;
const FX_SCALE = FX / T;

function ring16(r: number, fill: number, outline: number) {
  const img = createImage(T, T);
  disc(img, 8, 8, r, fill, outline);
  return img;
}

function line16(length: number) {
  const img = createImage(T, T);
  const x0 = Math.floor((T - length) / 2);
  fillRect(img, x0, 7, length, 2, PALETTE.paper);
  setPixel(img, x0 + length - 1, 7, PALETTE.paperShade);
  return img;
}

/** Trái tim kiểu cổ điển 16×16. */
function heart16() {
  const shape = [
    '................',
    '................',
    '...XXX....XXX...',
    '..XLLHX..XHHHX..',
    '.XLLHHHXXHHHHHX.',
    '.XLHHHHHHHHHHHX.',
    '.XHHHHHHHHHHHHX.',
    '.XHHHHHHHHHHHHX.',
    '..XHHHHHHHHHHX..',
    '...XHHHHHHHHX...',
    '....XHHHHHHX....',
    '.....XHHHHX.....',
    '......XHHX......',
    '.......XX.......',
    '................',
    '................',
  ];
  const colors: Record<string, number> = { X: PALETTE.heartDark, H: PALETTE.heart, L: PALETTE.heartLight };
  const img = createImage(T, T);
  shape.forEach((row, y) => [...row].forEach((ch, x) => colors[ch] !== undefined && setPixel(img, x, y, colors[ch])));
  return img;
}

function orb16(filled: boolean) {
  const img = createImage(T, T);
  disc(img, 8, 8, 5.5, filled ? PALETTE.gold : PALETTE.ink, PALETTE.paper);
  if (filled) setPixel(img, 6, 6, PALETTE.paper); // đốm sáng
  return img;
}

/** Hiệu ứng + trái tim + ô Qi, tên frame trùng với bộ Scribble để code hiệu ứng dùng chung. */
export function makeFxSheet(): PixelSheet {
  const parts: [string, PixelImage][] = [
    ['effect_blast', ring16(5, PALETTE.paper, PALETTE.paperShade)],
    ['effect_blastLarge', ring16(7.5, PALETTE.paper, PALETTE.paperShade)],
    ['effect_shot', line16(8)],
    ['effect_shotLarge', line16(15)],
    ['heart', heart16()],
    ['orb_empty', orb16(false)],
    ['orb_full', orb16(true)],
  ];
  const sheet = createImage(parts.length * FX, FX);
  const frames: Record<string, FrameRect> = {};
  parts.forEach(([name, img], i) => {
    blit(sheet, img, i * FX, 0, FX_SCALE);
    frames[name] = { x: i * FX, y: 0, w: FX, h: FX };
  });
  return { image: sheet, frames };
}
