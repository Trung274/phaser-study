import Phaser from 'phaser';
import type { BuiltLevel } from '../../level/buildLevel';
import type { Palette } from './palettes';
import { BG, MOTE_TEXTURE, PIXEL_SCALE, type PixelTextureSet } from './textures';

/** Những lớp nền một chế độ pixel muốn có. */
export interface PixelBackgroundStyle {
  textures: PixelTextureSet;
  palette: Palette;
  moon: boolean;
  /** Trần hang: lớp rừng lật ngược thành hàng chông treo từ trên xuống. */
  ceiling: boolean;
  /** Bụi băng rơi lả tả (hiệu ứng hạt). */
  snow: boolean;
}

// Vị trí các lớp trong thế giới, chọn sao cho lúc camera chạm đáy màn (đứng trên mặt đất):
// đỉnh núi ở khoảng y 400 trên màn hình, ngọn cây ở khoảng y 560, mặt đất ở y 824.
const STARS_FACTOR = 0.02;
const MOON_FACTOR = 0.03;
const MOUNTAINS_FACTOR = 0.15;
const MOUNTAINS_Y = 430;
const FOREST_FACTOR = 0.35;
const FOREST_Y = 630;
const CEILING_FACTOR = 0.5;
const CEILING_Y = -50; // chân hàng chông ở khoảng y 230 trên màn hình

/**
 * Nền nhiều lớp kiểu pixel. Vẫn là parallax bằng scrollFactor như bộ Scribble, chỉ khác:
 * mỗi lớp là một dải ảnh nhỏ (vẽ bằng code) phóng ×8 rồi xếp nối tiếp nhau cho đủ dài.
 */
export function createPixelBackground(scene: Phaser.Scene, level: BuiltLevel, style: PixelBackgroundStyle) {
  const { textures, palette } = style;
  const S = PIXEL_SCALE;
  const viewW = scene.scale.width;
  const coverWidth = (factor: number) => viewW + (level.width - viewW) * factor;
  const repeatLayer = (key: string, factor: number, y: number, depth: number, flipY = false) => {
    const step = BG.layerWidth * S;
    for (let x = 0; x < coverWidth(factor); x += step) {
      scene.add.image(x, y, key).setOrigin(0, 0).setScale(S).setFlipY(flipY).setScrollFactor(factor).setDepth(depth);
    }
  };

  // Trời: ảnh rộng 1 pixel kéo giãn ngang, dính chặt vào camera (scrollFactor 0).
  // Làm to hơn màn hình một chút: lúc camera rung, mép ảnh không bị lộ ra.
  scene.add.image(-64, -64, textures.sky).setOrigin(0, 0).setScale(viewW + 128, S + 1).setScrollFactor(0).setDepth(-40);
  repeatLayer(textures.stars, STARS_FACTOR, 0, -39);
  if (style.moon) scene.add.image(1440, 140, textures.moon).setOrigin(0, 0).setScale(S).setScrollFactor(MOON_FACTOR).setDepth(-38);
  repeatLayer(textures.mountains, MOUNTAINS_FACTOR, MOUNTAINS_Y, -30);
  repeatLayer(textures.forest, FOREST_FACTOR, FOREST_Y, -20);
  // Chân rừng kéo dài xuống tận đáy: nhìn xuống hố thấy bóng tối, không lộ bầu trời phía dưới
  const forestBottom = FOREST_Y + BG.forestHeight * S;
  scene.add.rectangle(0, forestBottom, coverWidth(FOREST_FACTOR), 1200, palette.near).setOrigin(0, 0).setScrollFactor(FOREST_FACTOR).setDepth(-20);

  if (style.ceiling) {
    // Cùng ảnh rừng, lật dọc (flipY) => hàng chông băng treo ngược: không phải vẽ thêm gì
    repeatLayer(textures.forest, CEILING_FACTOR, CEILING_Y, -15, true);
    scene.add.rectangle(0, CEILING_Y - 1200, coverWidth(CEILING_FACTOR), 1200, palette.near).setOrigin(0, 0).setScrollFactor(CEILING_FACTOR).setDepth(-15);
  }
  if (style.snow) addFallingMotes(scene, palette);
}

/**
 * Hiệu ứng hạt (particle emitter): một "vòi" liên tục phun ra các hạt nhỏ, mỗi hạt có tốc độ, độ mờ,
 * màu, thời gian sống ngẫu nhiên trong khoảng cho trước; Phaser tự di chuyển và dọn hạt hết hạn.
 * Ở đây: bụi băng rơi chậm, hơi chéo, phủ cả màn hình. Dính vào camera (scrollFactor 0) nên đi đâu cũng thấy.
 */
function addFallingMotes(scene: Phaser.Scene, palette: Palette) {
  scene.add
    .particles(0, -8, MOTE_TEXTURE, {
      x: { min: 0, max: scene.scale.width },
      lifespan: 18000,
      speedY: { min: 40, max: 90 },
      speedX: { min: -25, max: 15 },
      scale: PIXEL_SCALE,                // hạt 1 pixel ảnh = ô vuông 8px, đúng lưới pixel
      alpha: { min: 0.3, max: 0.85 },
      tint: [palette.starBright, palette.foliageLight, palette.star],
      frequency: 140,                    // ms giữa hai hạt
      advance: 18000,                    // chạy trước 18 giây: vào màn là bụi đã rơi khắp màn hình
    })
    .setScrollFactor(0)
    .setDepth(-5); // trước các lớp nền, sau gạch và nhân vật: không che mất trận đánh
}
