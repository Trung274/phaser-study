import Phaser from 'phaser';

/**
 * Âm thanh tổng hợp bằng Web Audio, không cần file .mp3/.wav.
 * Mỗi hàm tự tạo oscillator/noise, phát một lần rồi tự huỷ.
 * Nếu trình duyệt không có Web Audio thì mọi hàm đều im lặng.
 * (Sau này có file âm thanh thật thì thay dần từng hàm bằng this.sound.play(...).)
 */
export class Sfx {
  private readonly ctx: AudioContext | null = null;
  private readonly out: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor(sound: Phaser.Sound.BaseSoundManager) {
    if (sound instanceof Phaser.Sound.WebAudioSoundManager) {
      this.ctx = sound.context;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.35; // âm lượng tổng
      this.out.connect(sound.destination); // đi qua mute/volume của Phaser
    }
  }

  /** "Vút": nhiễu lọc dải tần quét từ cao xuống thấp, như gió xé qua. */
  dash() {
    const p = this.randomPitch();
    this.noise(0.2, 0.35, 'bandpass', 2400 * p, 400 * p, 1.4);
    this.tone(320 * p, 'sine', 0.12, 0.08, 120 * p);
  }

  /** "Bịch" khi tiếp đất: đáp càng mạnh (impact 0..1) càng to và trầm lâu. */
  land(impact: number) {
    const p = this.randomPitch();
    this.tone(120 * p, 'sine', 0.1 + 0.1 * impact, 0.15 + 0.35 * impact, 50);
    this.noise(0.06 + 0.06 * impact, 0.08 + 0.2 * impact, 'lowpass', 1200, 200, 0.7);
  }

  /** "Xoẹt" khi vung kiếm: ngắn và cao hơn tiếng lướt; đòn nặng (power 0..1) thì dày tiếng hơn. */
  swing(power: number) {
    const p = this.randomPitch();
    this.noise(0.1 + 0.08 * power, 0.18 + 0.15 * power, 'bandpass', 3800 * p, 900 * p, 1.8);
  }

  /** Kẻ địch phát hiện người chơi: một tiếng "hửm" ngắn đi lên. */
  spot() {
    this.tone(520, 'triangle', 0.12, 0.1, 820);
  }

  /** Báo trước đòn đánh: tiếng "keng" cao và sắc, người chơi nghe là biết sắp bị đâm. */
  telegraph() {
    this.tone(1500, 'triangle', 0.2, 0.18);
    this.tone(2250, 'sine', 0.14, 0.08, undefined, 0.04);
  }

  /** Người chơi trúng đòn: tiếng đục và rè, khác hẳn tiếng mình chém trúng địch. */
  hurt() {
    this.tone(240, 'square', 0.25, 0.16, 90);
    this.noise(0.22, 0.35, 'lowpass', 2600, 250, 0.8);
  }

  /**
   * Đỡ hoàn hảo: "KENG" kim loại. Bí quyết là nhiều tần số KHÔNG chia hết cho nhau vang cùng lúc
   * (như chuông), cộng một tiếng "xẹt" rất cao ở đầu, rồi một tiếng "ting" nhỏ báo được thêm Qi.
   */
  parry() {
    const p = this.randomPitch();
    this.tone(1760 * p, 'triangle', 0.45, 0.25);
    this.tone(2637 * p, 'sine', 0.35, 0.12);
    this.tone(3951 * p, 'sine', 0.22, 0.06);
    this.noise(0.05, 0.3, 'highpass', 7000, 3000, 0.7);
    this.tone(1320, 'sine', 0.2, 0.08, undefined, 0.12);
    this.tone(1980, 'sine', 0.25, 0.06, undefined, 0.17);
  }

  /**
   * Báo trước ĐÒN ĐỎ: khác hẳn tiếng "keng" của đòn thường. Trầm, rè, đi lên như còi báo động,
   * để kể cả không nhìn màn hình cũng biết "cái này không đỡ được".
   */
  redWarning() {
    this.tone(180, 'sawtooth', 0.45, 0.16, 420);
    this.tone(90, 'square', 0.5, 0.1, 140);
    this.tone(360, 'sawtooth', 0.3, 0.08, 840, 0.18);
  }

  /** Phản đòn thành công: "xoẹt" sắc + tiếng nổ trầm rất to + dư âm kim loại. */
  counter() {
    this.noise(0.12, 0.45, 'highpass', 6000, 2500, 0.8);
    this.tone(70, 'sine', 0.7, 0.75, 28);
    this.tone(1180, 'triangle', 0.5, 0.18, 590, 0.05);
    this.noise(0.45, 0.35, 'lowpass', 3000, 100, 0.8);
  }

  /** Vỡ thế: tiếng "choang" như kính vỡ. */
  guardBreak() {
    this.noise(0.3, 0.5, 'highpass', 5000, 1500, 0.6);
    this.tone(300, 'square', 0.3, 0.2, 80);
  }

  /** Đỡ thường: "cộc" đục, không vang. Nghe là biết mình đỡ chưa chuẩn. */
  block() {
    const p = this.randomPitch();
    this.tone(380 * p, 'square', 0.09, 0.14, 180);
    this.noise(0.08, 0.25, 'lowpass', 1800, 400, 0.8);
  }

