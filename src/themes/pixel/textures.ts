import Phaser from 'phaser';
import { ARROW_TEXTURE } from '../../combat/arrows';
import { makeForest, makeFxSheet, makeMoon, makeMountains, makeSky, makeStars, makeTileset, type FrameRect, type PixelImage } from './pixelArt';

/** Key của mọi texture chế độ Pixel. Nhân vật nạp từ file (PreloadScene); gạch, nền, hiệu ứng vẽ bằng code (pixelArt.ts). */
export const PX = {
  soldier: 'soldier',
  orc: 'orc',
  tiles: 'px_tiles',
  fx: 'px_fx',
  sky: 'px_sky',
  stars: 'px_stars',
  moon: 'px_moon',
  mountains: 'px_mountains',
  forest: 'px_forest',
} as const;

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

/** Tạo một lần lúc khởi động (PreloadScene.create), sau khi ảnh nhân vật đã nạp xong. */
export function createPixelTextures(scene: Phaser.Scene) {
  const tiles = makeTileset();
  addPixelTexture(scene, PX.tiles, tiles.image, tiles.frames);
  const fx = makeFxSheet();
  addPixelTexture(scene, PX.fx, fx.image, fx.frames);
  addPixelTexture(scene, PX.sky, makeSky(BG.skyHeight));
  addPixelTexture(scene, PX.stars, makeStars(BG.layerWidth, BG.starsHeight));
  addPixelTexture(scene, PX.moon, makeMoon());
  addPixelTexture(scene, PX.mountains, makeMountains(BG.layerWidth, BG.mountainsHeight));
  addPixelTexture(scene, PX.forest, makeForest(BG.layerWidth, BG.forestHeight));
  for (const key of [PX.soldier, PX.orc, ARROW_TEXTURE]) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
