import Phaser from 'phaser';
import { ATLAS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PLAYER_MAX_HP, PLAYER_MAX_QI } from '../player/Player';
import { BOSS_MAX_HP, BOSS_MAX_POISE, BOSS_NAME } from '../entities/Boss';
import { HEAVY_FONT, VI_TEXT } from '../ui/textStyle';
import type { GameScene } from './GameScene';

const BOSS_BAR_W = 1000;
const BOSS_BAR_Y = GAME_HEIGHT - 72;

const HEART_SCALE = 0.75;
const HEART_Y = 60;
const INK = '#2b2b2b';
const QI_GOLD = 0xf2c94c;
const INTERNAL_RED = 0xff7b7b;

/** Bảng điều khiển: [phím, tác dụng]. Thêm phím mới thì thêm một dòng ở đây. */
const CONTROLS: [string, string][] = [
  ['← / →', 'chạy'],
  ['Space', 'nhảy (giữ lâu nhảy cao)'],
  ['Shift / L', 'lướt (né được đòn)'],
  ['J / X', 'chém (bấm liên tục: combo)'],
  ['K / C', 'đỡ đòn (đúng lúc: kiếm loé vàng)'],
  ['U / Z', 'phản đòn ĐỎ (không đỡ được đòn đỏ!)'],
  ['I / V', 'dán bùa (tốn 1 Qi)'],
  ['↓ + Space', 'xuống khỏi cầu'],
  ['H', 'hiện khung va chạm'],
  ['R', 'chơi lại'],
  ['F', 'toàn màn hình'],
];

type HeartState = 'full' | 'internal' | 'empty';

/**
 * Lớp giao diện (HUD) vẽ đè lên GameScene, có camera riêng.
 * Camera game rung, zoom, loé đỏ thì trái tim, ô Qi, chữ ở đây vẫn đứng yên.
 */
export class UIScene extends Phaser.Scene {
  private debugText!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private heartStates: HeartState[] = [];
  private qiOrbs: Phaser.GameObjects.Arc[] = [];
  private qiBaseX: number[] = []; // vị trí gốc của từng ô Qi: rung xong luôn trả về đây, không trôi dần
  private shownQi = -1;
  private shownQiDenied = 0;

  // Thanh máu boss
  private bossBar!: Phaser.GameObjects.Container;
  private bossFill!: Phaser.GameObjects.Rectangle;
  private bossGhost!: Phaser.GameObjects.Rectangle;
  private bossPoise!: Phaser.GameObjects.Rectangle;
  private bossPhaseText!: Phaser.GameObjects.Text;
  private shownBossHp = BOSS_MAX_HP;
  private victoryText!: Phaser.GameObjects.Text;
  private victorySub!: Phaser.GameObjects.Text;

  constructor() {
    super('UIScene');
  }

  create() {
    this.hearts = [];
    this.heartStates = [];
    for (let i = 0; i < PLAYER_MAX_HP; i++) {
      this.hearts.push(this.add.image(60 + i * 70, HEART_Y, ATLAS, 'tile_heart').setScale(HEART_SCALE));
      this.heartStates.push('full');
    }

    // Ô Qi: hình tròn viền mực, có Qi thì tô vàng
    this.qiOrbs = [];
    this.qiBaseX = [];
    const qiStartX = 60 + PLAYER_MAX_HP * 70 + 20;
    for (let i = 0; i < PLAYER_MAX_QI; i++) {
      const x = qiStartX + i * 46;
      this.qiBaseX.push(x);
      this.qiOrbs.push(this.add.circle(x, HEART_Y, 16, 0xffffff, 0.35).setStrokeStyle(3, 0x2b2b2b));
    }

    this.debugText = this.add
      .text(GAME_WIDTH - 24, 20, '', { ...VI_TEXT, fontFamily: 'monospace', fontSize: '22px', color: '#3d3d3d', align: 'right' })
      .setOrigin(1, 0);
    this.createControlsBox(24, 112); // ngay dưới hàng trái tim
    this.createBossBar();
  }

