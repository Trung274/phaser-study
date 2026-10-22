import Phaser from 'phaser';
import { TILE } from '../config';
import { Sfx } from '../audio/Sfx';
import { Player } from '../player/Player';
import { TrainingDummy } from '../entities/TrainingDummy';
import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { HitStop } from '../combat/HitStop';
import { setFxStyle } from '../combat/fxStyle';
import { spawnCallout, spawnCounterBurst, spawnDamageNumber, spawnHitSpark, spawnParrySpark } from '../combat/hitEffects';
import { createCharm, spawnTalismanBurst, TALISMAN_DAMAGE, TALISMAN_FUSE } from '../combat/talisman';
import {
  advanceArrow, ARROW_DAMAGE, ARROW_HIT_STOP, ARROW_POISE, ARROW_POWER,
  arrowSpent, arrowTipRect, arrowTipX, createArrow, stickArrow, type Arrow,
} from '../combat/arrows';
import type { Attacker, Hittable, Strike } from '../combat/types';
import { buildLevel, type BuiltLevel } from '../level/buildLevel';
import { getTheme, type Theme, type ThemeId } from '../themes';

const KILL_HIT_STOP = 150;   // ms đứng hình ở nhát kết liễu: lâu hơn nhát thường để "ăn mừng"
const PARRY_HIT_STOP = 130;  // đỡ hoàn hảo đứng hình lâu: khoảnh khắc "đã" nhất của cả hệ thống chiến đấu
const BLOCK_HIT_STOP = 60;
const TALISMAN_HIT_STOP = 140;
const COUNTER_HIT_STOP = 200;  // phản đòn đứng hình lâu nhất: phần thưởng lớn nhất
const COUNTER_DAMAGE = 25;
const TALISMAN_POISE = 20;     // bùa nổ cộng thanh choáng boss

/** Dữ liệu truyền qua scene.start / scene.restart. */
export interface GameSceneData {
  theme?: ThemeId;
  /** Chết trong trận boss => chơi lại ngay cửa đấu trường. */
  checkpoint?: boolean;
}

/** Một lá bùa đang dán trên mục tiêu, chờ nổ. */
interface StuckTalisman {
  target: Hittable;
  charm: Phaser.GameObjects.Container;
  /** Vị trí dán, tính từ tâm hurtbox của mục tiêu: bùa đi theo mục tiêu khi nó bị đẩy lùi. */
  offset: { x: number; y: number };
  lastPos: { x: number; y: number };
  timer: number;
  direction: 1 | -1;
}

