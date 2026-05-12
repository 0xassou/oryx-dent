/**
 * Génère public/icon-192.png et public/icon-512.png depuis public/logo.svg (sharp).
 * Usage : node scripts/generate-pwa-icons.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const input = path.join(root, "public", "logo.svg");
const out192 = path.join(root, "public", "icon-192.png");
const out512 = path.join(root, "public", "icon-512.png");

// Fond aligné sur le manifest PWA (#faf9ff)
const bg = { r: 250, g: 249, b: 255, alpha: 1 };

async function render(size, dest) {
  await sharp(input)
    .resize(size, size, {
      fit: "contain",
      background: bg,
    })
    .png()
    .toFile(dest);
  console.warn(`[icons] écrit ${path.relative(root, dest)} (${size}×${size})`);
}

await render(192, out192);
await render(512, out512);
console.warn("[icons] Terminé.");
