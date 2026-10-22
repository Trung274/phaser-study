import Phaser from 'phaser';
import type { MoveTiming } from './PlayerLook';

/** Một khung cụ thể: { tag: 'attack01', frame: 2 } = khung thứ 3 của tag attack01 trong file Aseprite. */
export interface FrameRef {
  tag: string;
  frame: number;
}

/**
 * Animation chia theo frame data: mỗi pha của đòn chiếu những khung nào.
 * Vd. { tag: 'attack01', startup: [1, 2], active: [3, 4], recovery: [5] }:
 * lúc lấy đà chiếu khung 1-2 (giơ kiếm), đúng lúc lưỡi kiếm có hiệu lực chiếu khung 3-4 (có vệt chém)...
 */
export interface PhasedAnim {
  tag: string;
  startup: number[];
  active: number[];
  recovery: number[];
}

export type MovePhase = 'startup' | 'active' | 'recovery';

export interface SpriteSheetDef {
  /** Key đã nạp bằng this.load.aseprite (ảnh + JSON có tag). */
  texture: string;
  /** Phóng to bao nhiêu lần. Số nguyên: mỗi pixel ảnh thành một ô vuông đều nhau, không méo. */
  scale: number;
  /** Tâm CHÂN trong khung hình (tỉ lệ 0..1) khi nhân vật quay mặt sang phải. */
  origin: { x: number; y: number };
}

/** Đang ở pha nào của động tác và đã đi được bao nhiêu phần của pha đó (0..1). */
export function movePhase(timing: MoveTiming, t: number): { phase: MovePhase; progress: number } {
  if (t < timing.startup) return { phase: 'startup', progress: t / timing.startup };
  const activeEnd = timing.startup + timing.active;
  if (t < activeEnd) return { phase: 'active', progress: (t - timing.startup) / timing.active };
  return { phase: 'recovery', progress: Math.min(1, (t - activeEnd) / timing.recovery) };
}

const OUTLINE_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Sprite pixel art + bảng khung hình đọc từ JSON Aseprite. Gom những việc bộ da nào dùng sprite sheet cũng cần:
 * - loop(): animation "trang trí" (đứng thở, bước đi): để Phaser tự chạy theo thời lượng từng khung trong file.
 * - atTime() / phase(): khung hình đi theo ĐỒNG HỒ CỦA LUẬT CHƠI (thời gian trong trạng thái, frame data).
 *   Đứng hình, huỷ đòn giữa chừng, nối combo... thì khung hình vẫn khớp với lúc hitbox bật/tắt.
 * - face(): lật trái/phải mà thân không bị xê dịch.
 * - setOutline(): viền 1 pixel quanh nhân vật = 4 bản sao tô một màu, lệch 1 pixel ảnh về 4 phía, vẽ phía sau.
 */
export class SpriteRig {
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly def: SpriteSheetDef;
  private readonly frameNames = new Map<string, string[]>();
  private readonly frameDurations = new Map<string, number[]>();
  private readonly outline: Phaser.GameObjects.Image[] = [];
  private looping = '';

  constructor(scene: Phaser.Scene, x: number, y: number, def: SpriteSheetDef, depth: number) {
    this.def = def;
    this.sprite = scene.add.sprite(x, y, def.texture).setScale(def.scale).setOrigin(def.origin.x, def.origin.y).setDepth(depth);
    // Mỗi tag trong file Aseprite thành một animation (tên animation = tên tag), tạo RIÊNG cho sprite này:
    // lính và orc trùng tên tag ('idle', 'walk'...) nên không tạo chung cho cả game được.
    for (const anim of this.sprite.anims.createFromAseprite(def.texture)) {
      this.frameNames.set(anim.key, anim.frames.map((f) => String(f.textureFrame)));
      this.frameDurations.set(anim.key, anim.frames.map((f) => f.duration));
    }
  }

  /** Tổng thời lượng một tag (ms), theo file Aseprite. */
  duration(tag: string) {
    return (this.frameDurations.get(tag) ?? []).reduce((sum, ms) => sum + ms, 0);
  }

  /** Animation lặp do Phaser tự chạy. Gọi mỗi frame được: đang chạy đúng tag đó thì chỉ chỉnh tốc độ. */
  loop(tag: string, timeScale = 1) {
    if (this.looping !== tag || !this.sprite.anims.isPlaying) {
      this.sprite.play({ key: tag, repeat: -1 });
      this.looping = tag;
    }
    this.sprite.anims.timeScale = timeScale;
  }

