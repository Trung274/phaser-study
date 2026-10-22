/**
 * Vẽ pixel art bằng code cho các chế độ Pixel: gạch 16×16, nền nhiều lớp, hiệu ứng, trái tim, ô Qi.
 * Gói Tiny RPG chỉ có NHÂN VẬT, nên phần còn lại phải tự vẽ cho cùng phong cách.
 *
 * Mọi hàm nhận một BẢNG MÀU (palettes.ts): cùng hình, đổi bảng màu là ra vùng đất khác (cỏ => tuyết...).
 * Toàn bộ file là HÀM THUẦN: chỉ tạo mảng pixel RGBA, không đụng tới trình duyệt hay Phaser.
 * => Xem trước được bằng Node (xuất PNG) trước khi đưa vào game; game chỉ việc chép mảng vào canvas.
 * Ngẫu nhiên nhưng có "hạt giống" (seed) cố định => lần nào chạy cũng ra đúng một hình.
 */
import type { Palette } from './palettes';

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

/** Mặt đất: lớp phủ (cỏ / tuyết) mép lởm chởm ngẫu nhiên, bên dưới là đất lốm đốm. */
function groundTop(p: Palette, seed: number) {
  const img = createImage(T, T);
  const rand = seeded(seed);
  soilNoise(img, p, 0, rand);
  for (let x = 0; x < T; x++) {
    const tip = rand() < 0.45 ? 0 : 1; // ngọn cỏ / mép tuyết cao thấp xen kẽ
    const depth = 4 + (rand() < 0.35 ? 1 : 0); // lớp phủ dày 4-5 pixel
    for (let y = 0; y < tip; y++) setPixel(img, x, y, 0, 0);
    setPixel(img, x, tip, p.surfaceLight);
    for (let y = tip + 1; y < depth; y++) setPixel(img, x, y, rand() < 0.25 ? p.surfaceLight : p.surface);
    setPixel(img, x, depth, p.surfaceDark); // bóng của lớp phủ đổ xuống đất
    if (rand() < 0.3) setPixel(img, x, depth + 1, p.surfaceDark); // rễ cỏ / tuyết chảy thòng xuống
  }
  return img;
}

/** Đất lốm đốm: nền + chấm sáng/tối + thỉnh thoảng một viên sỏi. */
function soilNoise(img: PixelImage, p: Palette, fromY: number, rand: () => number) {
  for (let y = fromY; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const r = rand();
      setPixel(img, x, y, r < 0.12 ? p.soilDark : r < 0.18 ? p.soilLight : r < 0.2 ? p.soilDeep : p.soil);
    }
  }
  for (let i = 0; i < 2; i++) {
    const px = Math.floor(rand() * (T - 2));
    const py = fromY + 4 + Math.floor(rand() * (T - fromY - 6));
    fillRect(img, px, py, 2, 2, p.stoneDark);
    setPixel(img, px, py, p.stoneLight);
  }
}

function ground(p: Palette, seed: number) {
  const img = createImage(T, T);
  soilNoise(img, p, 0, seeded(seed));
  return img;
}

/** Gạch đá: 2 hàng viên gạch so le, mỗi viên sáng ở mép trên-trái, tối ở mép dưới-phải. */
function brick(p: Palette) {
  const img = createImage(T, T);
  fillRect(img, 0, 0, T, T, p.mortar);
  const rows = [
    { y: 0, offset: 0 },
    { y: 8, offset: 4 },
  ];
  for (const { y, offset } of rows) {
    for (let bx = -offset; bx < T; bx += 8) {
      const x0 = Math.max(0, bx + 1);
      const x1 = Math.min(T - 1, bx + 7);
      if (x1 <= x0) continue;
      fillRect(img, x0, y + 1, x1 - x0 + 1, 6, p.stone);
      fillRect(img, x0, y + 1, x1 - x0 + 1, 1, p.stoneLight);
      fillRect(img, x0, y + 1, 1, 6, p.stoneLight);
      fillRect(img, x0, y + 6, x1 - x0 + 1, 1, p.stoneDark);
      fillRect(img, x1, y + 1, 1, 6, p.stoneDark);
    }
  }
  return img;
}

