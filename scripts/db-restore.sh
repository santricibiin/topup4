#!/usr/bin/env bash
# =================================================================
# PTopup — DB Restore Script
# =================================================================
#
# Restore database `ptopup` dari file SQL backup.
# Otomatis backup DB current dulu sebelum restore (safety net).
#
# Cara pakai:
#   sudo bash db-restore.sh /path/to/backup.sql
#   sudo bash db-restore.sh https://example.com/backup.sql
#   sudo bash db-restore.sh /path/to/backup.sql.gz                       (auto-decompress)
#   sudo bash db-restore.sh --yes /path/to/backup.sql                    (skip konfirmasi)
#   sudo bash db-restore.sh --no-restart backup.sql                      (tidak restart app)
#   sudo bash db-restore.sh backup.sql.gz --uploads=uploads.tar.gz       (restore juga folder uploads)
#   sudo bash db-restore.sh --uploads=uploads.tar.gz --no-db backup.sql  (skip DB, hanya uploads)
#
# Yang dilakukan:
#   1. Validasi file SQL (atau download kalau URL)
#   2. Backup DB current → /root/backups/pre-restore-YYYYMMDD-HHMMSS.sql
#   3. Drop semua tabel di DB ptopup
#   4. Import file SQL backup
#   5. Restore data/uploads/ kalau --uploads diberikan (auto-backup folder current dulu)
#   6. Run `prisma db push` (sync schema kalau ada kolom baru)
#   7. Restart PM2 ptopup (kecuali --no-restart)
#
# =================================================================
set -euo pipefail

# ----------------------- args -----------------------
SKIP_CONFIRM=0
NO_RESTART=0
NO_DB=0
BACKUP_SOURCE=""
UPLOADS_SOURCE=""

for arg in "$@"; do
  case $arg in
    --yes|-y)       SKIP_CONFIRM=1 ;;
    --no-restart)   NO_RESTART=1 ;;
    --no-db)        NO_DB=1 ;;
    --uploads=*)    UPLOADS_SOURCE="${arg#*=}" ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    -*)
      echo "Unknown flag: $arg"
      exit 1
      ;;
    *)
      if [[ -z "$BACKUP_SOURCE" ]]; then
        BACKUP_SOURCE="$arg"
      else
        echo "Multiple sources tidak didukung. Sumber pertama: $BACKUP_SOURCE"
        exit 1
      fi
      ;;
  esac
done

# Validasi: minimal salah satu source harus ada
if [[ -z "$BACKUP_SOURCE" && -z "$UPLOADS_SOURCE" ]]; then
  echo "Usage: $0 <file.sql | url> [--uploads=<file.tar.gz>] [--yes] [--no-restart] [--no-db]"
  echo ""
  echo "Contoh:"
  echo "  # Restore DB saja"
  echo "  sudo bash $0 /root/backups/ptopup-20260530.sql.gz"
  echo ""
  echo "  # Restore DB + uploads"
  echo "  sudo bash $0 /root/backups/ptopup-20260530.sql.gz --uploads=/root/backups/ptopup-uploads-20260530.tar.gz"
  echo ""
  echo "  # Restore uploads doang (skip DB)"
  echo "  sudo bash $0 --uploads=/root/backups/ptopup-uploads-20260530.tar.gz --no-db dummy.sql"
  exit 1
fi

# Kalau --no-db, BACKUP_SOURCE boleh kosong (tapi kita tetap perlu placeholder utk skip step DB)
if [[ $NO_DB -eq 1 ]]; then
  [[ -z "$UPLOADS_SOURCE" ]] && { echo "ERROR: --no-db wajib bareng --uploads=<file>."; exit 1; }
fi

[[ $EUID -ne 0 ]] && { echo "ERROR: Harus run dengan sudo (root)."; exit 1; }

# ----------------------- logging -----------------------
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${BLUE}═══ $1 ═══${NC}"; }

APP_DIR="/opt/ptopup"
APP_USER="ptopup"
DB_NAME="ptopup"
DB_USER="ptopup"
DB_PASS_FILE="/root/.ptopup-db-password"
BACKUP_DIR="/root/backups"
TMP_DIR=$(mktemp -d)

# Cleanup tmp dir saat exit
trap 'rm -rf "$TMP_DIR"' EXIT

# ============================================================
# STEP 1 — Validasi & resolve source
# ============================================================
step "1/7 — Validasi sumber backup"

