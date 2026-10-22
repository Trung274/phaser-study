import Phaser from 'phaser';
import { ARROW_TEXTURE } from '../../combat/arrows';
import { DUSK, ICE, type Palette } from './palettes';
import { makeForest, makeFxSheet, makeMoon, makeMote, makeMountains, makeSky, makeStars, makeTileset, type FrameRect, type PixelImage } from './pixelArt';

/** Ảnh nhân vật nạp từ file: sheet + JSON Aseprite (xem PreloadScene). */
export const CHARACTER_TEXTURES = {
  soldier: 'soldier',
  orc: 'orc',
  demon: 'demon',
  bloodMonster: 'blood-monster',
} as const;

/** Bộ texture vẽ bằng code của MỘT bảng màu: gạch, hiệu ứng, các lớp nền. */
export interface PixelTextureSet {
  tiles: string;
  fx: string;
  sky: string;
  stars: string;
  moon: string;
  mountains: string;
  forest: string;
}

function textureSet(prefix: string): PixelTextureSet {
  return {
    tiles: `${prefix}_tiles`,
    fx: `${prefix}_fx`,
    sky: `${prefix}_sky`,
    stars: `${prefix}_stars`,
    moon: `${prefix}_moon`,
    mountains: `${prefix}_mountains`,
    forest: `${prefix}_forest`,
  };
}

export const DUSK_TEXTURES = textureSet('dusk');
export const ICE_TEXTURES = textureSet('ice');
/** Hạt 1×1 màu trắng cho hiệu ứng hạt (bụi băng rơi), dùng chung mọi bảng màu. */
export const MOTE_TEXTURE = 'px_mote';

/** 1 pixel ảnh = 8 pixel màn hình: ô gạch 16px thành đúng TILE = 128px, nhân vật cao ~18px thành ~144px. */
export const PIXEL_SCALE = 8;

/** Kích thước các lớp nền, tính bằng pixel ảnh (nhân 8 ra pixel màn hình). */
export const BG = {
  skyHeight: 135,   // × 8 = 1080: đúng chiều cao màn hình
  layerWidth: 256,  // × 8 = 2048: rộng hơn màn hình một chút
  starsHeight: 64,
  mountainsHeight: 56,
  forestHeight: 48,
} as const;

/**
 * Mảng pixel => texture Phaser: vẽ lên một canvas rồi đăng ký frame con (như atlas).
 * NEAREST: phóng to giữ nguyên từng ô vuông pixel. Mặc định Phaser làm mượt (LINEAR) => phóng ×8 sẽ nhoè.
 */
function addPixelTexture(scene: Phaser.Scene, key: string, img: PixelImage, frames?: Record<string, FrameRect>) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, img.w, img.h);
  if (!texture) return;
  texture.getContext().putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
  texture.refresh(); // đẩy canvas lên GPU (lúc này Phaser đặt lại bộ lọc mặc định) => đặt NEAREST SAU refresh
  if (frames) for (const [name, r] of Object.entries(frames)) texture.add(name, 0, r.x, r.y, r.w, r.h);
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Cùng một bộ hàm vẽ, đổi bảng màu => một bộ texture khác. */
function addTextureSet(scene: Phaser.Scene, keys: PixelTextureSet, palette: Palette) {
  const tiles = makeTileset(palette);
  addPixelTexture(scene, keys.tiles, tiles.image, tiles.frames);
  const fx = makeFxSheet(palette);
  addPixelTexture(scene, keys.fx, fx.image, fx.frames);
  addPixelTexture(scene, keys.sky, makeSky(palette, BG.skyHeight));
  addPixelTexture(scene, keys.stars, makeStars(palette, BG.layerWidth, BG.starsHeight));
  addPixelTexture(scene, keys.moon, makeMoon(palette));
  addPixelTexture(scene, keys.mountains, makeMountains(palette, BG.layerWidth, BG.mountainsHeight));
  addPixelTexture(scene, keys.forest, makeForest(palette, BG.layerWidth, BG.forestHeight));
}

/** Tạo một lần lúc khởi động (PreloadScene.create), sau khi ảnh nhân vật đã nạp xong. */
export function createPixelTextures(scene: Phaser.Scene) {
  addTextureSet(scene, DUSK_TEXTURES, DUSK);
  addTextureSet(scene, ICE_TEXTURES, ICE);
  addPixelTexture(scene, MOTE_TEXTURE, makeMote());
  for (const key of [...Object.values(CHARACTER_TEXTURES), ARROW_TEXTURE]) {
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}