  /** Hiện đúng một khung (dừng animation lặp nếu đang chạy). */
  show(tag: string, index: number) {
    const names = this.frameNames.get(tag);
    if (!names) return;
    if (this.looping) {
      this.sprite.anims.stop();
      this.looping = '';
    }
    const name = names[Phaser.Math.Clamp(index, 0, names.length - 1)];
    if (this.sprite.frame.name !== name) this.sprite.setFrame(name);
  }

  hold(ref: FrameRef) {
    this.show(ref.tag, ref.frame);
  }

  /** Khung theo thời gian đã trôi (ms), dùng đúng thời lượng từng khung trong file; hết animation thì giữ khung cuối. */
  atTime(tag: string, ms: number) {
    const durations = this.frameDurations.get(tag) ?? [];
    let index = 0;
    let frameEnd = durations[0] ?? 0;
    while (index < durations.length - 1 && ms >= frameEnd) {
      index++;
      frameEnd += durations[index];
    }
    this.show(tag, index);
  }

  /** Khung theo frame data: đang ở pha nào thì chiếu các khung của pha đó, chia đều thời gian của pha. */
  phase(anim: PhasedAnim, phase: MovePhase, progress: number) {
    const frames = anim[phase];
    this.show(anim.tag, frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))]);
  }

  /**
   * Lật theo hướng nhìn. flipX lật ẢNH bên trong khung chứ không lật quanh gốc:
   * thân không nằm chính giữa khung thì phải đổi gốc theo (x → 1 - x), kẻo quay đầu là thân nhảy lệch sang bên.
   */
  face(dir: 1 | -1) {
    const flipped = dir < 0;
    this.sprite.setFlipX(flipped).setOrigin(flipped ? 1 - this.def.origin.x : this.def.origin.x, this.def.origin.y);
  }

  /**
   * Đứng hình (hit-stop): Phaser tự chạy animation lặp theo đồng hồ riêng, không biết hit-stop là gì
   * => cho tốc độ về 0. Gọi SAU cùng trong frame vì loop() đặt lại tốc độ.
   */
  freeze(frozen: boolean) {
    if (frozen) this.sprite.anims.timeScale = 0;
  }

  /** Viền 1 pixel ảnh quanh nhân vật (null = tắt). Gọi sau khi đã chọn khung, đặt vị trí, độ mờ cho frame này. */
  setOutline(color: number | null, alpha = 1) {
    if (color === null) {
      for (const copy of this.outline) copy.setVisible(false);
      return;
    }
    const s = this.sprite;
    if (this.outline.length === 0) {
      for (let i = 0; i < OUTLINE_OFFSETS.length; i++) this.outline.push(s.scene.add.image(0, 0, this.def.texture));
    }
    this.outline.forEach((copy, i) => {
      const [dx, dy] = OUTLINE_OFFSETS[i];
      copy
        .setVisible(true)
        .setTexture(s.texture.key, s.frame.name)
        .setOrigin(s.originX, s.originY)
        .setFlipX(s.flipX)
        .setScale(s.scaleX, s.scaleY)
        .setPosition(s.x + dx * this.def.scale, s.y + dy * this.def.scale)
        .setTintFill(color)
        .setAlpha(alpha * s.alpha)
        .setDepth(s.depth - 0.5);
    });
  }

  /** Bóng mờ: bản sao khung hình hiện tại tô một màu, đứng yên tại chỗ rồi mờ dần. */
  ghost(color: number, alpha: number, duration: number, depth: number) {
    const s = this.sprite;
    const copy = s.scene.add
      .image(s.x, s.y, s.texture.key, s.frame.name)
      .setOrigin(s.originX, s.originY)
      .setFlipX(s.flipX)
      .setScale(s.scaleX, s.scaleY)
      .setTintFill(color)
      .setAlpha(alpha)
      .setDepth(depth);
    s.scene.tweens.add({ targets: copy, alpha: 0, duration, onComplete: () => copy.destroy() });
  }

  destroy() {
    for (const copy of this.outline) copy.destroy();
    this.sprite.destroy();
  }
}