/** Thùng gỗ: khung viền tối, ván ngang, thanh chéo, đinh ở 4 góc. */
function crate(p: Palette) {
  const img = createImage(T, T);
  fillRect(img, 0, 0, T, T, p.outline);
  fillRect(img, 1, 1, T - 2, T - 2, p.woodDark);
  fillRect(img, 2, 2, T - 4, T - 4, p.wood);
  for (const y of [5, 10]) fillRect(img, 2, y, T - 4, 1, p.woodDark);
  for (let i = 2; i < T - 2; i++) {
    setPixel(img, i, T - 1 - i, p.woodLight);
    setPixel(img, i, T - i, p.woodDark);
  }
  for (const [x, y] of [[2, 2], [T - 3, 2], [2, T - 3], [T - 3, T - 3]]) setPixel(img, x, y, p.stoneLight);
  return img;
}

/** Cầu một chiều: một tấm ván mỏng ở trên cùng + hai thanh chống, phần dưới trống. */
function bridge(p: Palette) {
  const img = createImage(T, T);
  fillRect(img, 0, 0, T, 5, p.outline);
  fillRect(img, 0, 1, T, 3, p.wood);
  fillRect(img, 0, 1, T, 1, p.woodLight);
  for (const x of [4, 11]) setPixel(img, x, 2, p.woodDark);
  for (const x of [2, 13]) {
    fillRect(img, x, 5, 1, 4, p.outline);
    setPixel(img, x + (x < 8 ? 1 : -1), 5, p.outline);
  }
  return img;
}

/** Bụi cây thấp (bảng băng: gò tuyết): nửa vòm, đốm sáng phía trên. */
function bush(p: Palette, seed: number) {
  const img = createImage(T, T);
  const rand = seeded(seed);
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const d = Math.hypot((x + 0.5 - 8) / 8, (y + 0.5 - 16) / 8);
      if (d > 1) continue;
      const edge = d > 0.86;
      setPixel(img, x, y, edge ? p.foliageDark : rand() < 0.3 && y < 12 ? p.foliageLight : p.foliage);
    }
  }
  return img;
}

/** Hàng rào gỗ: 2 cọc + 2 thanh ngang. */
function fence(p: Palette) {
  const img = createImage(T, T);
  for (const y of [7, 11]) {
    fillRect(img, 0, y - 1, T, 3, p.outline);
    fillRect(img, 0, y, T, 1, p.wood);
  }
  for (const x of [2, 12]) {
    fillRect(img, x - 1, 3, 4, 13, p.outline);
    fillRect(img, x, 4, 2, 12, p.wood);
    setPixel(img, x, 4, p.woodLight);
  }
  return img;
}

/** Cây thông cao 2 ô (bảng băng: cây băng): 3 tầng tán tam giác chồng lên nhau + thân. */
function pine(p: Palette, seed: number) {
  const img = createImage(T, T * 2);
  const rand = seeded(seed);
  fillRect(img, 7, 24, 2, 8, p.trunk);
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
        setPixel(img, x, y, edge ? p.foliageDark : x < 8 && rand() < 0.35 ? p.foliageLight : p.foliage);
      }
    }
  }
  return img;
}

/** Cờ hiệu cao 2 ô: cột + lá cờ có huy hiệu vàng. */
function banner(p: Palette) {
  const img = createImage(T, T * 2);
  fillRect(img, 3, 2, 2, 30, p.pole);
  setPixel(img, 3, 1, p.gold);
  setPixel(img, 4, 1, p.gold);
  for (let y = 4; y < 16; y++) {
    const w = y < 13 ? 10 : 10 - (y - 12) * 3; // đuôi cờ xẻ chữ V
    for (let x = 5; x < 5 + w; x++) setPixel(img, x, y, x === 5 + w - 1 || y === 4 ? p.flagDark : p.flag);
  }
  fillRect(img, 8, 8, 3, 3, p.gold);
  return img;
}

