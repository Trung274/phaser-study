# Phaser Study: game hành động 2D

Dự án **học làm game** của người dùng (biết JS/TS, mới làm game). Thể loại: platformer màn hình ngang có chiến đấu cận chiến (chém, lướt, đỡ đòn, phản đòn, boss). Trọng tâm là **game feel / juice**: hit-stop, squash & stretch, hiệu ứng, âm thanh, phản hồi rõ ràng.

Hướng phát triển do người dùng quyết định dần; không nhắm sao chép một game cụ thể nào.

## Cách làm việc với người dùng

- Trả lời bằng **tiếng Việt**; comment trong code cũng bằng tiếng Việt, giải thích *vì sao* (người dùng học từ code).
- Người dùng muốn Claude **sửa file trực tiếp**, sau đó giải thích ngắn: đã làm gì, cần quan sát gì khi chạy, khái niệm game dev mới.
- Làm **từng bước**; việc lớn thì trình bày thiết kế (bảng) trước khi code.
- Báo trung thực những gì **chưa kiểm chứng**; tự bắt và nói rõ lỗi của chính mình.
- Asset bên ngoài: ghi nguồn + giấy phép vào `CREDITS.md`. Nhân vật có bản quyền (hoạt hình, game khác) chỉ dùng để học, nhắc người dùng không phát hành.

## Lệnh

```bash
npm run dev      # chạy game (Vite), mở http://localhost:5173
npm run build    # tsc + vite build (kiểm tra kiểu + đóng gói)
npx tsc          # chỉ kiểm tra kiểu
```

## Kiểm tra trước khi bàn giao (bắt buộc)

`tsc` không bắt được lỗi lúc chạy. Sau thay đổi gameplay, chạy game thật trong Chrome headless:

```bash
node node_modules/vite/bin/vite.js --port 5199 --strictPort   # chạy nền (KHÔNG dùng npx: dừng tác vụ npx không tắt được tiến trình vite con)
node tools/browser-test.mjs http://localhost:5199/ <thư mục tạm> 12 "<JS dựng tình huống>"
```

- In ra lỗi JS, số frame (không tăng = game đơ) và chụp màn hình để xem bằng mắt.
- Trong trang dev có `window.__game` (xem `src/main.ts`): dùng để dịch người chơi tới chỗ cần thử, đọc trạng thái, gọi hàm.
- Xong thì tắt server; nếu cổng vẫn bị chiếm, tìm tiến trình đang nghe cổng 5199 và dừng nó.

## Stack

Phaser 3.90 (Arcade Physics), TypeScript 7, Vite 8. Độ phân giải 1920×1080 (`Scale.FIT`), 1 ô = `TILE` = 128px, trọng lực 3600 (`src/config.ts`).

## Cấu trúc

```
src/
  main.ts              cấu hình Phaser.Game; gắn window.__game khi dev
  config.ts            GAME_WIDTH/HEIGHT, TILE, GRAVITY, ATLAS
  scenes/              PreloadScene (thanh tải) → GameScene (thế giới) + UIScene (HUD chạy song song, camera riêng)
  player/Player.ts     nhân vật chính (state machine, procedural animation)
  entities/            TrainingDummy, Enemy (lính giáo), Boss (Hắc Tướng)
  combat/              attacks.ts (dữ liệu combo), types.ts (HitInfo/Hittable/Attacker/Strike/DefenseResult),
                       HitStop.ts, hitEffects.ts, talisman.ts
  core/                StateMachine.ts, color.ts (lerpColor)
  level/               level1.ts (bản đồ chữ + LEVEL_1_ARENA), buildLevel.ts, mergeCells.ts (hàm thuần)
  audio/Sfx.ts         âm thanh tổng hợp bằng Web Audio (không có file âm thanh)
  ui/textStyle.ts      VI_TEXT, HEAVY_FONT cho chữ tiếng Việt
public/assets/atlases/ scribble.png + scribble.json (Kenney Scribble Platformer, CC0, bản 128px)
art-src/               file nguồn để vẽ/sửa (game không đọc)
tools/                 xml-atlas-to-json.mjs (atlas Kenney XML → JSON), browser-test.mjs
```

## Kiến trúc và quy ước