  /**
   * Thanh máu boss ở giữa đáy màn hình: tên + máu (đỏ, có "bóng" trắng tụt chậm) + vạch 50% (mốc chuyển pha)
   * + thanh choáng vàng ngay bên dưới. Mặc định ẩn, hiện dần khi trận boss bắt đầu.
   */
  private createBossBar() {
    const left = -BOSS_BAR_W / 2;
    // Tấm nền giấy viền mực: HUD đặt thẳng lên màn chơi sẽ lẫn vào nền rối
    // (dấu của "HẮC TƯỚNG" từng nằm đè đúng lên viền đen của ô gạch nên biến mất)
    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.85).fillRoundedRect(left - 24, -70, BOSS_BAR_W + 48, 120, 14);
    panel.lineStyle(3, 0x2b2b2b, 1).strokeRoundedRect(left - 24, -70, BOSS_BAR_W + 48, 120, 14);
    const name = this.add.text(left, -30, BOSS_NAME, { ...VI_TEXT, fontFamily: HEAVY_FONT, fontSize: '26px', color: INK }).setOrigin(0, 1);
    this.bossPhaseText = this.add.text(-left, -30, '', { ...VI_TEXT, fontSize: '22px', color: INK, fontStyle: 'bold' }).setOrigin(1, 1);
    const frame = this.add.rectangle(0, 0, BOSS_BAR_W + 8, 30, 0x000000, 0.6).setStrokeStyle(3, 0x2b2b2b);
    this.bossGhost = this.add.rectangle(left, 0, BOSS_BAR_W, 22, 0xffffff).setOrigin(0, 0.5);
    this.bossFill = this.add.rectangle(left, 0, BOSS_BAR_W, 22, 0xf2545b).setOrigin(0, 0.5);
    const halfMark = this.add.rectangle(0, 0, 4, 30, 0x2b2b2b); // mốc 50%: tới đây boss chuyển pha
    const poiseFrame = this.add.rectangle(0, 28, BOSS_BAR_W + 8, 14, 0x000000, 0.45);
    this.bossPoise = this.add.rectangle(left, 28, BOSS_BAR_W, 8, QI_GOLD).setOrigin(0, 0.5).setScale(0, 1);
    this.bossBar = this.add
      .container(GAME_WIDTH / 2, BOSS_BAR_Y, [panel, name, this.bossPhaseText, frame, this.bossGhost, this.bossFill, halfMark, poiseFrame, this.bossPoise])
      .setAlpha(0);

