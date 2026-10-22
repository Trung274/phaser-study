# Phaser Study: game hành động 2D

Dự án **học làm game** của người dùng (biết JS/TS, mới làm game). Thể loại: platformer màn hình ngang có chiến đấu cận chiến (chém, lướt, đỡ đòn, phản đòn, boss). Trọng tâm là **game feel / juice**: hit-stop, squash & stretch, hiệu ứng, âm thanh, phản hồi rõ ràng.

Hướng phát triển do người dùng quyết định dần; không nhắm sao chép một game cụ thể nào.

## Cách làm việc với người dùng

- Trả lời bằng **tiếng Việt**; comment trong code cũng bằng tiếng Việt, giải thích *vì sao* (người dùng học từ code).
- Người dùng muốn Claude **sửa file trực tiếp**, sau đó giải thích ngắn: đã làm gì, cần quan sát gì khi chạy, khái niệm game dev mới.
- Làm **từng bước**; việc lớn thì trình bày thiết kế (bảng) trước khi code.
- Báo trung thực những gì **chưa kiểm chứng**; tự bắt và nói rõ lỗi của chính mình.
- Asset bên ngoài: ghi nguồn + giấy phép vào `CREDITS.md`. Nhân vật có bản quyền (hoạt hình, game khác) chỉ dùng để học, nhắc người dùng không phát hành.
- Hình nhân vật: dùng gói asset thật hoặc ảnh AI, **không tự vẽ nhân vật** (người dùng chê hình Claude tự vẽ). Gạch/nền đơn giản vẽ bằng code thì được, nhưng phải xem ảnh chụp trước khi bàn giao.

## Lệnh

```bash
npm run dev      # chạy game (Vite), mở http://localhost:5173 (màn chọn chế độ)
                 # http://localhost:5173/?theme=pixel hoặc ?theme=scribble: vào thẳng một chế độ
npm run build    # tsc + vite build (kiểm tra kiểu + đóng gói)
npx tsc          # chỉ kiểm tra kiểu
node tools/aseprite-grid-to-json.mjs <file.aseprite> <sheet.png> <out.json>   # tạo JSON Aseprite cho sheet dạng lưới
```

## Kiểm tra trước khi bàn giao (bắt buộc)

`tsc` không bắt được lỗi lúc chạy. Sau thay đổi gameplay, chạy game thật trong Chrome headless, **cả hai chế độ**:

```bash
node node_modules/vite/bin/vite.js --port 5199 --strictPort   # chạy nền (KHÔNG dùng npx: dừng tác vụ npx không tắt được tiến trình vite con)
node tools/browser-test.mjs "http://localhost:5199/?theme=pixel" <thư mục tạm> 12 "<JS dựng tình huống>"
```

- In ra lỗi JS, số frame (không tăng = game đơ) và chụp màn hình để xem bằng mắt. Không có `?theme=` thì game dừng ở màn chọn chế độ.
- Trong trang dev có `window.__game` (xem `src/main.ts`): dùng để dịch người chơi tới chỗ cần thử, đọc trạng thái, gọi hàm (field `private` của TS vẫn đọc được từ JS).
- Chrome headless chỉ chạy ~6–20 FPS và Phaser kẹp delta khi trang không được focus => game chạy **chậm như quay chậm** (mọi mốc thời gian dài ra 3–6 lần). Nhấn phím giả lập phải giữ ≥ 250ms (nhấn + nhả trong cùng một frame thì `JustDown` không thấy). Muốn chắc chắn thì ép trạng thái bằng JS (`player.fsm.transition('parry')`...).
- **Không** thay `Math.random` để ép kết quả: Phaser dùng nó đặt tên texture cho chữ => trùng tên => lỗi giả.
- Xong thì tắt server; nếu cổng vẫn bị chiếm, tìm tiến trình đang nghe cổng 5199 và dừng nó.

## Stack

Phaser 3.90 (Arcade Physics), TypeScript 7, Vite 8. Độ phân giải 1920×1080 (`Scale.FIT`), 1 ô = `TILE` = 128px, trọng lực 3600 (`src/config.ts`).

## Cấu trúc

