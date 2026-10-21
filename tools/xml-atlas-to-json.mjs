// Chuyển atlas dạng XML (Starling / Sparrow, định dạng các gói Kenney dùng)
// sang JSON Hash: định dạng atlas phổ biến nhất của Phaser, TexturePacker, Aseprite.
// Tên frame được bỏ đuôi ".png" cho gọn: "tile_grass.png" -> "tile_grass".
//
// Cách dùng:
//   node tools/xml-atlas-to-json.mjs <atlas.xml> <output.json>
// Ảnh PNG đi kèm được tìm theo thuộc tính imagePath trong file XML.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node tools/xml-atlas-to-json.mjs <atlas.xml> <output.json>');
  process.exit(1);
}

const xml = readFileSync(input, 'utf8');
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

const atlasTag = xml.match(/<TextureAtlas\s+([^>]*)>/);
if (!atlasTag) throw new Error('Không thấy thẻ <TextureAtlas> trong ' + input);
const imagePath = join(dirname(input), attrs(atlasTag[1]).imagePath);

// Kích thước ảnh nằm trong chunk IHDR của PNG (byte 16..23)
const png = readFileSync(imagePath);
const size = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };

const frames = {};
for (const [, body] of xml.matchAll(/<SubTexture\s+([^>]*?)\/?>/g)) {
  const a = attrs(body);
  const name = a.name.replace(/\.png$/i, '');
  const w = Number(a.width);
  const h = Number(a.height);
  // Sprite đã bị cắt viền trong suốt (trimmed) thì XML có thêm frameX/frameY/frameWidth/frameHeight
  const trimmed = a.frameWidth !== undefined;
  frames[name] = {
    frame: { x: Number(a.x), y: Number(a.y), w, h },
    rotated: false,
    trimmed,
    spriteSourceSize: { x: trimmed ? -Number(a.frameX) : 0, y: trimmed ? -Number(a.frameY) : 0, w, h },
    sourceSize: { w: trimmed ? Number(a.frameWidth) : w, h: trimmed ? Number(a.frameHeight) : h },
  };
}

const json = { frames, meta: { app: 'tools/xml-atlas-to-json.mjs', image: basename(output, '.json') + '.png', size, scale: '1' } };
writeFileSync(output, JSON.stringify(json, null, 2));
console.log(`${Object.keys(frames).length} frames -> ${output} (ảnh ${size.w}x${size.h})`);