    this.victoryText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, 'CHIẾN THẮNG', {
        ...VI_TEXT,
        fontFamily: HEAVY_FONT,
        fontSize: '110px',
        color: '#c99a06',
        stroke: '#2b2b2b',
        strokeThickness: 14,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.victorySub = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'Bấm R để chơi lại từ đầu', { ...VI_TEXT, fontSize: '32px', color: INK, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
  }

  private updateBossBar(game: GameScene) {
    const boss = game.boss;
    const fighting = !!boss && game.bossStarted && !boss.gone;
    // Hiện/ẩn mượt
    const targetAlpha = fighting ? 1 : 0;
    this.bossBar.alpha += (targetAlpha - this.bossBar.alpha) * 0.08;

    const victory = !!boss && boss.gone;
    if (victory && !this.victoryText.visible) {
      this.victoryText.setVisible(true).setScale(2).setAlpha(0);
      this.tweens.add({ targets: this.victoryText, scale: 1, alpha: 1, duration: 600, ease: 'Back.Out' });
      this.victorySub.setVisible(true);
    } else if (!victory && this.victoryText.visible) {
      this.victoryText.setVisible(false);
      this.victorySub.setVisible(false);
    }

    if (!boss) return;
    // Máu: đỏ tụt ngay, "bóng" trắng chờ một nhịp rồi tụt theo (như thanh máu hình nộm)
    if (boss.hp !== this.shownBossHp) {
      const ratio = boss.hp / BOSS_MAX_HP;
      this.bossFill.setScale(ratio, 1);
      this.tweens.killTweensOf(this.bossGhost);
      if (boss.hp > this.shownBossHp) this.bossGhost.setScale(ratio, 1); // máu tăng (chơi lại): đặt thẳng
      else this.tweens.add({ targets: this.bossGhost, scaleX: ratio, delay: 400, duration: 450, ease: 'Cubic.In' });
      this.shownBossHp = boss.hp;
    }
    // Thanh choáng: kiệt sức thì nhấp nháy trắng/vàng
    this.bossPoise.setScale(boss.isStunned ? 1 : boss.poise / BOSS_MAX_POISE, 1);
    this.bossPoise.setFillStyle(boss.isStunned && Math.floor(this.time.now / 120) % 2 === 0 ? 0xffffff : QI_GOLD);
    this.bossPhaseText.setText(boss.isStunned ? 'KIỆT SỨC' : boss.phase === 2 ? 'PHA 2' : '');
  }

  update() {
    const game = this.scene.get('GameScene') as GameScene;
    if (!game.sys.isActive() || !game.player) return;

    const p = game.player;
    this.updateHearts(p.hp, p.internalDamage);
    this.updateQi(p.qi, p.qiDeniedCount);
    this.updateBossBar(game);

    const b = p.body;
    this.debugText.setText(
      `FPS: ${this.game.loop.actualFps.toFixed(0)}\n` +
        `state: ${p.state}\n` +
        `vx: ${b.velocity.x.toFixed(0).padStart(5)}  vy: ${b.velocity.y.toFixed(0).padStart(5)}\n` +
        `chạm đất: ${b.blocked.down ? 'có' : 'không'}\n` +
        `lướt: ${p.dashReady ? 'sẵn sàng' : 'chưa'}  miễn nhiễm: ${p.invulnerable ? 'CÓ' : 'không'}\n` +
        `đòn: ${p.attackInfo}\n` +
        `Qi: ${p.qi}/${PLAYER_MAX_QI}  nội thương: ${p.internalDamage}`,
    );
  }

  /**
   * Mỗi trái tim ở một trong 3 trạng thái: đầy / nội thương (đỏ nhạt, run run) / mất (xám).
   * Chỉ chạy hiệu ứng ở trái tim vừa ĐỔI trạng thái, để mắt người chơi bị kéo đúng vào chỗ thay đổi.
   */
  private updateHearts(hp: number, internal: number) {
    this.hearts.forEach((heart, i) => {
      const next: HeartState = i < hp - internal ? 'full' : i < hp ? 'internal' : 'empty';
      const prev = this.heartStates[i];

      if (next === 'internal') heart.x = 60 + i * 70 + Phaser.Math.FloatBetween(-1.5, 1.5); // run run: "đang đau"
      if (next === prev) return;
      this.heartStates[i] = next;
      heart.x = 60 + i * 70;
      this.tweens.killTweensOf(heart);

      if (next === 'full') {
        heart.clearTint().setAlpha(1);
        // Vừa lành nội thương: nảy nhẹ (lúc mới tạo scene thì prev cũng là 'full' nên không chạy vào đây)
        heart.setScale(HEART_SCALE * 1.3);
        this.tweens.add({ targets: heart, scale: HEART_SCALE, duration: 250, ease: 'Back.Out' });
      } else if (next === 'internal') {
        heart.setTint(INTERNAL_RED).setAlpha(0.85).setScale(HEART_SCALE * 1.25);
        this.tweens.add({ targets: heart, scale: HEART_SCALE, duration: 250, ease: 'Back.Out' });
      } else {
        // Vừa mất hẳn: nảy to rồi xám đi
        heart.setTint(0x8a8a8a).setScale(HEART_SCALE * 1.7).setAlpha(1);
        this.tweens.add({ targets: heart, scale: HEART_SCALE, alpha: 0.35, duration: 450, ease: 'Back.Out' });
      }
    });
  }

  private updateQi(qi: number, deniedCount: number) {
    if (qi !== this.shownQi) {
      this.qiOrbs.forEach((orb, i) => {
        const filled = i < qi;
        orb.setFillStyle(filled ? QI_GOLD : 0xffffff, filled ? 1 : 0.35);
        const justGained = this.shownQi >= 0 && i >= this.shownQi && i < qi;
        if (justGained) {
          this.tweens.killTweensOf(orb);
          orb.setScale(1.8);
          this.tweens.add({ targets: orb, scale: 1, duration: 300, ease: 'Back.Out' });
        }
      });
      this.shownQi = qi;
    }

    // Bấm dùng bùa khi thiếu Qi: cả hàng ô Qi lắc qua lắc lại ("không đủ!")
    if (deniedCount !== this.shownQiDenied) {
      this.shownQiDenied = deniedCount;
      this.qiOrbs.forEach((orb, i) => {
        this.tweens.killTweensOf(orb);
        const baseX = this.qiBaseX[i];
        orb.setPosition(baseX, HEART_Y).setScale(1);
        this.tweens.add({ targets: orb, x: baseX + 8, duration: 40, yoyo: true, repeat: 3, onComplete: () => orb.setX(baseX) });
      });
    }
  }

  /**
   * Box hướng dẫn: hai cột chữ (phím | tác dụng) đặt trên nền giấy viền mực.
   * Kích thước box tính từ kích thước chữ sau khi vẽ => sửa nội dung không phải căn lại bằng tay.
   */
  private createControlsBox(x: number, y: number) {
    const padding = 18;
    const columnGap = 24;
    const style = { ...VI_TEXT, fontSize: '20px', color: INK, lineSpacing: 8 };

    const title = this.add.text(x + padding, y + padding, 'ĐIỀU KHIỂN', { ...style, fontStyle: 'bold' });
    const top = title.y + title.height + 10;
    const keys = this.add.text(x + padding, top, CONTROLS.map(([key]) => key).join('\n'), { ...style, fontStyle: 'bold' });
    const actions = this.add.text(keys.x + keys.width + columnGap, top, CONTROLS.map(([, action]) => action).join('\n'), style);

    const width = actions.x + actions.width + padding - x;
    const height = keys.y + keys.height + padding - y;
    const box = this.add.graphics();
    box.fillStyle(0xffffff, 0.8);
    box.fillRoundedRect(x, y, width, height, 14);
    box.lineStyle(3, 0x2b2b2b, 1);
    box.strokeRoundedRect(x, y, width, height, 14);
    // Graphics tạo sau nên mặc định vẽ đè lên chữ: đẩy nó xuống dưới cùng
    this.children.sendToBack(box);
  }
}