```
src/
  main.ts              cấu hình Phaser.Game; gắn window.__game khi dev
  config.ts            GAME_WIDTH/HEIGHT, TILE, GRAVITY, ATLAS
  scenes/              PreloadScene (nạp + vẽ texture pixel) → MenuScene (chọn chế độ)
                       → GameScene (thế giới) + UIScene (HUD chạy song song, camera riêng)
  themes/              CHẾ ĐỘ CHƠI: types.ts (Theme, HudStyle), index.ts (THEME_LIST, getTheme), scribble.ts,
                       pixel/ (index.ts theme, level.ts bản đồ, characters.ts bảng khung hình lính/orc,
                               textures.ts tạo texture, pixelArt.ts vẽ gạch/nền/hiệu ứng bằng mảng pixel: hàm thuần)
  looks/               "BỘ DA" (phần nhìn thấy): PlayerLook.ts / EnemyLook.ts (interface + View),
                       Scribble*Look (tư thế tính bằng code), Sprite*Look + SpriteRig (sprite sheet Aseprite)
  player/Player.ts     nhân vật chính, CHỈ logic (state machine), gọi bộ da để vẽ
  entities/            TrainingDummy, Enemy (lính thường: giáo/orc tuỳ bộ da), Boss (Hắc Tướng, chỉ Scribble)
  combat/              attacks.ts (combo), types.ts (HitInfo/Hittable/Attacker/Strike/DefenseResult), HitStop.ts,
                       hitEffects.ts, fxStyle.ts (phong cách hiệu ứng theo chế độ), specials.ts (chiêu tốn Qi),
                       talisman.ts (bùa), arrows.ts (mũi tên)
  core/                StateMachine.ts, color.ts (lerpColor)
  level/               level1.ts (bản đồ Scribble + LEVEL_1_ARENA), buildLevel.ts (nhận Tileset), mergeCells.ts
  audio/Sfx.ts         âm thanh tổng hợp bằng Web Audio (không có file âm thanh)
  ui/textStyle.ts      VI_TEXT, HEAVY_FONT cho chữ tiếng Việt
public/assets/
  atlases/             scribble.png + .json (Kenney Scribble Platformer, CC0, bản 128px)
  characters/          soldier/, orc/: sheet .png + JSON Aseprite (Tiny RPG, Zerie; không được phân phối lại)
  projectiles/         arrow.png
art-src/               file nguồn để vẽ/sửa (game không đọc): svg Kenney, .aseprite của Tiny RPG
tools/                 xml-atlas-to-json.mjs, aseprite-grid-to-json.mjs, browser-test.mjs
```

## Kiến trúc và quy ước

- **Hitbox tách khỏi hình**: thân vật lý là hình chữ nhật vô hình; phần nhìn thấy (bộ da) gốc ở **chân**, đồng bộ trong `POST_UPDATE` (sau physics). Đăng ký listener thì phải gỡ khi `SHUTDOWN` và trong `destroy()`.
- **Bộ da (look)**: Player/Enemy chỉ có logic. Mỗi frame chúng gửi một `PlayerView`/`EnemyView` (trạng thái, thời gian trong trạng thái, frame data của đòn...) cho bộ da; sự kiện tức thời đi qua hàm riêng (`flash`, `squash`, `afterimage`, `swing`, `die`). Hiệu ứng phải hiện TRONG khung đứng hình (vệt chém) thì gọi ngay lúc xảy ra, không chờ `update` của bộ da.
- **Chế độ chơi = Theme** (`themes/types.ts`): bản đồ, bộ gạch, nền, bộ da, phong cách hiệu ứng, HUD, chiêu đặc biệt. Scene không if/else theo tên theme. Theme truyền qua `scene.start('GameScene', { theme })`, `restart` giữ theme, UIScene được `launch` kèm theme; Esc = dừng UIScene + về MenuScene.
- **fxStyle trong registry**: `setFxStyle(scene, theme.fx)` ở GameScene; mọi hàm hiệu ứng đọc `fxStyle(scene)` (texture có `effect_blast/…`, font, màu nét).
- **Sprite sheet Aseprite**: `load.aseprite` + `sprite.anims.createFromAseprite(key)` tạo animation RIÊNG cho từng sprite (lính và orc trùng tên tag). Animation trang trí (idle, walk) để Phaser tự chạy; khung gắn với luật chơi (đòn đánh, bị đánh, chết) chọn theo **thời gian trong trạng thái / frame data** (`PhasedAnim`: tag + khung cho startup/active/recovery) => luôn khớp hitbox và đứng hình đúng khung "chém trúng". Đổi nhân vật = nạp sheet mới + điền một `SpritePlayerDef`/`SpriteEnemyDef`.
- **Luật pixel art**: phóng số nguyên lần (×8: ô 16px = TILE), lọc NEAREST, không xoay, squash chỉ 35%, viền 1 pixel = 4 bản sao tô màu lệch 1 pixel ảnh.
- **Đòn đánh là dữ liệu** (frame data startup / active / recovery): `COMBO`, `ThrustDef`, `MOVES` (boss), `SpecialDef`. Cân bằng = sửa số, không sửa logic.
- **Hệ thống chiến đấu ở GameScene**: Player/kẻ địch chỉ báo `activeStrike()` và `hurtbox`; GameScene dò va chạm. `Strike.effect` = chiêu đặc biệt ('talisman' dán bùa, 'arrow' bắn tên). `Player.receiveAttack()` trả về `DefenseResult`; `switch` có kiểm tra `never`.
- **Mũi tên**: tự di chuyển trong `GameScene.updateArrows` (đứng yên khi hit-stop), dò va chạm bằng **đoạn quét** từ đầu mũi tên frame trước tới frame này; cắm vào tường.
- **Thắng màn** (`GameScene.cleared`): có boss thì hạ boss, không có boss thì hạ hết kẻ địch.
- **Thông số tính theo ô** (`2.45 * TILE`), vận tốc tự tính từ quãng đường/thời gian hoặc `v² = 2gh`.
- Bản đồ là lưới ký tự: `. # B C = b f T F P D E X` (ý nghĩa ghi ở đầu `level1.ts`); cùng bản đồ dựng được bằng nhiều bộ gạch; va chạm gộp ô liền nhau thành ít hình chữ nhật.
- Field của scene còn nguyên khi `scene.restart()` / dừng rồi mở lại → reset trong `create()`.

