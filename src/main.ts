import './style.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GRAVITY } from './config';
import { PreloadScene } from './scenes/PreloadScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO, // Phaser tự chọn WebGL, máy không hỗ trợ thì dùng Canvas
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1b1a22', // màu nền canvas; mỗi chế độ chơi tự đặt màu nền camera riêng
  parent: 'app', // gắn canvas vào <div id="app"> trong index.html
  scale: {
    // Game vẫn "nghĩ" mình rộng 1920×1080 (mọi toạ độ giữ nguyên),
    // Phaser chỉ co canvas cho vừa cửa sổ, giữ tỉ lệ 16:9, phần thừa là viền đen
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade', // hệ vật lý đơn giản: vận tốc + va chạm hình hộp
    arcade: {
      gravity: { x: 0, y: GRAVITY },
      debug: false, // bấm H trong game để bật/tắt khung va chạm
    },
  },
  // Scene đầu mảng tự chạy khi mở game. Thứ tự trong mảng = thứ tự vẽ: UIScene đứng sau nên luôn vẽ đè lên GameScene
  scene: [PreloadScene, MenuScene, GameScene, UIScene],
});

// Chỉ khi chạy `npm run dev`: gắn game vào window để mở console (F12) gõ __game mà soi/sửa trạng thái.
// Bản build phát hành (npm run build) tự bỏ đoạn này.
if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
