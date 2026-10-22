import Phaser from 'phaser';
import { ATLAS } from '../config';
import { ARROW_TEXTURE } from '../combat/arrows';
import { THEME_LIST } from '../themes';
import { createPixelTextures, PX } from '../themes/pixel/textures';
import { VI_TEXT } from '../ui/textStyle';
import type { GameSceneData } from './GameScene';

/**
 * Nạp toàn bộ tài nguyên một lần trước khi vào game, kèm thanh tiến độ.
 * Ảnh ít nên thanh chạy chớp nhoáng; khi game có hàng trăm ảnh, nhạc thì mới thấy rõ.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    const { width, height } = this.scale;
    const barWidth = 600;
    const barHeight = 24;

    this.add.rectangle(width / 2, height / 2, barWidth + 12, barHeight + 12).setStrokeStyle(4, 0x2b2b2b);
    // Thanh đầy dần bằng scaleX (0..1), gốc ở mép trái để nó dài ra về bên phải
    const fill = this.add.rectangle(width / 2 - barWidth / 2, height / 2, barWidth, barHeight, 0x2b2b2b).setOrigin(0, 0.5).setScale(0, 1);
    const label = this.add.text(width / 2, height / 2 - 60, 'Đang tải...', { ...VI_TEXT, fontSize: '28px', color: '#2b2b2b' }).setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => fill.setScale(progress, 1));
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => label.setText(`Lỗi tải: ${file.src}`));

    // Atlas = 1 ảnh lớn chứa nhiều hình nhỏ + file JSON ghi vị trí từng hình (frame).
    // Nạp 1 ảnh nhanh hơn nạp 100 ảnh lẻ, và GPU vẽ nhanh hơn vì không phải đổi ảnh liên tục.
    this.load.atlas(ATLAS, 'assets/atlases/scribble.png', 'assets/atlases/scribble.json');

    // Sprite sheet + JSON định dạng Aseprite: vừa là atlas (vị trí từng khung), vừa có thời lượng từng khung
    // và các TAG (idle, walk, attack01...) = tên các animation. Tạo bằng tools/aseprite-grid-to-json.mjs.
    this.load.aseprite(PX.soldier, 'assets/characters/soldier/soldier.png', 'assets/characters/soldier/soldier.json');
    this.load.aseprite(PX.orc, 'assets/characters/orc/orc.png', 'assets/characters/orc/orc.json');
    this.load.image(ARROW_TEXTURE, 'assets/projectiles/arrow.png');
  }

  create() {
    // Gạch, nền, hiệu ứng của chế độ Pixel không có file: vẽ bằng code ngay lúc này (một lần)
    createPixelTextures(this);

    // Mở thẳng một chế độ, bỏ qua màn chọn: http://localhost:5173/?theme=pixel (tiện khi đang làm / test một chế độ)
    const requested = new URLSearchParams(window.location.search).get('theme');
    const theme = THEME_LIST.find((t) => t.id === requested);
    if (theme) this.scene.start('GameScene', { theme: theme.id } satisfies GameSceneData);
    else this.scene.start('MenuScene');
  }
}
