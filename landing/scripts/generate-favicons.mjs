/**
 * Build Polymock-sized favicons (32 / 192 / 512) from hashfoxlogo.png with transparent background.
 * Run: node scripts/generate-favicons.mjs
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "public", "hashfoxlogo.png");

const BLACK_THRESH = 38; // pixels darker than this become transparent (removes flat black bg)

async function stripNearBlackToAlpha(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (r <= BLACK_THRESH && g <= BLACK_THRESH && b <= BLACK_THRESH) {
      px[i + 3] = 0;
    }
  }
  return sharp(Buffer.from(px), {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png();
}

async function writeFavicon(size, outName) {
  const trimmed = await stripNearBlackToAlpha(readFileSync(src));
  await trimmed
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(join(root, "public", outName));
  console.log("wrote", outName, size);
}

await writeFavicon(32, "favicon-32.png");
await writeFavicon(192, "favicon-192.png");
await writeFavicon(512, "favicon-512.png");
