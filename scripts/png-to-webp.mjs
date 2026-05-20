/**
 * One-off: convert PNGs in public/ to WebP at lossless quality.
 * Deletes the originals after successful conversion.
 *
 *   node scripts/png-to-webp.mjs
 */
import sharp from "sharp";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC_DIR = "public";
const TARGETS = ["logo.png", "hero-logo.png"];

async function main() {
  for (const file of TARGETS) {
    const src = join(PUBLIC_DIR, file);
    const dst = join(PUBLIC_DIR, file.replace(/\.png$/, ".webp"));
    const srcSize = (await stat(src)).size;
    await sharp(src).webp({ lossless: true, effort: 6 }).toFile(dst);
    const dstSize = (await stat(dst)).size;
    const pct = ((1 - dstSize / srcSize) * 100).toFixed(1);
    console.log(
      `${file} → ${file.replace(/\.png$/, ".webp")}  ${srcSize.toLocaleString()}B → ${dstSize.toLocaleString()}B (-${pct}%)`,
    );
    await unlink(src);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