# Cek mysql tersedia (kalau bukan --no-db)
if [[ $NO_DB -eq 0 ]]; then
  command -v mysql >/dev/null || err "MySQL client gak ada. Install dulu: apt install mysql-client"

  # Cek password file
  [[ ! -f "$DB_PASS_FILE" ]] && err "Password file gak ada: $DB_PASS_FILE. App belum di-deploy?"
  DB_PASS=$(cat "$DB_PASS_FILE")

  # ----------------------- detect MySQL auth -----------------------
  # Deteksi metode auth SEKALI di awal, pakai konsisten di semua call.
  if mysql -u root -e "SELECT 1" >/dev/null 2>&1; then
    MYSQL_AUTH=(-u root)
    MYSQLDUMP_AUTH=(-u root)
    AUTH_INFO="root (auth_socket)"
  elif mysql -u "$DB_USER" -p"$DB_PASS" -e "SELECT 1" >/dev/null 2>&1; then
    MYSQL_AUTH=(-u "$DB_USER" "-p$DB_PASS")
    MYSQLDUMP_AUTH=(-u "$DB_USER" "-p$DB_PASS")
    AUTH_INFO="$DB_USER (password)"
  else
    err "Gak bisa connect MySQL (root maupun $DB_USER). Cek password di $DB_PASS_FILE."
  fi
  ok "MySQL auth: $AUTH_INFO"
else
  warn "Mode --no-db aktif: skip semua operasi DB."
fi