## Gameplay hiện có

Hai chế độ, cùng luật chơi:
- **Giấy & Mực** (Scribble): hình nộm, lính giáo, boss 2 pha có thanh choáng (poise), checkpoint ở cửa đấu trường. Chiêu đặc biệt: dán bùa.
- **Pixel: Lính & Orc** (Tiny RPG): 5 orc, hố có cầu, pháo đài gạch. Chiêu đặc biệt: bắn cung (lấy đà 380ms). Hạ hết orc là thắng.

Chung: chạy/nhảy (coyote time, jump buffer, nhảy thấp/cao theo độ giữ phím), cầu một chiều, lướt có i-frames, combo chém 3 nhát + chém trên không, đỡ đòn (cửa sổ hoàn hảo 160ms, đỡ thường → nội thương), phản đòn khắc chế đòn đỏ, Qi (+1 khi đỡ hoàn hảo / phản đòn) cho chiêu đặc biệt, máu 5 tim, hố + hồi sinh chỗ an toàn, AI lính (tuần tra/đuổi/báo trước/giáp cứng khi ra đòn đỏ).

Điều khiển: ←/→ chạy · Space nhảy · Shift/L lướt · J/X chém · K/C đỡ · U/Z phản đòn · I/V chiêu đặc biệt · ↓+Space xuống cầu · H khung va chạm · R chơi lại từ đầu · Esc chọn chế độ · F toàn màn hình.

Ngôn ngữ hình ảnh: chớp **trắng** = đỡ được; **đỏ** (`!!`, hào quang / viền đỏ) = không đỡ được → né hoặc phản đòn. Cửa sổ đỡ hoàn hảo loé **vàng** (Scribble: thanh kiếm; Pixel: viền quanh người), khung phản đòn loé **đỏ**. Boss cố ý không dùng màu đỏ.

## Bẫy đã gặp

- Hiệu ứng camera (`cam.pan`, `cam.zoomTo`) chỉ nhận tên ease **đầy đủ** (`'Quad.easeOut'`), không nhận tên tắt của tween (`'Quad.Out'`). Sai → `this.ease is not a function` → game đơ hoàn toàn (kể cả phím R).
- Exception trong vòng lặp game làm Phaser dừng hẳn: khi người dùng báo "đơ", tái hiện bằng `tools/browser-test.mjs` để đọc lỗi.
- Hiệu ứng tạo ngay trước hit-stop không được tween "nảy từ 0" (tween bị dừng → vô hình trong khung đứng hình).
- Chữ tiếng Việt: trộn `VI_TEXT` (chuỗi đo có dấu hai tầng); chữ đậm dùng `HEAVY_FONT` (Arial Black thiếu Ư/Ơ/Ắ). HUD đặt trên nền rối cần tấm nền hoặc viền chữ.
- Lướt trên đất tắt trọng lực nên thân rời sàn: reset vận tốc rơi cũ, kẻo lúc "tiếp đất" lại bị tính là đáp mạnh.
- Xem ảnh PNG đã tách nền bằng công cụ đọc ảnh có thể hiện màu ẩn của pixel trong suốt: ghép lên nền màu trơn trước khi kết luận ảnh "còn nền".
- Pixel art trong Phaser 3: texture mặc định lọc LINEAR (nhoè khi phóng) → `texture.setFilter(NEAREST)`; với canvas texture phải gọi **sau** `refresh()` (refresh đặt lại bộ lọc). TileSprite chép ảnh không phải luỹ thừa 2 sang canvas luỹ thừa 2 (bị nội suy) và dùng bộ lọc chung của game → nền pixel dùng các Image xếp nối tiếp thay vì TileSprite.
- `flipX` lật ảnh **trong khung**, không lật quanh gốc → thân không nằm giữa khung thì đổi gốc `x → 1 - x` khi lật.
- `anims.pause()` rồi `resume()` sẽ chạy tiếp cả animation đã `stop()` giữa chừng → đóng băng animation lặp bằng `anims.timeScale = 0`.
- `new ImageData(data, w, h)`: kiểu dữ liệu phải là `Uint8ClampedArray<ArrayBuffer>` (TS mới phân biệt với SharedArrayBuffer).
- Trạng thái nào thiếu ma sát thì thân Arcade trượt mãi (đã gặp ở trạng thái chết).

## Hướng tiếp theo (đang bàn, chưa làm)

Đường ống sprite đã có (bộ da + bảng khung hình): nhân vật tạo bằng AI (vd. Ludo.ai: một ảnh gốc nhìn nghiêng quay phải, rồi từng chuyển động từ ảnh gốc đó) chỉ cần xuất sheet + JSON Aseprite rồi điền một `SpritePlayerDef`, khớp khung "chém trúng" với pha active. Các hạng mục khác có thể làm: màn chơi bằng Tiled, nhiều phòng, lưu game, tạm dừng, boss cho chế độ Pixel.