- **Hitbox tách khỏi hình**: thân vật lý là hình chữ nhật vô hình; phần nhìn thấy là container gốc ở **chân**, đồng bộ trong `POST_UPDATE` (sau physics). Đăng ký listener thì phải gỡ khi `SHUTDOWN` và trong `destroy()`.
- **State machine** (`core/StateMachine.ts`) cho Player, Enemy, Boss: `enter/update/exit`, `timeInState`, `transition(next, restart)`.
- **Đòn đánh là dữ liệu** (frame data startup / active / recovery): `COMBO` (người chơi), `ThrustDef` (lính), `MOVES` + danh sách combo (boss). Cân bằng = sửa số, không sửa logic.
- **Hệ thống chiến đấu ở GameScene**: Player/kẻ địch chỉ báo `activeStrike()` và `hurtbox`; GameScene dò va chạm. `Hittable` = thứ bị chém được, `Attacker` = thứ đánh người chơi. `Player.receiveAttack()` trả về `DefenseResult`; `switch` xử lý có kiểm tra `never` (thiếu nhánh là lỗi biên dịch).
- **Thông số tính theo ô** (`2.45 * TILE`), vận tốc tự tính từ quãng đường/thời gian hoặc `v² = 2gh`.
- **Procedural animation**: bộ Scribble không có animation khung hình; tư thế tính từ trạng thái + vận tốc, làm mượt bằng `1 - e^(-dt·k)`.
- Bản đồ là lưới ký tự: `. # B C = b f T F P D E X` (ý nghĩa ghi ở đầu `level1.ts`); va chạm gộp ô liền nhau thành ít hình chữ nhật.
- Field của scene còn nguyên khi `scene.restart()` → reset trong `create()`; dữ liệu qua restart: `scene.restart({ checkpoint })`.

## Gameplay hiện có

Chạy/nhảy (coyote time, jump buffer, nhảy thấp/cao theo độ giữ phím), cầu một chiều, lướt có i-frames, combo chém 3 nhát + chém trên không, đỡ đòn (cửa sổ hoàn hảo 160ms, đỡ thường → nội thương), phản đòn khắc chế đòn đỏ không đỡ được, Qi (+1 khi đỡ hoàn hảo / phản đòn) để dán bùa, máu 5 tim, hố + hồi sinh chỗ an toàn, lính giáo (AI tuần tra/đuổi/báo trước/giáp cứng khi ra đòn đỏ), boss 2 pha có thanh choáng (poise), checkpoint ở cửa đấu trường.

Điều khiển: ←/→ chạy · Space nhảy · Shift/L lướt · J/X chém · K/C đỡ · U/Z phản đòn · I/V bùa · ↓+Space xuống cầu · H khung va chạm · R chơi lại từ đầu · F toàn màn hình.

Ngôn ngữ hình ảnh: chớp **trắng** = đỡ được; **đỏ** (`!!`, hào quang đỏ) = không đỡ được → né hoặc phản đòn. Kiếm loé **vàng** = cửa sổ đỡ hoàn hảo, loé **đỏ** = khung phản đòn. Boss cố ý không dùng màu đỏ.

## Bẫy đã gặp

- Hiệu ứng camera (`cam.pan`, `cam.zoomTo`) chỉ nhận tên ease **đầy đủ** (`'Quad.easeOut'`), không nhận tên tắt của tween (`'Quad.Out'`). Sai → `this.ease is not a function` → game đơ hoàn toàn (kể cả phím R).
- Exception trong vòng lặp game làm Phaser dừng hẳn: khi người dùng báo "đơ", tái hiện bằng `tools/browser-test.mjs` để đọc lỗi.
- Hiệu ứng tạo ngay trước hit-stop không được tween "nảy từ 0" (tween bị dừng → vô hình trong khung đứng hình).
- Chữ tiếng Việt: trộn `VI_TEXT` (chuỗi đo có dấu hai tầng); chữ đậm dùng `HEAVY_FONT` (Arial Black thiếu Ư/Ơ/Ắ). HUD đặt trên nền rối cần tấm nền riêng.
- Lướt trên đất tắt trọng lực nên thân rời sàn: reset vận tốc rơi cũ, kẻo lúc "tiếp đất" lại bị tính là đáp mạnh.
- Xem ảnh PNG đã tách nền bằng công cụ đọc ảnh có thể hiện màu ẩn của pixel trong suốt: ghép lên nền màu trơn trước khi kết luận ảnh "còn nền".

## Hướng tiếp theo (đang bàn, chưa làm)

Thay nhân vật hình khối bằng sprite có animation thật (người dùng đang cân nhắc tạo bằng AI, vd. Ludo.ai: tạo một ảnh gốc nhìn nghiêng quay phải, rồi tạo từng chuyển động từ ảnh gốc đó, khớp khung "chém trúng" với pha active của đòn). Các hạng mục khác có thể làm: màn chơi bằng Tiled, nền nhiều lớp vẽ tay, nhiều phòng, lưu game, menu/tạm dừng.