# Resolve SQL source: URL atau file (skip kalau --no-db)
SQL_FILE=""
if [[ $NO_DB -eq 0 ]]; then
  if [[ "$BACKUP_SOURCE" =~ ^https?:// ]]; then
    log "Download backup dari URL..."
    SQL_FILE="$TMP_DIR/download.sql"
    if [[ "$BACKUP_SOURCE" == *.gz ]]; then
      SQL_FILE="${SQL_FILE}.gz"
    fi
    curl -fsSL "$BACKUP_SOURCE" -o "$SQL_FILE" || err "Download gagal: $BACKUP_SOURCE"
    ok "Downloaded: $(du -h "$SQL_FILE" | awk '{print $1}')"
  else
    [[ ! -f "$BACKUP_SOURCE" ]] && err "File gak ada: $BACKUP_SOURCE"
    SQL_FILE="$BACKUP_SOURCE"
    ok "File SQL: $SQL_FILE ($(du -h "$SQL_FILE" | awk '{print $1}'))"
  fi

  # Decompress kalau .gz
  if [[ "$SQL_FILE" == *.gz ]]; then
    log "Decompress .gz..."
    command -v gunzip >/dev/null || err "gunzip gak ada. Install: apt install gzip"
    DECOMPRESSED="$TMP_DIR/restore.sql"
    gunzip -c "$SQL_FILE" > "$DECOMPRESSED"
    SQL_FILE="$DECOMPRESSED"
    ok "Decompressed: $(du -h "$SQL_FILE" | awk '{print $1}')"
  fi

  # Quick sanity check — file harus ada SQL statement
  if ! grep -qiE "(CREATE TABLE|INSERT INTO|DROP TABLE)" "$SQL_FILE"; then
    warn "File ini gak terlihat seperti SQL dump valid. Lanjut anyway?"
    if [[ $SKIP_CONFIRM -eq 0 ]]; then
      echo -ne "${YELLOW}Lanjut? (yes/no): ${NC}"
      read -r ANS
      [[ "$ANS" != "yes" ]] && { echo "Dibatalkan."; exit 0; }
    fi
  fi
fi

# Validasi uploads bundle (kalau diberikan)
if [[ -n "$UPLOADS_SOURCE" ]]; then
  if [[ "$UPLOADS_SOURCE" =~ ^https?:// ]]; then
    log "Download uploads bundle dari URL..."
    UPLOADS_LOCAL="$TMP_DIR/uploads.tar.gz"
    curl -fsSL "$UPLOADS_SOURCE" -o "$UPLOADS_LOCAL" || err "Download uploads gagal: $UPLOADS_SOURCE"
    UPLOADS_SOURCE="$UPLOADS_LOCAL"
  else
    [[ ! -f "$UPLOADS_SOURCE" ]] && err "Uploads file gak ada: $UPLOADS_SOURCE"
  fi
  # Validasi tar valid + struktur (harus mulai dengan data/uploads/)
  if ! tar -tzf "$UPLOADS_SOURCE" 2>/dev/null | head -1 | grep -q "^data/uploads"; then
    warn "Bundle gak terlihat berisi data/uploads/ (root path bukan 'data/uploads')."
    if [[ $SKIP_CONFIRM -eq 0 ]]; then
      echo -ne "${YELLOW}Lanjut anyway? (yes/no): ${NC}"
      read -r ANS
      [[ "$ANS" != "yes" ]] && { echo "Dibatalkan."; exit 0; }
    fi
  fi
  ok "File uploads: $UPLOADS_SOURCE ($(du -h "$UPLOADS_SOURCE" | awk '{print $1}'))"
fi

# ============================================================
# STEP 2 — Konfirmasi
# ============================================================
if [[ $SKIP_CONFIRM -eq 0 ]]; then
  step "2/7 — Konfirmasi"

  # Hitung jumlah tabel & row di DB current (kalau bukan --no-db)
  CURRENT_TABLES="?"
  CURRENT_USERS="?"
  if [[ $NO_DB -eq 0 ]]; then
    CURRENT_TABLES=$(mysql "${MYSQL_AUTH[@]}" -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME';" 2>/dev/null || echo "?")
    CURRENT_USERS=$(mysql "${MYSQL_AUTH[@]}" -N -e "SELECT COUNT(*) FROM $DB_NAME.User;" 2>/dev/null || echo "?")
  fi

  # Hitung file uploads current
  CURRENT_UPLOADS="-"
  if [[ -d "$APP_DIR/data/uploads" ]]; then
    CURRENT_UPLOADS="$(find "$APP_DIR/data/uploads" -type f 2>/dev/null | wc -l) file, $(du -sh "$APP_DIR/data/uploads" 2>/dev/null | awk '{print $1}')"
  fi

  echo ""
  echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${YELLOW}║${NC}  PTopup — RESTORE                                          ${YELLOW}║${NC}"
  echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  if [[ $NO_DB -eq 0 ]]; then
    echo -e "  Database         : ${BLUE}$DB_NAME${NC}"
    echo -e "  Tabel current    : ${BLUE}$CURRENT_TABLES tabel${NC}"
    echo -e "  User current     : ${BLUE}$CURRENT_USERS user${NC}"
    echo -e "  Source SQL       : ${BLUE}$BACKUP_SOURCE${NC}"
  else
    echo -e "  Database         : ${YELLOW}skip (--no-db)${NC}"
  fi
  if [[ -n "$UPLOADS_SOURCE" ]]; then
    echo -e "  Uploads current  : ${BLUE}$CURRENT_UPLOADS${NC}"
    echo -e "  Source uploads   : ${BLUE}$UPLOADS_SOURCE${NC}"
  fi
  echo -e "  Auto-backup ke   : ${BLUE}$BACKUP_DIR/${NC}"
  echo ""
  echo -e "${RED}⚠ DATA SAAT INI AKAN DI-OVERWRITE!${NC}"
  echo -e "${YELLOW}  (tapi auto-backup dulu, jadi masih bisa di-rollback)${NC}"
  echo ""
  echo -ne "${YELLOW}Lanjut? (ketik 'yes' untuk konfirmasi): ${NC}"
  read -r CONFIRM
  [[ "$CONFIRM" != "yes" ]] && { echo "Dibatalkan."; exit 0; }
else
  step "2/7 — Skip konfirmasi (--yes)"
fi

# ============================================================
# STEP 3 — Auto-backup DB current + uploads (safety net)
# ============================================================
step "3/7 — Backup current state (safety net)"

mkdir -p "$BACKUP_DIR"
PRE_BACKUP=""
PRE_UPLOADS=""

if [[ $NO_DB -eq 0 ]]; then
  PRE_BACKUP="$BACKUP_DIR/pre-restore-$(date +%Y%m%d-%H%M%S).sql"
  log "Dump DB current ke $PRE_BACKUP..."
  mysqldump "${MYSQLDUMP_AUTH[@]}" \
      --single-transaction \
      --quick \
      --routines \
      --triggers \
      "$DB_NAME" > "$PRE_BACKUP" || err "mysqldump gagal. Cek MySQL access."
  ok "DB backup: $PRE_BACKUP ($(du -h "$PRE_BACKUP" | awk '{print $1}'))"
fi

if [[ -n "$UPLOADS_SOURCE" && -d "$APP_DIR/data/uploads" ]]; then
  PRE_UPLOADS="$BACKUP_DIR/pre-restore-uploads-$(date +%Y%m%d-%H%M%S).tar.gz"
  log "Backup uploads current ke $PRE_UPLOADS..."
  tar -czf "$PRE_UPLOADS" -C "$APP_DIR" data/uploads 2>/dev/null && \
    ok "Uploads backup: $PRE_UPLOADS ($(du -h "$PRE_UPLOADS" | awk '{print $1}'))" || \
    warn "Backup uploads gagal (non-fatal). Lanjut anyway."
fi

echo ""
echo -e "  ${YELLOW}Rollback command:${NC}"
if [[ -n "$PRE_BACKUP" && -n "$PRE_UPLOADS" ]]; then
  echo -e "  sudo bash $0 $PRE_BACKUP --uploads=$PRE_UPLOADS --yes"
elif [[ -n "$PRE_BACKUP" ]]; then
  echo -e "  sudo bash $0 $PRE_BACKUP --yes"
elif [[ -n "$PRE_UPLOADS" ]]; then
  echo -e "  sudo bash $0 --uploads=$PRE_UPLOADS --no-db dummy.sql --yes"
fi

# ============================================================
# STEP 4 — Drop semua tabel & restore database
# ============================================================
NEW_TABLES="-"
NEW_USERS="-"
if [[ $NO_DB -eq 0 ]]; then
  step "4/7 — Restore database"

  # Stop app dulu biar gak ada query connection masuk pas restore
  if [[ $NO_RESTART -eq 0 ]]; then
    log "Stop PM2 ptopup sementara..."
    sudo -u "$APP_USER" pm2 stop ptopup >/dev/null 2>&1 || true
  fi

  log "Drop & recreate database $DB_NAME..."
  DROP_SQL="DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql "${MYSQL_AUTH[@]}" -e "$DROP_SQL" || err "Gagal drop/create database."
  ok "Database fresh"

  log "Import SQL (bisa lama tergantung size)..."
  # Disable FK & unique checks selama import biar gak fail karena urutan tabel
  # (mysqldump kadang gak include SET FOREIGN_KEY_CHECKS=0 di header)
  {
    echo "SET FOREIGN_KEY_CHECKS=0;"
    echo "SET UNIQUE_CHECKS=0;"
    echo "SET AUTOCOMMIT=0;"
    cat "$SQL_FILE"
    echo "SET FOREIGN_KEY_CHECKS=1;"
    echo "SET UNIQUE_CHECKS=1;"
    echo "COMMIT;"
  } | mysql "${MYSQL_AUTH[@]}" "$DB_NAME" || err "Import SQL gagal. Cek format file."
  ok "SQL imported"

  # Verifikasi
  NEW_TABLES=$(mysql "${MYSQL_AUTH[@]}" -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME';" 2>/dev/null || echo "?")
  NEW_USERS=$(mysql "${MYSQL_AUTH[@]}" -N -e "SELECT COUNT(*) FROM $DB_NAME.User;" 2>/dev/null || echo "0")
  ok "Hasil: $NEW_TABLES tabel, $NEW_USERS user"
else
  step "4/7 — Skip restore database (--no-db)"
fi

# ============================================================
# STEP 5 — Restore folder uploads (kalau --uploads diberikan)
# ============================================================
NEW_UPLOADS="-"
if [[ -n "$UPLOADS_SOURCE" ]]; then
  step "5/7 — Restore data/uploads/"

  # Stop app dulu (kalau belum di-stop di step 4)
  if [[ $NO_DB -eq 1 && $NO_RESTART -eq 0 ]]; then
    log "Stop PM2 ptopup sementara..."
    sudo -u "$APP_USER" pm2 stop ptopup >/dev/null 2>&1 || true
  fi

  # Pastikan APP_DIR ada
  [[ ! -d "$APP_DIR" ]] && err "App dir gak ada: $APP_DIR. Deploy dulu."

  # Hapus folder uploads existing (sudah di-backup di step 3)
  if [[ -d "$APP_DIR/data/uploads" ]]; then
    log "Hapus data/uploads/ lama..."
    rm -rf "$APP_DIR/data/uploads"
  fi

  # Pastikan parent dir ada
  mkdir -p "$APP_DIR/data"

  # Extract bundle
  log "Extract $UPLOADS_SOURCE → $APP_DIR/..."
  tar -xzf "$UPLOADS_SOURCE" -C "$APP_DIR" || err "Extract uploads gagal. Cek format file."

  # Pastikan struktur folder lengkap (kalau bundle gak punya semua sub-folder)
  mkdir -p "$APP_DIR/data/uploads"/{avatars,logos,brands,tickets}

  # Re-set ownership ke user app (extract default ke root)
  if id "$APP_USER" >/dev/null 2>&1; then
    chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"
    chmod -R 750 "$APP_DIR/data"
  fi

  NEW_UPLOADS=$(find "$APP_DIR/data/uploads" -type f 2>/dev/null | wc -l)
  ok "Uploads restored: $NEW_UPLOADS file"
fi

# ============================================================
# STEP 6 — Sync schema (kalau ada kolom baru di code)
# ============================================================
if [[ $NO_DB -eq 0 ]]; then
  step "6/7 — Sync schema dengan Prisma"

  if [[ -d "$APP_DIR" && -f "$APP_DIR/prisma/schema.prisma" ]]; then
    log "Run prisma db push (sync kolom baru kalau ada)..."
    sudo -u "$APP_USER" bash -lc "cd $APP_DIR && npx prisma db push --skip-generate --accept-data-loss=false" 2>&1 | tail -5 || {
      warn "Prisma db push gagal/ada warning. Cek manual:"
      warn "  cd $APP_DIR && sudo -u $APP_USER npx prisma db push"
    }
    ok "Schema synced"
  else
    warn "App dir gak ditemukan, skip prisma sync"
  fi
else
  step "6/7 — Skip prisma sync (--no-db)"
fi

# ============================================================
# STEP 7 — Restart app
# ============================================================
step "7/7 — Restart app"

if [[ $NO_RESTART -eq 1 ]]; then
  warn "Skip restart (--no-restart). Restart manual:"
  warn "  sudo -u $APP_USER pm2 restart ptopup"
else
  sudo -u "$APP_USER" pm2 restart ptopup >/dev/null 2>&1 || \
  sudo -u "$APP_USER" bash -lc "cd $APP_DIR && PORT=3000 pm2 start npm --name ptopup -- run start" >/dev/null 2>&1 || \
    warn "Gagal restart. Run manual: sudo -u $APP_USER pm2 restart ptopup"
  ok "App restarted"
fi

# ============================================================
# DONE
# ============================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ RESTORE SELESAI${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
if [[ $NO_DB -eq 0 ]]; then
  echo -e "  Database     : ${BLUE}$DB_NAME ($NEW_TABLES tabel, $NEW_USERS user)${NC}"
  echo -e "  Source SQL   : ${BLUE}$BACKUP_SOURCE${NC}"
fi
if [[ -n "$UPLOADS_SOURCE" ]]; then
  echo -e "  Uploads      : ${BLUE}$NEW_UPLOADS file${NC}"
  echo -e "  Source bundle: ${BLUE}$UPLOADS_SOURCE${NC}"
fi
[[ -n "$PRE_BACKUP" ]] && echo -e "  Pre-DB       : ${BLUE}$PRE_BACKUP${NC}"
[[ -n "$PRE_UPLOADS" ]] && echo -e "  Pre-uploads  : ${BLUE}$PRE_UPLOADS${NC}"
echo ""
echo -e "${YELLOW}KALAU ADA MASALAH (rollback ke kondisi sebelum restore):${NC}"
if [[ -n "$PRE_BACKUP" && -n "$PRE_UPLOADS" ]]; then
  echo -e "  ${BLUE}sudo bash $0 $PRE_BACKUP --uploads=$PRE_UPLOADS --yes${NC}"
elif [[ -n "$PRE_BACKUP" ]]; then
  echo -e "  ${BLUE}sudo bash $0 $PRE_BACKUP --yes${NC}"
elif [[ -n "$PRE_UPLOADS" ]]; then
  echo -e "  ${BLUE}sudo bash $0 --uploads=$PRE_UPLOADS --no-db dummy.sql --yes${NC}"
fi
echo ""
echo -e "${YELLOW}VERIFIKASI:${NC}"
if [[ $NO_DB -eq 0 ]]; then
  echo -e "  ${BLUE}sudo mysql ${DB_NAME} -e \"SHOW TABLES; SELECT COUNT(*) AS users FROM User;\"${NC}"
fi
if [[ -n "$UPLOADS_SOURCE" ]]; then
  echo -e "  ${BLUE}ls -lh $APP_DIR/data/uploads/{avatars,logos,brands,tickets} | head${NC}"
fi
echo -e "  Buka app : ${BLUE}https://yourdomain.com${NC}"
echo ""
