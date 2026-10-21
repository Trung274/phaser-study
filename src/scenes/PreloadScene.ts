import Phaser from 'phaser';
import { ATLAS } from '../config';
import { VI_TEXT } from '../ui/textStyle';

/**
 * Nạp toàn bộ tài nguyên một lần trước khi vào game, kèm thanh tiến độ.
 * Giờ chỉ có 1 atlas nên thanh chạy chớp nhoáng; khi game có hàng trăm ảnh, nhạc thì mới thấy rõ.
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
  }

  create() {
    this.scene.start('GameScene');
  }
}