/**
 * Cụm pha lê: 3 tinh thể nhọn mọc từ đất. Nửa trái sáng, nửa phải tối, viền đậm:
 * cách tô đơn giản nhất để khối có vẻ "có ánh sáng chiếu từ trái".
 */
function crystal(p: Palette) {
  const img = createImage(T, T);
  const shards = [
    { cx: 4.5, top: 7, half: 2 },
    { cx: 12, top: 9, half: 2 },
    { cx: 8, top: 1, half: 3 }, // tinh thể cao nhất vẽ sau cùng => nằm đè phía trước
  ];
  for (const { cx, top, half } of shards) {
    for (let y = top; y < T; y++) {
      const w = Math.min(half, (y - top) / 1.5 + 0.5); // đầu nhọn, nở dần rồi thẳng đứng
      const left = Math.floor(cx - w);
      const right = Math.ceil(cx + w) - 1;
      for (let x = left; x <= right; x++) {
        const edge = x === left || x === right || y === T - 1;
        setPixel(img, x, y, edge ? p.crystalDark : x < cx ? p.crystalLight : p.crystal);
      }
    }
  }
  return img;
}

/** Bộ gạch: mọi hình 16×16 xếp một hàng, cây và cờ (16×32) xếp hàng dưới. */
export function makeTileset(p: Palette): PixelSheet {
  const parts: [string, PixelImage][] = [
    ['ground_top', groundTop(p, 11)],
    ['ground', ground(p, 23)],
    ['brick', brick(p)],
    ['crate', crate(p)],
    ['bridge', bridge(p)],
    ['bush', bush(p, 5)],
    ['fence', fence(p)],
    ['crystal', crystal(p)],
  ];
  const tall: [string, PixelImage][] = [
    ['tree', pine(p, 7)],
    ['banner', banner(p)],
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
const SKY_BANDS = 14;

function mix(a: number, b: number, t: number) {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function skyColor(stops: [number, number][], t: number) {
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1];
    const [t1, c1] = stops[i];
    if (t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return stops[stops.length - 1][1];
}

/**
 * Bầu trời / vòm hang: ảnh rộng 1 pixel, game kéo giãn ngang cho phủ màn hình.
 * Pixel art không chuyển màu mượt mà chia thành từng DẢI màu; cuối mỗi dải xen kẽ hàng màu của dải sau
 * (dithering) để mắt thấy chuyển màu mềm hơn mà vẫn giữ chất pixel.
 */
export function makeSky(p: Palette, height: number): PixelImage {
  const img = createImage(1, height);
  for (let y = 0; y < height; y++) {
    const pos = (y / (height - 1)) * (SKY_BANDS - 1);
    const band = Math.floor(pos);
    const useNext = pos - band > 0.7 && y % 2 === 0;
    setPixel(img, 0, y, skyColor(p.sky, (band + (useNext ? 1 : 0)) / (SKY_BANDS - 1)));
  }
  return img;
}

/** Trăng tròn có vài vết rỗ. */
export function makeMoon(p: Palette): PixelImage {
  const img = createImage(24, 24);
  disc(img, 12, 12, 11, p.moon, p.moonShade);
  for (const [x, y, r] of [[8, 9, 2], [15, 14, 3], [11, 17, 1.5]]) disc(img, x, y, r, p.moonShade, p.moonShade);
  return img;
}

/** Sao (bảng băng: đốm băng lấp lánh trong hang): đa số là chấm mờ 1 pixel, vài đốm sáng hình dấu cộng. */
export function makeStars(p: Palette, width: number, height: number): PixelImage {
  const img = createImage(width, height);
  const rand = seeded(17);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rand() * width);
    const y = Math.floor(rand() * height * rand()); // dồn nhiều sao lên cao, gần chân trời ít sao
    if (rand() < 0.15) {
      setPixel(img, x, y, p.starBright);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) setPixel(img, (x + dx + width) % width, y + dy, p.star);
    } else {
      setPixel(img, x, y, rand() < 0.3 ? p.starBright : p.star);
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

/** Núi xa (bảng băng: vách băng xa): sườn dốc xuống bên phải có viền sáng dày hơn, như được chiếu từ bên đó. */
export function makeMountains(p: Palette, width: number, height: number): PixelImage {
  const img = createImage(width, height);
  const h = ridge(width, seeded(3), height * 0.45, height * 1.1, 0.62);
  for (let x = 0; x < width; x++) {
    const top = Math.max(0, Math.round(height - h[x]));
    const lit = h[x + 1] < h[x];
    for (let y = top; y < height; y++) setPixel(img, x, y, y < top + (lit ? 3 : 1) ? p.farLight : p.far);
  }
  return img;
}

/**
 * Rừng thông xa (bảng băng: rừng gai băng): hàng tam giác cao thấp khác nhau, phần dưới đặc
 * (chân rừng che kín đáy hố). Lật ngược ảnh này là thành trần hang treo đầy chông.
 */
export function makeForest(p: Palette, width: number, height: number): PixelImage {
  const img = createImage(width, height);
  const rand = seeded(9);
  const solidFrom = height - 12;
  fillRect(img, 0, solidFrom, width, height - solidFrom, p.near);
  for (let cx = 4; cx < width; cx += 9 + Math.floor(rand() * 7)) {
    const treeH = 16 + Math.floor(rand() * 20);
    const half = 5 + Math.floor(rand() * 3);
    const top = solidFrom - treeH;
    for (let y = top; y < solidFrom; y++) {
      const w = Math.round(((y - top) / treeH) * half);
      for (let x = cx - w; x <= cx + w; x++) {
        const wrapped = (x + width) % width; // tràn mép phải thì vẽ tiếp ở mép trái => lặp liền mạch
        setPixel(img, wrapped, y, y < top + 2 || x === cx - w ? p.nearLight : p.near);
      }
    }
  }
  return img;
}

/** Hạt 1×1 màu trắng: hạt bụi băng / tuyết rơi. Màu từng hạt do game tô (tint) lúc phát hạt. */
export function makeMote(): PixelImage {
  const img = createImage(1, 1);
  setPixel(img, 0, 0, 0xffffff);
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

function line16(p: Palette, length: number) {
  const img = createImage(T, T);
  const x0 = Math.floor((T - length) / 2);
  fillRect(img, x0, 7, length, 2, p.paper);
  setPixel(img, x0 + length - 1, 7, p.paperShade);
  return img;
}

/** Trái tim kiểu cổ điển 16×16. */
function heart16(p: Palette) {
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
  const colors: Record<string, number> = { X: p.heartDark, H: p.heart, L: p.heartLight };
  const img = createImage(T, T);
  shape.forEach((row, y) => [...row].forEach((ch, x) => colors[ch] !== undefined && setPixel(img, x, y, colors[ch])));
  return img;
}

function orb16(p: Palette, filled: boolean) {
  const img = createImage(T, T);
  disc(img, 8, 8, 5.5, filled ? p.gold : p.ink, p.paper);
  if (filled) setPixel(img, 6, 6, p.paper); // đốm sáng
  return img;
}

/** Hiệu ứng + trái tim + ô Qi, tên frame trùng với bộ Scribble để code hiệu ứng dùng chung. */
export function makeFxSheet(p: Palette): PixelSheet {
  const parts: [string, PixelImage][] = [
    ['effect_blast', ring16(5, p.paper, p.paperShade)],
    ['effect_blastLarge', ring16(7.5, p.paper, p.paperShade)],
    ['effect_shot', line16(p, 8)],
    ['effect_shotLarge', line16(p, 15)],
    ['heart', heart16(p)],
    ['orb_empty', orb16(p, false)],
    ['orb_full', orb16(p, true)],
  ];
  const sheet = createImage(parts.length * FX, FX);
  const frames: Record<string, FrameRect> = {};
  parts.forEach(([name, img], i) => {
    blit(sheet, img, i * FX, 0, FX_SCALE);
    frames[name] = { x: i * FX, y: 0, w: FX, h: FX };
  });
  return { image: sheet, frames };
}
