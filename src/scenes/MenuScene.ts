import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TILE } from '../config';
import { Sfx } from '../audio/Sfx';
import { COMBO } from '../combat/attacks';
import type { PlayerLook, PlayerView } from '../looks/PlayerLook';
import type { EnemyLook, EnemyView } from '../looks/EnemyLook';
import { HEAVY_FONT, VI_TEXT } from '../ui/textStyle';
import { THEME_LIST, type Theme } from '../themes';
import type { GameSceneData } from './GameScene';

const CARD_W = 560;
const CARD_H = 660;
const CARD_GAP = 50;
const CARD_Y = 575;           // tâm thẻ
const FLOOR_OFFSET = 290;     // mặt sàn trong thẻ, tính từ mép trên thẻ
const BODY_FONT = '"Segoe UI", Arial, sans-serif';
const DEMO_IDLE = 1400;       // ms đứng yên giữa hai nhát chém mẫu
const ENEMY_MOVE = { windup: 520, flashBefore: 130, thrust: 140, recover: 520, unblockable: false };

interface Card {
  theme: Theme;
  highlight: Phaser.GameObjects.Graphics; // viền vàng khi được chọn
  shade: Phaser.GameObjects.Rectangle;     // phủ tối khi KHÔNG được chọn
  player: PlayerLook;
  enemy: EnemyLook;
  playerView: PlayerView;
  enemyView: EnemyView;
}

/**
 * Màn hình chọn chế độ chơi. Mỗi thẻ dựng thẳng BỘ DA của theme đó (đúng class dùng trong game)
 * rồi cho diễn cùng một nhịp đòn (cùng frame data): thấy ngay "cùng luật chơi, khác phần nhìn".
 */
export class MenuScene extends Phaser.Scene {
  private cards: Card[] = [];
  private selected = 0;
  private starting = false;
  private sfx?: Sfx;
  /** Nhịp diễn mẫu dùng chung cho mọi thẻ: người chơi đứng một lúc rồi chém nhát tiếp theo của combo. */
  private demo = { attacking: false, time: 0, combo: -1, swingId: 0, swung: false, enemyTime: 0 };

  constructor() {
    super('MenuScene');
  }

  create() {
    this.cards = [];
    this.starting = false;
    this.demo = { attacking: false, time: 0, combo: -1, swingId: 0, swung: false, enemyTime: 0 };
    this.sfx ??= new Sfx(this.sound);
    this.cameras.main.setBackgroundColor('#1b1a22');
    this.cameras.main.fadeIn(250);

    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 105, 'CHỌN CHẾ ĐỘ CHƠI', { ...VI_TEXT, fontFamily: HEAVY_FONT, fontSize: '72px', color: '#f4ecd8' }).setOrigin(0.5);
    this.add.text(cx, 180, 'Cùng một luật chơi, khác "bộ da"', { ...VI_TEXT, fontFamily: BODY_FONT, fontSize: '30px', color: '#a9a3b8' }).setOrigin(0.5);

    THEME_LIST.forEach((theme, i) => {
      const x = cx + (i - (THEME_LIST.length - 1) / 2) * (CARD_W + CARD_GAP);
      this.cards.push(this.createCard(theme, x, i));
    });

    this.add
      .text(cx, GAME_HEIGHT - 70, '← →  chọn      Enter / Space  vào chơi      (đang chơi bấm Esc để quay lại đây)', {
        ...VI_TEXT,
        fontFamily: BODY_FONT,
        fontSize: '26px',
        color: '#a9a3b8',
      })
      .setOrigin(0.5);

    // Quay lại từ game thì chọn sẵn chế độ vừa chơi
    const last = this.registry.get('lastTheme');
    this.select(Math.max(0, THEME_LIST.findIndex((theme) => theme.id === last)), false);

