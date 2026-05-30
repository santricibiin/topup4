// @ts-check
/**
 * Migrasi file dari `public/uploads/<cat>/...` ke `data/uploads/<cat>/...`
 * dan update URL di database (User.avatarUrl, Setting `site.logoUrl`,
 * BrandAsset.logoUrl) agar memakai prefix `/api/media/<cat>/...`.
 *
 * Aman dijalankan berkali-kali (idempotent). File yang sudah dipindah dilewati.
 *
 * Jalankan: `node scripts/migrate-uploads-to-data.mjs`
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

const CWD = process.cwd();
const SRC_ROOT = path.join(CWD, "public", "uploads");
const DST_ROOT = path.join(CWD, "data", "uploads");
const CATEGORIES = ["avatars", "logos", "brands"];

const LEGACY_PREFIX = "/uploads/";
const NEW_PREFIX = "/api/media/";

let movedFiles = 0;
let updatedRows = 0;

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function moveFiles() {
  if (!(await exists(SRC_ROOT))) {
    console.log("Tidak ada folder public/uploads. Skip move file.");
    return;
  }
  for (const cat of CATEGORIES) {
    const src = path.join(SRC_ROOT, cat);
    const dst = path.join(DST_ROOT, cat);
    if (!(await exists(src))) continue;

    await fs.mkdir(dst, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const e of entries) {
      if (!e.isFile()) continue;
      const srcFile = path.join(src, e.name);
      const dstFile = path.join(dst, e.name);
      if (await exists(dstFile)) {
        // sudah ada di tujuan, hapus duplikat di sumber
        await fs.unlink(srcFile).catch(() => {});
        continue;
      }
      await fs.rename(srcFile, dstFile).catch(async () => {
        // fallback: copy + unlink (kalau cross-device)
        const buf = await fs.readFile(srcFile);
        await fs.writeFile(dstFile, buf);
        await fs.unlink(srcFile).catch(() => {});
      });
      movedFiles += 1;
      console.log(`  ✓ ${cat}/${e.name}`);
    }
  }
}

/** Ubah URL legacy `/uploads/<cat>/file?...` → `/api/media/<cat>/file?...`. */
function rewriteUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (!url.startsWith(LEGACY_PREFIX)) return url;
  return NEW_PREFIX + url.slice(LEGACY_PREFIX.length);
}

async function migrateAvatars() {
  const users = await prisma.user.findMany({
    where: { avatarUrl: { startsWith: LEGACY_PREFIX } },
    select: { id: true, avatarUrl: true },
  });
  for (const u of users) {
    const next = rewriteUrl(u.avatarUrl);
    if (next === u.avatarUrl) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { avatarUrl: next },
    });
    updatedRows += 1;
    console.log(`  ✓ user ${u.id}: ${u.avatarUrl} → ${next}`);
  }
}

async function migrateBrands() {
  const rows = await prisma.brandAsset.findMany({
    where: { logoUrl: { startsWith: LEGACY_PREFIX } },
    select: { brand: true, logoUrl: true },
  });
  for (const r of rows) {
    const next = rewriteUrl(r.logoUrl);
    if (next === r.logoUrl) continue;
    await prisma.brandAsset.update({
      where: { brand: r.brand },
      data: { logoUrl: next },
    });
    updatedRows += 1;
    console.log(`  ✓ brand ${r.brand}: ${r.logoUrl} → ${next}`);
  }
}

async function migrateSiteLogo() {
  const setting = await prisma.setting.findUnique({
    where: { key: "site.logoUrl" },
  });
  if (!setting) return;
  if (!setting.value || !setting.value.startsWith(LEGACY_PREFIX)) return;

  const next = rewriteUrl(setting.value);
  await prisma.setting.update({
    where: { key: "site.logoUrl" },
    data: { value: next },
  });
  updatedRows += 1;
  console.log(`  ✓ site.logoUrl: ${setting.value} → ${next}`);
}

async function main() {
  console.log("== Migrasi public/uploads → data/uploads ==");

  console.log("\n[1/4] Pindah file fisik…");
  await moveFiles();

  console.log("\n[2/4] Update User.avatarUrl…");
  await migrateAvatars();

  console.log("\n[3/4] Update BrandAsset.logoUrl…");
  await migrateBrands();

  console.log("\n[4/4] Update Setting site.logoUrl…");
  await migrateSiteLogo();

  console.log(
    `\nSelesai. File dipindah: ${movedFiles}. Row DB diupdate: ${updatedRows}.`,
  );
}

main()
  .catch((e) => {
    console.error("Migrasi gagal:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
