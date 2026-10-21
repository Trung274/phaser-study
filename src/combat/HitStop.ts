import Phaser from 'phaser';

/**
 * Hit-stop: khi chém trúng, cả thế giới đứng hình vài chục mili giây.
 * Não người chơi cảm nhận khoảnh khắc khựng đó như "lực cản" của lưỡi kiếm xuyên qua vật.
 *
 * Đếm giờ bằng delta THẬT trong GameScene.update (không dùng tween hay clock của game),
 * vì chính những thứ đó đang bị dừng.
 */
export class HitStop {
  private readonly scene: Phaser.Scene;
  private remaining = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get active() {
    return this.remaining > 0;
  }

  /** Đứng hình `ms` mili giây. Đang đứng hình mà trúng thêm thì kéo dài, không cộng dồn. */
  trigger(ms: number) {
    if (!this.active) {
      this.scene.physics.world.pause();
      this.scene.tweens.pauseAll();
    }
    this.remaining = Math.max(this.remaining, ms);
  }

  update(delta: number) {
    if (!this.active) return;
    this.remaining -= delta;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.scene.physics.world.resume();
      this.scene.tweens.resumeAll();
    }
  }
}