    const keyboard = this.input.keyboard!;
    for (const key of ['LEFT', 'A']) keyboard.on(`keydown-${key}`, () => this.select(this.selected - 1));
    for (const key of ['RIGHT', 'D']) keyboard.on(`keydown-${key}`, () => this.select(this.selected + 1));
    for (const key of ['ENTER', 'SPACE']) keyboard.on(`keydown-${key}`, () => this.start());
    keyboard.on('keydown-F', () => this.scale.toggleFullscreen());
  }

  update(_time: number, delta: number) {
    this.updateDemo(delta);
    for (const card of this.cards) {
      card.player.update(card.playerView, false);
      card.enemy.update(card.enemyView, false);
    }
  }

  private createCard(theme: Theme, x: number, index: number): Card {
    const left = x - CARD_W / 2;
    const top = CARD_Y - CARD_H / 2;
    const hud = theme.hud;

    // Nền thẻ = màu nền của chính chế độ đó (giấy / trời đêm), viền và bo góc theo HUD của nó
    const bg = this.add.graphics();
    bg.fillStyle(Phaser.Display.Color.HexStringToColor(theme.backgroundColor).color, 1);
    bg.lineStyle(4, hud.ink, 1);
    if (hud.corner > 0) {
      bg.fillRoundedRect(left, top, CARD_W, CARD_H, hud.corner).strokeRoundedRect(left, top, CARD_W, CARD_H, hud.corner);
    } else {
      bg.fillRect(left, top, CARD_W, CARD_H).strokeRect(left, top, CARD_W, CARD_H);
    }

    // Sàn: một hàng ô mặt đất lấy từ bộ gạch của chế độ đó
    const floorY = top + FLOOR_OFFSET;
    const ts = theme.tileset;
    const tiles = Math.floor((CARD_W - 40) / TILE);
    const floorLeft = x - (tiles * TILE) / 2;
    for (let i = 0; i < tiles; i++) {
      this.add.image(floorLeft + i * TILE + TILE / 2, floorY + TILE / 2, ts.texture, ts.groundTop).setScale(ts.scale).setDepth(1);
    }

    const textStyle = { ...VI_TEXT, color: hud.text };
    this.add.text(left + 30, floorY + TILE + 18, theme.name, { ...textStyle, fontFamily: HEAVY_FONT, fontSize: '38px' }).setDepth(2);
    this.add
      .text(left + 30, floorY + TILE + 78, theme.description, { ...textStyle, fontFamily: BODY_FONT, fontSize: '23px', lineSpacing: 3, wordWrap: { width: CARD_W - 60 } })
      .setDepth(2)
      .setAlpha(0.85);

    // Nhân vật xem trước: chính bộ da trong game, người chơi bên trái, loại kẻ địch đầu tiên bên phải quay mặt lại
    const px = x - 120;
    const ex = x + 130;
    const [firstEnemy] = Object.values(theme.enemies);
    const card: Card = {
      theme,
      player: theme.createPlayerLook(this, px, floorY),
      enemy: firstEnemy.createLook(this, ex, floorY),
      playerView: {
        x: px, feetY: floorY, state: 'idle', timeInState: 0, facing: 1, runRatio: 0, hitDirection: 1,
        blinking: false, deflected: false, perfectWindow: false, counterWindow: false,
        swingId: 0, comboIndex: 0, attack: COMBO[0], move: null,
      },
      enemyView: {
        x: ex, feetY: floorY, state: 'patrol', timeInState: 0, facing: -1, vx: 0, runRatio: 0, onGround: true,
        move: ENEMY_MOVE, flashedBeforeThrust: false,
      },
      shade: this.add.rectangle(x, CARD_Y, CARD_W + 8, CARD_H + 8, 0x000000, 0.55).setDepth(60),
      highlight: this.add.graphics().setDepth(61),
    };
    card.highlight.lineStyle(8, 0xf2c94c, 1).strokeRect(left - 10, top - 10, CARD_W + 20, CARD_H + 20);

    // Chuột: rê vào để chọn, bấm để chơi
    const zone = this.add.zone(x, CARD_Y, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => this.select(index));
    zone.on('pointerdown', () => {
      this.select(index, false);
      this.start();
    });
    return card;
  }

  /** Nhịp diễn mẫu: người chơi chém lần lượt từng nhát combo; kẻ địch lấy đà rồi đánh, lệch nhịp với người chơi. */
  private updateDemo(delta: number) {
    const d = this.demo;
    d.time += delta;
    if (!d.attacking && d.time >= DEMO_IDLE) {
      d.attacking = true;
      d.time = 0;
      d.combo = (d.combo + 1) % COMBO.length;
      d.swingId++;
      d.swung = false;
    }
    const attack = COMBO[Math.max(0, d.combo)];
    if (d.attacking && d.time >= attack.startup + attack.active + attack.recovery) {
      d.attacking = false;
      d.time = 0;
    }

    // Kẻ địch: đi tuần (đứng yên) 1.5 giây => lấy đà => đánh => đứng hớ => lặp lại
    d.enemyTime = (d.enemyTime + delta) % (1500 + ENEMY_MOVE.windup + ENEMY_MOVE.thrust + ENEMY_MOVE.recover);
    let enemyState: EnemyView['state'] = 'patrol';
    let enemyT = d.enemyTime;
    for (const [state, length] of [['patrol', 1500], ['windup', ENEMY_MOVE.windup], ['attack', ENEMY_MOVE.thrust], ['recover', ENEMY_MOVE.recover]] as const) {
      enemyState = state;
      if (enemyT < length) break;
      enemyT -= length;
    }

    for (const card of this.cards) {
      const v = card.playerView;
      v.state = d.attacking ? 'attack' : 'idle';
      v.timeInState = d.time;
      v.swingId = d.swingId;
      v.comboIndex = Math.max(0, d.combo);
      v.attack = attack;
      v.move = d.attacking ? attack : null;
      if (d.attacking && !d.swung && d.time >= attack.startup) card.player.swing(v);

      const e = card.enemyView;
      const flashAt = ENEMY_MOVE.windup - ENEMY_MOVE.flashBefore;
      if (enemyState === 'windup' && e.state === 'windup' && e.timeInState < flashAt && enemyT >= flashAt) {
        card.enemy.flash(0xffffff, ENEMY_MOVE.flashBefore); // chớp trắng "NGAY BÂY GIỜ" như trong game
      }
      e.flashedBeforeThrust = enemyState === 'windup' && enemyT >= flashAt;
      e.state = enemyState;
      e.timeInState = enemyT;
    }
    if (d.attacking && d.time >= attack.startup) d.swung = true;
  }

  private select(index: number, sound = true) {
    const count = this.cards.length;
    const next = ((index % count) + count) % count;
    if (sound && next !== this.selected) this.sfx?.spot();
    this.selected = next;
    this.cards.forEach((card, i) => {
      card.highlight.setVisible(i === next);
      card.shade.setVisible(i !== next);
    });
  }

  private start() {
    if (this.starting) return;
    this.starting = true;
    const theme = this.cards[this.selected].theme;
    this.registry.set('lastTheme', theme.id);
    this.sfx?.swing(0.6);
    const cam = this.cameras.main;
    cam.fadeOut(250, 0, 0, 0);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('GameScene', { theme: theme.id } satisfies GameSceneData));
  }
}
