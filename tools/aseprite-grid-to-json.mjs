// Tạo file JSON chuẩn Aseprite (Phaser đọc bằng this.load.aseprite + anims.createFromAseprite)
// từ: file .aseprite (lấy THỜI LƯỢNG từng khung + TAG = tên animation) và ảnh lưới đã xuất sẵn.
//
// Dùng khi gói asset có .aseprite nhưng không kèm JSON, và ảnh lưới xếp MỖI TAG MỘT HÀNG
// (hàng 0 = tag đầu tiên, khung từ trái sang phải) như gói Tiny RPG.
// Có Aseprite thì không cần công cụ này: File > Export Sprite Sheet, tick "JSON Data", chọn "Hash".
//
// Cách dùng:
//   node tools/aseprite-grid-to-json.mjs <file.aseprite> <sheet.png> <output.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [asePath, sheetPath, outPath] = process.argv.slice(2);
if (!asePath || !sheetPath || !outPath) {
  console.error('Usage: node tools/aseprite-grid-to-json.mjs <file.aseprite> <sheet.png> <output.json>');
  process.exit(1);
}

// --- Đọc .aseprite: chỉ phần đầu từng khung (thời lượng) và chunk Tags, không giải nén ảnh ---
// Đặc tả định dạng: https://github.com/aseprite/aseprite/blob/main/docs/ase-file-specs.md
const ase = readFileSync(asePath);
if (ase.readUInt16LE(4) !== 0xa5e0) throw new Error(`${asePath} không phải file .aseprite`);
const frameCount = ase.readUInt16LE(6);
const cellW = ase.readUInt16LE(8);
const cellH = ase.readUInt16LE(10);
const durations = [];
const tags = [];
let pos = 128;
for (let f = 0; f < frameCount; f++) {
  const frameBytes = ase.readUInt32LE(pos);
  durations.push(ase.readUInt16LE(pos + 8));
  const chunkCount = ase.readUInt32LE(pos + 12) || ase.readUInt16LE(pos + 6);
  let p = pos + 16;
  for (let c = 0; c < chunkCount; c++) {
    const size = ase.readUInt32LE(p);
    if (ase.readUInt16LE(p + 4) === 0x2018) {
      // Chunk Tags: số tag, 8 byte dự phòng, rồi từng tag: from, to, hướng chạy, ..., tên
      let q = p + 6;
      const n = ase.readUInt16LE(q);
      q += 10;
      for (let t = 0; t < n; t++) {
        const from = ase.readUInt16LE(q);
        const to = ase.readUInt16LE(q + 2);
        const dir = ase[q + 4];
        q += 17;
        const len = ase.readUInt16LE(q);
        tags.push({ name: ase.toString('utf8', q + 2, q + 2 + len).toLowerCase(), from, to, direction: ['forward', 'reverse', 'pingpong'][dir] ?? 'forward' });
        q += 2 + len;
      }
    }
    p += size;
  }
  pos += frameBytes;
}

// --- Ảnh lưới: kích thước nằm trong chunk IHDR của PNG ---
const png = readFileSync(sheetPath);
const sheetW = png.readUInt32BE(16);
const sheetH = png.readUInt32BE(20);
const cols = sheetW / cellW;
const rows = sheetH / cellH;
if (tags.length > rows) throw new Error(`Có ${tags.length} tag nhưng ảnh chỉ có ${rows} hàng`);

// --- Mỗi khung: tên = số thứ tự toàn cục ("0", "1"...) như Aseprite xuất, vị trí = (cột trong tag, hàng của tag) ---
const frames = {};
tags.forEach((tag, row) => {
  const count = tag.to - tag.from + 1;
  if (count > cols) throw new Error(`Tag "${tag.name}" có ${count} khung, ảnh chỉ có ${cols} cột`);
  for (let i = tag.from; i <= tag.to; i++) {
    frames[String(i)] = {
      frame: { x: (i - tag.from) * cellW, y: row * cellH, w: cellW, h: cellH },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cellW, h: cellH },
      sourceSize: { w: cellW, h: cellH },
      duration: durations[i],
    };
  }
});

const json = {
  frames,
  meta: {
    app: 'tools/aseprite-grid-to-json.mjs',
    image: basename(sheetPath),
    format: 'RGBA8888',
    size: { w: sheetW, h: sheetH },
    scale: '1',
    frameTags: tags,
  },
};
writeFileSync(outPath, JSON.stringify(json, null, 2));
console.log(`${Object.keys(frames).length} khung, tag: ${tags.map((t) => `${t.name}(${t.to - t.from + 1})`).join(', ')} -> ${outPath}`);
