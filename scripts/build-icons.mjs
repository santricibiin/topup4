/**
 * Generate PWA/TWA icon PNGs dari sumber SVG di public/icons/.
 *
 * Output:
 *   icon-192.png, icon-512.png              (purpose: any)
 *   icon-maskable-192.png, -512.png         (purpose: maskable)
 *   badge-72.png                            (monochrome status-bar badge)
 *
 * Jalankan: node scripts/build-icons.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "public", "icons");

/** @type {{src: string, out: string, size: number}[]} */
const TARGETS = [
  { src: "icon-source.svg", out: "icon-192.png", size: 192 },
  { src: "icon-source.svg", out: "icon-512.png", size: 512 },
  { src: "icon-maskable-source.svg", out: "icon-maskable-192.png", size: 192 },
  { src: "icon-maskable-source.svg", out: "icon-maskable-512.png", size: 512 },
  { src: "badge-source.svg", out: "badge-72.png", size: 72 },
];

async function main() {
  for (const t of TARGETS) {
    const svg = await readFile(join(ICONS_DIR, t.src));
    const png = await sharp(svg)
      .resize(t.size, t.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await writeFile(join(ICONS_DIR, t.out), png);
    console.log(`[icons] ${t.out} (${t.size}x${t.size})`);
  }
  console.log("[icons] done.");
}

main().catch((err) => {
  console.error("[icons] failed:", err);
  process.exit(1);
});
