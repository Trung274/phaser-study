// Chạy game thật trong Chrome chạy ngầm (headless), bắt lỗi JS và chụp màn hình.
// Kiểm tra kiểu (tsc) không bắt được lỗi lúc chạy (vd. tên ease sai làm game đơ) => dùng công cụ này.
//
// Cách dùng (cần dev server đang chạy, vd. `npx vite --port 5199`):
//   node tools/browser-test.mjs <url> <thư mục xuất> [số giây] [đoạn JS chạy sau khi game load]
// Ví dụ: dịch người chơi tới cửa đấu trường rồi quan sát 15 giây:
//   node tools/browser-test.mjs http://localhost:5199/ ./tmp 15 "__game.scene.getScene('GameScene').player.body.reset(41.5*128, 968)"
//
// Trong trang có window.__game (chỉ ở chế độ dev, xem src/main.ts).

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [url, outDir, secondsArg = '10', setupJs = ''] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('Usage: node tools/browser-test.mjs <url> <outDir> [seconds] [setupJs]');
  process.exit(1);
}
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
mkdirSync(outDir, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(outDir, 'chrome-profile-'))}`,
  '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 50 && !targets.length; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* Chrome chưa sẵn sàng */ }
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push(d.exception?.description ?? d.text);
  }
});
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.exceptionDetails ? `EVAL ERROR: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}` : r.result.value;
};
const frame = () => evaluate('window.__game ? __game.loop.frame : -1');

await send('Runtime.enable');
await send('Page.navigate', { url });
await sleep(4000);
if (setupJs) console.log('setup:', await evaluate(setupJs));

const startFrame = await frame();
await sleep(Number(secondsArg) * 1000);
const endFrame = await frame();

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(join(outDir, 'screenshot.png'), Buffer.from(shot.data, 'base64'));

console.log(`frames: ${startFrame} -> ${endFrame}${endFrame === startFrame ? '  (GAME ĐƠ: số frame không tăng)' : ''}`);
console.log(errors.length ? `LỖI (${errors.length}):\n${errors.join('\n---\n')}` : 'Không có lỗi JS.');
console.log('Ảnh chụp:', join(outDir, 'screenshot.png'));
ws.close();
chrome.kill();
process.exit(errors.length || endFrame === startFrame ? 1 : 0);
