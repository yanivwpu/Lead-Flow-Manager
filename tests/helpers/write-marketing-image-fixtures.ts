/**
 * Writes tiny valid + truncated/corrupt JPG/PNG/WebP fixtures for Marketing Materials tests.
 * Run: npx tsx tests/helpers/write-marketing-image-fixtures.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const dir = join(process.cwd(), "tests/fixtures/marketing-images");

async function main(): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const jpeg = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 12, g: 80, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .png()
    .toBuffer();
  const webp = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 10, b: 200 } },
  })
    .webp()
    .toBuffer();
  writeFileSync(join(dir, "valid-tiny.jpg"), jpeg);
  writeFileSync(join(dir, "valid-tiny.png"), png);
  writeFileSync(join(dir, "valid-tiny.webp"), webp);
  writeFileSync(join(dir, "truncated.jpg"), jpeg.subarray(0, 22));
  writeFileSync(join(dir, "truncated.png"), png.subarray(0, 24));
  writeFileSync(join(dir, "truncated.webp"), webp.subarray(0, 20));
  writeFileSync(
    join(dir, "corrupt.jpg"),
    Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 0)]),
  );
  writeFileSync(
    join(dir, "corrupt.png"),
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(24, 0),
    ]),
  );
  writeFileSync(
    join(dir, "corrupt.webp"),
    Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.alloc(4, 0x10),
      Buffer.from("WEBP"),
      Buffer.alloc(16, 0),
    ]),
  );
  console.log(`[fixtures] wrote ${dir}`);
}

void main();