export class GameScene extends Phaser.Scene {
  player!: Player; // public: UIScene đọc trạng thái để hiển thị
  boss: Boss | null = null; // public: UIScene vẽ thanh máu boss
  bossStarted = false;
  private theme!: Theme;
  private sfx?: Sfx;
  private level!: BuiltLevel;
  private hitStop!: HitStop;
  private dummies: TrainingDummy[] = [];
  private enemies: Enemy[] = [];
  private talismans: StuckTalisman[] = [];
  private arrows: Arrow[] = [];
  private lastArrowSwing = -1;   // mỗi lần ra chiêu chỉ bắn MỘT mũi tên, dù pha active kéo dài vài frame
  private hitThisSwing = new Set<Hittable>(); // mục tiêu đã trúng nhát chém hiện tại
  private lastSwingId = -1;
  private lastSafe = { x: 0, y: 0 }; // chỗ đứng an toàn gần nhất, để hồi sinh khi rơi xuống hố
  private restarting = false;
  private clearAnnounced = false;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private showHitboxes = false;
  private hitboxKey!: Phaser.Input.Keyboard.Key;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private fullscreenKey!: Phaser.Input.Keyboard.Key;
  private menuKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super('GameScene');
  }

  /**
   * `data` được truyền qua scene.start / scene.restart: chọn chế độ chơi (theme), và có hồi sinh ở checkpoint không.
   * Chết trong trận boss => restart({ checkpoint: true }) để xuất hiện ngay cửa đấu trường, không phải đi lại cả màn.
   */
  create(data: GameSceneData = {}) {
    // Restart chạy lại create() trên CÙNG object scene: field cũ vẫn còn => reset những gì cần
    this.dummies = [];
    this.enemies = [];
    this.talismans = [];
    this.arrows = [];
    this.lastArrowSwing = -1;
    this.hitThisSwing.clear();
    this.lastSwingId = -1;
    this.restarting = false;
    this.clearAnnounced = false;
    this.bossStarted = false;
    this.boss = null;
    // Bấm R đúng lúc đang đứng hình thì physics/tween có thể còn bị pause
    this.physics.world.resume();
    this.tweens.resumeAll();

    // Mọi thứ khác nhau giữa các chế độ chơi đều nằm trong theme: bản đồ, bộ gạch, nền, bộ da, hiệu ứng, chiêu đặc biệt
    const theme = getTheme(data.theme);
    this.theme = theme;
    setFxStyle(this, theme.fx);

    const level = buildLevel(this, theme.map, theme.tileset, Object.keys(theme.enemies));
    this.level = level;

    // Thế giới rộng hơn màn hình: physics và camera đều phải biết kích thước thật.
    // Tắt va chạm mép DƯỚI của thế giới: rơi xuống hố là rơi mất, không còn đứng dưới đáy hố.
    this.physics.world.setBounds(0, 0, level.width, level.height);
    this.physics.world.setBoundsCollision(true, true, true, false);
    theme.createBackground(this, level);

    this.sfx ??= new Sfx(this.sound); // field còn từ lần trước => chỉ tạo một lần
    this.hitStop = new HitStop(this);
    const arena = theme.arena;
    const spawn = data.checkpoint && arena ? { x: (arena.checkpointCol + 0.5) * TILE, y: level.height - 2 * TILE } : level.spawn;
    this.player = new Player(this, spawn.x, spawn.y, {
      sfx: this.sfx,
      hitStop: this.hitStop,
      look: theme.createPlayerLook(this, spawn.x, spawn.y),
      special: theme.special,
    });
    this.lastSafe = { ...spawn };
    this.physics.add.collider(this.player.hitbox, level.solids);
    this.physics.add.collider(
      this.player.hitbox,
      level.oneWays,
      // Gọi khi va chạm xảy ra (cầu chỉ chặn từ trên xuống => tức là đang đứng trên cầu)
      () => {
        this.player.standingOnOneWay = true;
      },
      // Gọi TRƯỚC khi xử lý va chạm: trả về false = bỏ qua, cho rơi xuyên qua cầu
      () => this.player.dropThroughTimer <= 0,
    );

    for (const spawn of level.dummySpawns) {
      const dummy = new TrainingDummy(this, spawn.x, spawn.y);
      this.physics.add.collider(this.player.hitbox, dummy.blocker);
      this.dummies.push(dummy);
    }

    for (const spawn of level.enemySpawns) {
      // Ký tự trên bản đồ quyết định loại kẻ địch: chỉ số (luật chơi) + bộ da (phần nhìn) đều lấy từ theme
      const kind = theme.enemies[spawn.char];
      const enemy = new Enemy(this, spawn.x, spawn.y, {
        sfx: this.sfx,
        hitStop: this.hitStop,
        isGroundAt: level.isGroundAt,
        stats: kind.stats,
        look: kind.createLook(this, spawn.x, spawn.y),
      });
      // Kẻ địch đứng được trên đất và cầu; không va chạm với người chơi (đi xuyên qua nhau được).
      // Giữ lại collider để xoá cùng kẻ địch khi nó chết.
      enemy.colliders.push(this.physics.add.collider(enemy.hitbox, level.solids), this.physics.add.collider(enemy.hitbox, level.oneWays));
      this.enemies.push(enemy);
    }

    if (level.bossSpawn) {
      this.boss = new Boss(this, level.bossSpawn.x, level.bossSpawn.y, { sfx: this.sfx, hitStop: this.hitStop });
      this.physics.add.collider(this.boss.hitbox, level.solids);
    }

    // Camera đi theo người chơi:
    // - lerp 0.1: mỗi frame chỉ đuổi 10% khoảng cách còn lại => trượt theo mềm, không giật
    // - deadzone: người chơi đi trong khung giữa này thì camera đứng yên
    // - roundPixels: làm tròn vị trí khi vẽ => ảnh 1:1 không bị nhoè vì lệch nửa pixel
    const cam = this.cameras.main;
    cam.setBackgroundColor(theme.backgroundColor);
    cam.setBounds(0, 0, level.width, level.height);
    cam.startFollow(this.player.hitbox, true, 0.1, 0.1);
    cam.setDeadzone(240, 160);
    cam.setRoundPixels(true);
    cam.fadeIn(400); // mở màn từ đen

    this.debugGraphics = this.add.graphics().setDepth(1000);

    // HUD nằm ở scene riêng chạy song song; restart GameScene thì UIScene vẫn giữ nguyên.
    // Về màn chọn chế độ thì UIScene bị dừng => lần sau mở lại với đúng theme mới.
    if (!this.scene.isActive('UIScene')) this.scene.launch('UIScene', { theme: theme.id });

    const keyboard = this.input.keyboard!;
    this.hitboxKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.restartKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.fullscreenKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.menuKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  /** Đã thắng màn chưa: màn có boss thì hạ boss, không có boss thì hạ hết kẻ địch. UIScene đọc để hiện chữ CHIẾN THẮNG. */
  get cleared() {
    if (this.boss) return this.boss.gone;
    return this.level.enemySpawns.length > 0 && this.enemies.length === 0;
  }

  update(_time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.menuKey)) {
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.scene.restart({ theme: this.theme.id, checkpoint: false } satisfies GameSceneData); // R = chơi lại TỪ ĐẦU màn
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.hitboxKey)) {
      this.toggleHitboxes();
    }
    if (Phaser.Input.Keyboard.JustDown(this.fullscreenKey)) {
      // Trình duyệt chỉ cho vào toàn màn hình khi người dùng vừa thao tác (bấm phím, click),
      // nên phải gọi ngay trong lúc xử lý phím, không tự bật lúc game vừa mở được
      this.scale.toggleFullscreen();
    }

    // Đang đứng hình thì không ai được cử động. Phím bấm lúc này vẫn được "giữ" (JustDown chưa bị đọc)
    // nên bấm chém trong lúc đứng hình vẫn nối combo ngay khi hết đứng hình.
    this.hitStop.update(delta);
    if (!this.hitStop.active) {
      this.player.update(delta);
      for (const enemy of this.enemies) enemy.update(delta, this.player);
      this.boss?.update(delta, this.player);
      for (const dummy of this.dummies) dummy.update(delta);
      this.checkBossTrigger();
      this.resolvePlayerAttack();
      this.resolveEnemyAttacks();
      this.updateTalismans(delta);
      this.updateArrows(delta);
      this.updateHazards();
      this.removeFinishedEnemies();
      this.checkCleared();
      this.checkPlayerDeath();
    }

    this.drawHitboxes();
  }

  // ===========================================================================
  // Hệ thống chiến đấu
  // ===========================================================================

  /**
   * Dò lưỡi kiếm (hitbox của đòn) với vùng bị đánh (hurtbox) của từng mục tiêu.
   * Player chỉ báo "kiếm đang ở đâu", mục tiêu chỉ báo "tôi ở đâu"; việc ai trúng ai nằm ở đây.
   * Hình nộm và kẻ địch đều là Hittable nên được xử lý chung một vòng lặp.
   */
  private resolvePlayerAttack() {
    const strike = this.player.activeStrike();
    if (!strike) return;

    if (strike.swingId !== this.lastSwingId) {
      this.lastSwingId = strike.swingId;
      this.hitThisSwing.clear();
    }

    if (strike.effect === 'arrow') {
      this.fireArrow(strike);
      return;
    }
    const targets = this.hittables();
    if (strike.effect === 'talisman') {
      this.tryStickTalisman(strike, targets);
      return;
    }

    let hitSomething = false;
    let killedSomething = false;
    for (const target of targets) {
      if (this.hitThisSwing.has(target)) continue; // một nhát chỉ trúng mỗi mục tiêu một lần
      const hurtbox = target.hurtbox;
      if (!Phaser.Geom.Rectangle.Overlaps(strike.rect, hurtbox)) continue;
      this.hitThisSwing.add(target);
      if (!target.takeHit(strike)) continue;
      hitSomething = true;
      if (target.isDead) killedSomething = true;

      // Điểm va chạm = tâm phần giao nhau giữa lưỡi kiếm và mục tiêu
      const contact = Phaser.Geom.Rectangle.Intersection(strike.rect, hurtbox);
      spawnHitSpark(this, contact.centerX, contact.centerY, strike.power, strike.direction);
      spawnDamageNumber(this, contact.centerX, hurtbox.top, target.lastDamageTaken ?? strike.damage, strike.power);
    }

    if (hitSomething) {
      // Trúng nhiều mục tiêu cùng lúc vẫn chỉ đứng hình, rung, kêu MỘT lần
      const power = killedSomething ? 1 : strike.power;
      this.player.onHitConfirmed();
      this.sfx?.impact(power);
      this.cameras.main.shake(Phaser.Math.Linear(70, 180, power), Phaser.Math.Linear(0.002, 0.007, power));
      this.hitStop.trigger(killedSomething ? Math.max(strike.hitStop, KILL_HIT_STOP) : strike.hitStop);
    }
  }

  /**
   * Vũ khí của kẻ địch vs thân người chơi. Player tự quyết định kết quả (đỡ hoàn hảo / đỡ thường / trúng / trượt),
   * GameScene chỉ lo phần "diễn": mỗi kết quả một bộ hiệu ứng khác hẳn nhau để người chơi phân biệt bằng mắt và tai.
   */
  private resolveEnemyAttacks() {
    // Lính và boss đều là Attacker: cùng một vòng lặp, cùng luật đỡ/phản đòn
    const attackers: Attacker[] = this.boss ? [...this.enemies, this.boss] : this.enemies;
    for (const enemy of attackers) {
      const strike = enemy.activeStrike();
      if (!strike) continue;
      const hurtbox = this.player.hurtbox;
      if (!Phaser.Geom.Rectangle.Overlaps(strike.rect, hurtbox)) continue;

      const result = this.player.receiveAttack(strike);
      if (result === 'miss') continue; // đang lướt / vừa bị đánh: vũ khí xuyên qua, vẫn còn hiệu lực
      enemy.onStrikeConnected();

      const contact = Phaser.Geom.Rectangle.Intersection(strike.rect, hurtbox);
      const cam = this.cameras.main;
      switch (result) {
        case 'perfect': // KENG! Toé lửa mọi hướng, camera giật vào, đứng hình lâu, kẻ địch bị hất khựng
          enemy.onParried(strike.direction > 0 ? -1 : 1); // bị hất NGƯỢC hướng nó vừa đánh tới
          spawnParrySpark(this, contact.centerX, contact.centerY);
          this.sfx?.parry();
          cam.shake(120, 0.004);
          this.zoomPunch(1.05);
          this.hitStop.trigger(PARRY_HIT_STOP);
          break;
        case 'block': // "cộc": chặn được nhưng nhỏ, đục, ngắn. Không có gì để ăn mừng
          spawnHitSpark(this, contact.centerX, contact.centerY, 0.3, strike.direction);
          this.sfx?.block();
          cam.shake(100, 0.003);
          this.hitStop.trigger(BLOCK_HIT_STOP);
          break;
        case 'counter': { // PHẢN ĐÒN: chữ X đỏ, camera giật mạnh, đứng hình lâu nhất, kẻ địch ngã quỵ
          const pushDir = strike.direction > 0 ? -1 : 1;
          const killed = enemy.onCountered(pushDir, COUNTER_DAMAGE);
          const enemyBox = enemy.hurtbox;
          spawnCounterBurst(this, contact.centerX, contact.centerY);
          spawnDamageNumber(this, enemyBox.centerX, enemyBox.top, COUNTER_DAMAGE, 1);
          spawnCallout(this, enemyBox.centerX, enemyBox.top - 90, 'PHẢN ĐÒN!', '#e03131');
          this.sfx?.counter();
          cam.shake(260, 0.012);
          this.zoomPunch(1.08);
          this.hitStop.trigger(killed ? Math.max(COUNTER_HIT_STOP, KILL_HIT_STOP) : COUNTER_HIT_STOP);
          break;
        }
        case 'guardBreak': // đỡ nhầm đòn đỏ: như trúng đòn, cộng tiếng vỡ + chữ để người chơi hiểu VÌ SAO
          spawnHitSpark(this, contact.centerX, contact.centerY, 1, strike.direction);
          spawnCallout(this, hurtbox.centerX, hurtbox.top - 60, 'PHÁ THẾ!');
          this.sfx?.guardBreak();
          this.sfx?.hurt();
          cam.shake(260, 0.012);
          cam.flash(200, 255, 60, 60);
          this.hitStop.trigger(strike.hitStop + 40);
          break;
        case 'hit': // bị đánh phải "đau" hơn đánh trúng địch: rung mạnh hơn, loé đỏ cả màn hình
          spawnHitSpark(this, contact.centerX, contact.centerY, strike.power, strike.direction);
          this.sfx?.hurt();
          cam.shake(220, 0.01);
          cam.flash(160, 255, 90, 90);
          this.hitStop.trigger(strike.hitStop);
          break;
        default: {
          // Kiểm tra lúc biên dịch: thêm loại kết quả mới mà quên xử lý ở trên thì dòng này báo lỗi đỏ
          const unhandled: never = result;
          throw new Error(`Chưa xử lý kết quả đỡ đòn: ${unhandled}`);
        }
      }
    }
  }

  /** Camera giật vào rồi nhả ra: chỉ ảnh hưởng camera game, HUD ở UIScene đứng yên. */
  private zoomPunch(amount: number) {
    const cam = this.cameras.main;
    cam.zoom = amount;
    // Hiệu ứng camera chỉ hiểu tên ease ĐẦY ĐỦ ('Quad.easeOut'), không hiểu tên tắt 'Quad.Out' như tween.
    // Tên sai => ease rỗng => game sập ở frame sau ("this.ease is not a function").
    cam.zoomTo(1, 260, 'Quad.easeOut', true);
  }

  // ===========================================================================
  // Bùa: dán lên mục tiêu, nhấp nháy nhanh dần, rồi nổ
  // ===========================================================================

  /** Bùa chỉ dán lên MỘT mục tiêu: mục tiêu đầu tiên tay chạm tới. */
  private tryStickTalisman(strike: Strike, targets: Hittable[]) {
    if (this.hitThisSwing.size > 0) return; // nhát này đã dán rồi
    for (const target of targets) {
      if (target.isDead) continue;
      const hurtbox = target.hurtbox;
      if (!Phaser.Geom.Rectangle.Overlaps(strike.rect, hurtbox)) continue;
      this.hitThisSwing.add(target);

      const contact = Phaser.Geom.Rectangle.Intersection(strike.rect, hurtbox);
      const charm = createCharm(this, contact.centerX, contact.centerY);
      this.talismans.push({
        target,
        charm,
        offset: { x: contact.centerX - hurtbox.centerX, y: contact.centerY - hurtbox.centerY },
        lastPos: { x: contact.centerX, y: contact.centerY },
        timer: TALISMAN_FUSE,
        direction: strike.direction,
      });
      this.sfx?.talismanStick();
      this.hitStop.trigger(strike.hitStop);
      return;
    }
  }

  private updateTalismans(delta: number) {
    for (const t of this.talismans) {
      t.timer -= delta;
      // Bám theo mục tiêu (mục tiêu đã bị dọn đi thì bùa ở lại chỗ cũ)
      const targetGone = t.target.gone === true;
      if (!targetGone) {
        const hb = t.target.hurtbox;
        t.lastPos = { x: hb.centerX + t.offset.x, y: hb.centerY + t.offset.y };
      }
      t.charm.setPosition(t.lastPos.x, t.lastPos.y);
      // Nhấp nháy nhanh dần khi sắp nổ: bùa tự "báo trước" thời điểm nổ
      const urgency = 1 - t.timer / TALISMAN_FUSE;
      t.charm.setScale(1 + 0.18 * Math.abs(Math.sin(this.time.now / Phaser.Math.Linear(110, 30, urgency))));
      if (t.timer <= 0) this.explodeTalisman(t, targetGone);
    }
    this.talismans = this.talismans.filter((t) => t.timer > 0);
  }

  private explodeTalisman(t: StuckTalisman, targetGone: boolean) {
    t.charm.destroy();
    const { x, y } = t.lastPos;
    spawnTalismanBurst(this, x, y);
    this.sfx?.talismanBoom();

    const hit = !targetGone && t.target.takeHit({ damage: TALISMAN_DAMAGE, power: 1, direction: t.direction, poiseDamage: TALISMAN_POISE });
    if (hit) spawnDamageNumber(this, x, y - 40, t.target.lastDamageTaken ?? TALISMAN_DAMAGE, 1);
    const killed = hit && t.target.isDead === true; // chính vụ nổ này kết liễu

    this.cameras.main.shake(280, 0.012);
    this.zoomPunch(1.04);
    this.hitStop.trigger(killed ? Math.max(TALISMAN_HIT_STOP, KILL_HIT_STOP) : TALISMAN_HIT_STOP);
  }

  // ===========================================================================
  // Mũi tên: vật thể bay (projectile). Tự di chuyển mỗi frame, tự dò va chạm, không cần thân vật lý
  // ===========================================================================

  private fireArrow(strike: Strike) {
    if (strike.swingId === this.lastArrowSwing) return;
    this.lastArrowSwing = strike.swingId;
    this.arrows.push(createArrow(this, strike.rect.centerX, strike.rect.centerY, strike.direction));
    this.sfx?.bowShot();
  }

  /** Chạy SAU khi kiểm tra đứng hình: đang hit-stop thì mũi tên cũng đứng yên giữa không trung. */
  private updateArrows(delta: number) {
    this.arrows = this.arrows.filter((arrow) => {
      const swept = advanceArrow(arrow, delta);
      if (this.arrowHitsTarget(arrow, swept)) return false;

      const tipX = arrowTipX(arrow);
      const y = arrow.sprite.y;
      if (this.level.isSolidAt(tipX, y)) {
        // Mặt tường = cạnh của ô mà mũi tên vừa chui vào
        const col = Math.floor(tipX / TILE);
        stickArrow(this, arrow, arrow.dir > 0 ? col * TILE : (col + 1) * TILE);
        spawnHitSpark(this, tipX, y, 0.15, arrow.dir > 0 ? -1 : 1);
        this.sfx?.arrowThunk();
        return false;
      }
      if (arrowSpent(arrow) || tipX < 0 || tipX > this.level.width) {
        arrow.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /** Mũi tên trúng mục tiêu đầu tiên trên đường bay: như một nhát chém nhẹ, rồi biến mất. */
  private arrowHitsTarget(arrow: Arrow, swept: Phaser.Geom.Rectangle) {
    for (const target of this.hittables()) {
      if (target.gone) continue;
      const hurtbox = target.hurtbox;
      if (!Phaser.Geom.Rectangle.Overlaps(swept, hurtbox)) continue;
      // Mục tiêu không nhận đòn (đã chết, đang nằm sàn...) => mũi tên bay xuyên qua, tìm mục tiêu sau
      if (!target.takeHit({ damage: ARROW_DAMAGE, power: ARROW_POWER, direction: arrow.dir, poiseDamage: ARROW_POISE })) continue;

      const contact = Phaser.Geom.Rectangle.Intersection(swept, hurtbox);
      const killed = target.isDead === true;
      spawnHitSpark(this, contact.centerX, contact.centerY, ARROW_POWER, arrow.dir);
      spawnDamageNumber(this, contact.centerX, hurtbox.top, target.lastDamageTaken ?? ARROW_DAMAGE, ARROW_POWER);
      this.sfx?.impact(killed ? 1 : ARROW_POWER);
      this.cameras.main.shake(killed ? 180 : 100, killed ? 0.007 : 0.004);
      this.hitStop.trigger(killed ? KILL_HIT_STOP : ARROW_HIT_STOP);
      arrow.sprite.destroy();
      return true;
    }
    return false;
  }

  // ===========================================================================
  // Hố, chết, dọn dẹp, thắng
  // ===========================================================================

  private updateHazards() {
    const b = this.player.body;
    // Ghi nhớ chỗ đứng an toàn: đang chạm đất và CẢ HAI mép chân đều trên ô đặc (không phải mép vực, không phải cầu)
    const feetY = b.bottom + 4;
    if (b.blocked.down && this.level.isSolidAt(b.left + 4, feetY) && this.level.isSolidAt(b.right - 4, feetY)) {
      this.lastSafe = { x: b.center.x, y: b.bottom };
    }

    if (this.player.alive && b.top > this.level.height) {
      this.player.fallIntoPit(this.lastSafe);
      if (this.player.alive) {
        this.sfx?.hurt();
        this.cameras.main.flash(200, 0, 0, 0);
      }
    }

    for (const enemy of this.enemies) {
      // Kẻ địch bị hất xuống hố: chết luôn, dọn ngay
      if (enemy.body.enable && enemy.body.top > this.level.height) enemy.gone = true;
    }
  }

  private removeFinishedEnemies() {
    this.enemies = this.enemies.filter((enemy) => {
      if (!enemy.gone) return true;
      enemy.destroy();
      return false;
    });
  }

  /** Màn không có boss: hạ xong kẻ địch cuối cùng thì kêu nhạc thắng (boss tự lo phần này khi bị hạ). */
  private checkCleared() {
    if (this.boss || this.clearAnnounced || !this.cleared) return;
    this.clearAnnounced = true;
    this.sfx?.victory();
  }

  /**
   * Chết: để người chơi thấy mình ngã một nhịp, rồi màn hình tối dần và chơi lại.
   * Đã vào trận boss => chơi lại ngay cửa đấu trường (checkpoint), không bắt đi lại cả màn.
   */
  private checkPlayerDeath() {
    if (this.player.alive || this.restarting) return;
    this.restarting = true;
    const data: GameSceneData = { theme: this.theme.id, checkpoint: this.bossStarted };
    this.time.delayedCall(900, () => {
      const cam = this.cameras.main;
      cam.fadeOut(500, 0, 0, 0);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(data));
    });
  }

  // ===========================================================================
  // Trận boss
  // ===========================================================================

  /** Mọi thứ chém được (hình nộm, lính, boss) trong một danh sách. */
  private hittables(): Hittable[] {
    return this.boss ? [...this.dummies, ...this.enemies, this.boss] : [...this.dummies, ...this.enemies];
  }

  private checkBossTrigger() {
    const arena = this.theme.arena;
    if (!this.boss || !arena || this.bossStarted) return;
    if (this.player.body.center.x < arena.triggerCol * TILE) return;
    this.bossStarted = true;

    // Khoá camera vào đấu trường. Không đổi giới hạn camera đột ngột (camera sẽ giật cục):
    // thôi bám theo người chơi, LIA camera tới đấu trường, xong mới khoá giới hạn rồi bám lại.
    const arenaX = arena.leftCol * TILE;
    const arenaW = (arena.rightCol - arena.leftCol) * TILE;
    const cam = this.cameras.main;
    cam.stopFollow();
    const panX = Phaser.Math.Clamp(this.player.body.center.x, arenaX + cam.width / 2, arenaX + arenaW - cam.width / 2);
    cam.pan(panX, cam.midPoint.y, 700, 'Sine.easeInOut', false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress < 1) return;
      cam.setBounds(arenaX, 0, arenaW, this.level.height);
      cam.startFollow(this.player.hitbox, true, 0.1, 0.1);
    });
    this.boss.wake();
  }

  // ===========================================================================
  // Hiển thị
  // ===========================================================================

  /** Bấm H: ngoài khung vật lý của Arcade, vẽ thêm vùng chiến đấu (không phải vật lý nên Arcade không vẽ). */
  private drawHitboxes() {
    const g = this.debugGraphics;
    g.clear();
    if (!this.showHitboxes) return;

    g.lineStyle(3, 0xf2c94c, 1); // vàng: hurtbox (vùng bị đánh)
    for (const target of this.hittables()) {
      if (!target.gone) g.strokeRectShape(target.hurtbox);
    }
    g.strokeRectShape(this.player.hurtbox);

    g.lineStyle(3, 0xeb5757, 1); // đỏ: hitbox của đòn đang có hiệu lực (kể cả mũi tên đang bay)
    g.fillStyle(0xeb5757, 0.35);
    const strikes = [this.player.activeStrike(), this.boss?.activeStrike() ?? null, ...this.enemies.map((e) => e.activeStrike())];
    const rects = [...strikes.flatMap((s) => (s ? [s.rect] : [])), ...this.arrows.map(arrowTipRect)];
    for (const rect of rects) {
      g.fillRectShape(rect);
      g.strokeRectShape(rect);
    }
  }

  private toggleHitboxes() {
    this.showHitboxes = !this.showHitboxes;
    const world = this.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.showHitboxes;
    world.debugGraphic.clear();
  }
}
