import Phaser from 'phaser';

/** Pha màu: t = 0 => màu a, t = 1 => màu b, ở giữa là màu chuyển tiếp. */
export function lerpColor(a: number, b: number, t: number) {
  const { Color } = Phaser.Display;
  const c = Color.Interpolate.ColorWithColor(Color.ValueToColor(a), Color.ValueToColor(b), 100, Phaser.Math.Clamp(t, 0, 1) * 100);
  return Color.GetColor(c.r, c.g, c.b);
}
