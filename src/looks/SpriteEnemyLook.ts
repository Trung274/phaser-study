import Phaser from 'phaser';
import { lerpColor } from '../core/color';
import { DANGER_RED, ENEMY_DEPTH, type EnemyLook, type EnemyView } from './EnemyLook';
import { SpriteRig, type FrameRef, type PhasedAnim, type SpriteSheetDef } from './SpriteRig';

/** Bảng "trạng thái kẻ địch → khung hình" của một nhân vật sprite sheet (xem SpritePlayerDef). */
export interface SpriteEnemyDef extends SpriteSheetDef {
  idle: string;
  walk: string;
  hurt: string;
  death: string;
  /** Đòn thường / đòn đỏ: startup = lấy đà (windup), active = cú đánh (thrust), recovery = đứng hớ (recover). */
  normal: PhasedAnim;
  red: PhasedAnim;
  /** Bị đỡ hoàn hảo: khựng lại. Bị phản đòn: ngã quỵ. */
  staggered: FrameRef;
  broken: FrameRef;
  /** Chỗ vũ khí ở khung cuối của pha lấy đà, tính từ chân khi quay phải: chỗ loé sáng báo trước. */
  weaponTip: { x: number; y: number };
}

const DEATH_LINGER = 300; // ms nằm lại sau khi hết animation chết, rồi mới mờ đi
const DEATH_FADE = 400;

/** Bộ da sprite sheet của kẻ địch (Tiny RPG Orc...). */
export class SpriteEnemyLook implements EnemyLook {
  readonly weaponTip: { x: number; y: number };

  private readonly scene: Phaser.Scene;
  private readonly def: SpriteEnemyDef;
  private readonly rig: SpriteRig;
  private flashTimer = 0;
  private flashFresh = false;
  private flashColor = 0xffffff;
  private shakeX = 0;
  private onDead: (() => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, feetY: number, def: SpriteEnemyDef) {
    this.scene = scene;
    this.def = def;
    this.weaponTip = def.weaponTip;
    this.rig = new SpriteRig(scene, x, feetY, def, ENEMY_DEPTH);
    this.rig.loop(def.idle);
  }

  flash(color: number, ms: number) {
    this.flashTimer = ms;
    this.flashFresh = true;
    this.flashColor = color;
    this.rig.sprite.setTintFill(color);
  }

  afterimage(color: number) {
    this.rig.ghost(color, 0.45, 240, ENEMY_DEPTH - 1);
  }

  /** Animation 'death' chạy theo thời gian trong trạng thái dead (xem update), rồi mờ dần. */
  die(_facing: 1 | -1, onDone: () => void) {
    this.onDead = onDone;
    this.flash(0xffffff, 100);
  }

  destroy() {
    this.rig.destroy();
  }

  update(view: EnemyView, frozen: boolean) {
    const { rig, def } = this;
    const sprite = rig.sprite;
    const t = view.timeInState;
    const now = this.scene.time.now / 1000;
    if (frozen) this.flashFresh = false;
    else this.tickFlash(this.scene.game.loop.delta);

    const anim = view.move.unblockable ? def.red : def.normal;
    const windupT = view.state === 'windup' ? Phaser.Math.Clamp(t / view.move.windup, 0, 1) : 1;
    switch (view.state) {
      case 'patrol':
      case 'chase':
        if (Math.abs(view.vx) > 20 && view.onGround) rig.loop(def.walk, Phaser.Math.Linear(0.7, 1.4, Math.min(1, Math.abs(view.runRatio))));
        else rig.loop(def.idle);
        break;
      case 'windup':
        rig.phase(anim, 'startup', windupT);
        break;
      case 'attack':
        rig.phase(anim, 'active', t / view.move.thrust);
        break;
      case 'recover':
        rig.phase(anim, 'recovery', t / view.move.recover);
        break;
      case 'hurt':
        rig.atTime(def.hurt, t);
        break;
      case 'staggered':
        rig.hold(def.staggered);
        break;
      case 'broken':
        rig.hold(def.broken);
        break;
      case 'dead':
        rig.atTime(def.death, t);
        break;
    }

    // Run run khi sắp ra đòn, lảo đảo khi bị đỡ hoàn hảo. Pixel art không xoay được nên lắc ngang thay cho nghiêng người
    if (!frozen) {
      if (view.state === 'windup' && windupT > 0.6) this.shakeX = Phaser.Math.FloatBetween(-3, 3);
      else if (view.state === 'staggered') this.shakeX = Math.sin(now * 18) * 5;
      else this.shakeX = 0;
    }
    sprite.setPosition(view.x + this.shakeX, view.feetY);
    rig.face(view.facing);

    // Đòn đỏ: viền đỏ quanh người + thân ửng đỏ theo nhịp, nhịp nhanh dần khi sắp đánh (thay cho hào quang của bộ Scribble)
    const red = view.move.unblockable && (view.state === 'windup' || view.state === 'attack');
    const pulse = Math.abs(Math.sin(now * Phaser.Math.Linear(6, 18, windupT)));
    if (this.flashTimer > 0) sprite.setTintFill(this.flashColor);
    else if (red && view.state === 'windup') sprite.setTint(lerpColor(0xffffff, 0xff7070, pulse));
    else sprite.clearTint();

    if (view.state === 'dead') {
      const fadeStart = rig.duration(def.death) + DEATH_LINGER;
      sprite.setAlpha(1 - Phaser.Math.Clamp((t - fadeStart) / DEATH_FADE, 0, 1));
      if (t >= fadeStart + DEATH_FADE && this.onDead) {
        const done = this.onDead;
        this.onDead = null;
        done();
      }
    }
    rig.setOutline(red ? DANGER_RED : null, 0.55 + 0.45 * pulse);
    rig.freeze(frozen);
  }

  private tickFlash(delta: number) {
    if (this.flashFresh) {
      this.flashFresh = false;
      return;
    }
    if (this.flashTimer > 0) this.flashTimer -= delta;
  }
}