  /** Hết Qi mà vẫn bấm chiêu đặc biệt: tiếng "xì" nhỏ. */
  fizzle() {
    this.noise(0.12, 0.12, 'bandpass', 900, 300, 2);
  }

  /** Dán bùa: tiếng giấy "bộp". */
  talismanStick() {
    this.noise(0.06, 0.3, 'bandpass', 1600, 900, 1.2);
    this.tone(700, 'triangle', 0.08, 0.1, 500);
  }

  /** Bùa nổ: tiếng trầm rất lớn + tiếng vỡ kéo dài. */
  talismanBoom() {
    this.tone(95, 'sine', 0.6, 0.7, 30);
    this.noise(0.5, 0.5, 'lowpass', 4500, 90, 0.8);
    this.tone(320, 'sawtooth', 0.3, 0.12, 60);
  }

  /** Bắn cung: dây cung bật "tưng" (trầm, tụt nhanh) + tiếng mũi tên xé gió (nhiễu cao, ngắn). */
  bowShot() {
    const p = this.randomPitch();
    this.tone(190 * p, 'triangle', 0.14, 0.28, 95 * p);
    this.noise(0.16, 0.22, 'bandpass', 5200 * p, 1600 * p, 2.2);
  }

  /** Mũi tên cắm vào tường: tiếng "cộp" khô, ngắn. */
  arrowThunk() {
    const p = this.randomPitch();
    this.tone(440 * p, 'square', 0.05, 0.1, 210 * p);
    this.noise(0.05, 0.2, 'bandpass', 2400 * p, 900, 1.5);
  }

  /** Boss gầm: tiếng trầm rè kéo dài, quét xuống rồi lên. */
  bossRoar() {
    this.tone(140, 'sawtooth', 1.2, 0.35, 60);
    this.tone(70, 'square', 1.1, 0.2, 45);
    this.noise(1.0, 0.35, 'lowpass', 1800, 200, 1.5);
  }

  /** Boss đáp đất sau cú nhảy bổ: chấn động rất trầm. */
  bossSlam() {
    this.tone(60, 'sine', 0.7, 0.8, 25);
    this.noise(0.4, 0.5, 'lowpass', 2500, 80, 0.8);
  }

  /** Boss kiệt sức: tiếng "đoong" đi xuống, như chiếc chuông bị đánh vỡ. */
  bossStunned() {
    this.tone(880, 'triangle', 0.9, 0.25, 220);
    this.tone(1320, 'sine', 0.7, 0.1, 330, 0.05);
    this.noise(0.25, 0.3, 'highpass', 4000, 1200, 0.6);
  }

  /** Chiến thắng: hợp âm rải đi lên. */
  victory() {
    [523, 659, 784, 1047].forEach((freq, i) => this.tone(freq, 'triangle', 0.6, 0.18, undefined, i * 0.12));
    this.tone(1568, 'sine', 1.2, 0.1, undefined, 0.5);
  }

  /** Tiếng đánh trúng, power 0..1. */
  impact(power: number) {
    const p = this.randomPitch();
    // "thump": sóng sine tụt cao độ rất nhanh => cảm giác va chạm nặng
    this.tone(170 * p, 'sine', 0.2 + 0.25 * power, 0.55 + 0.35 * power, 40);
    // "crack": tiếng nhiễu ngắn => cảm giác vỡ, sắc
    this.noise(0.08 + 0.15 * power, 0.3 + 0.3 * power, 'lowpass', 5000 * p, 300, 0.7);
    if (power > 0.7) this.tone(90 * p, 'square', 0.25, 0.08, 30);
  }

  /** Tiếng hạ gục kẻ địch. */
  kill() {
    this.tone(140, 'sawtooth', 0.9, 0.3, 25);
    this.noise(0.7, 0.4, 'lowpass', 2500, 80, 0.8);
    this.tone(660, 'sine', 0.6, 0.12, 330, 0.12);
  }

  /** Lệch cao độ ngẫu nhiên ±8% để lặp lại nhiều lần không bị nhàm. */
  private randomPitch() {
    return Phaser.Math.FloatBetween(0.92, 1.08);
  }

  private tone(freq: number, type: OscillatorType, duration: number, volume: number, freqEnd?: number, delay = 0) {
    const { ctx, out } = this;
    if (!ctx || !out) return;

    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);

    const gain = this.envelope(t0, duration, volume);
    osc.connect(gain).connect(out);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  private noise(duration: number, volume: number, filterType: BiquadFilterType, freqStart: number, freqEnd: number, q: number) {
    const { ctx, out } = this;
    if (!ctx || !out) return;

    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freqStart, t0);
    filter.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);

    const gain = this.envelope(t0, duration, volume);
    src.connect(filter).connect(gain).connect(out);
    src.start(t0);
    src.stop(t0 + duration + 0.05);
  }

  /** Lên nhanh (5ms) rồi tắt dần theo hàm mũ: dáng âm của hầu hết tiếng "đập". */
  private envelope(t0: number, duration: number, volume: number) {
    const gain = this.ctx!.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    return gain;
  }

  private getNoiseBuffer(ctx: AudioContext) {
    if (!this.noiseBuffer) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1 giây nhiễu trắng
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer;
  }
}
