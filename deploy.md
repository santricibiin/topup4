# Panduan Deploy PTopup

Dokumen ini berisi langkah-langkah operasional untuk install, update, backup, dan restore aplikasi PTopup di VPS Ubuntu.

## Daftar Isi

1. Deploy Pertama Kali
2. Cleanup dan Pasang Ulang
3. Update Code
4. Pull Saja (Tanpa Build)
5. Cek Database MySQL
6. Backup Database dan Uploads
7. Restore Database dan Uploads
8. Backup dan Restore via Admin Web UI
9. Perintah Operasional Harian
10. Setup Alias Shortcut
11. Troubleshooting Umum
12. Checklist Keamanan Pasca Deploy
13. Deploy untuk Repo Private
14. Kumpulkan Info untuk Bantuan
15. WhatsApp Integration (OTP & Notifikasi)

---

## 1. Deploy Pertama Kali

Untuk install fresh di VPS Ubuntu kosong (22.04 atau 24.04).

- Login SSH ke VPS:
  ```
  ssh root@IP-VPS
  ```
- Jalankan deploy script:
  ```
  curl -fsSL "https://raw.githubusercontent.com/santricibiin/topup2/main/scripts/vps-deploy.sh?$(date +%s)" | sudo bash -s -- \
      --domain=butuhtopup.net \
      --email=admin@butuhtopup.net \
      --repo=https://github.com/santricibiin/topup2.git
  ```
- Yang harus diganti:
  - `butuhtopup.net` ke domain Anda
  - `admin@butuhtopup.net` ke email untuk SSL Let's Encrypt
  - `santricibiin/topup2` ke repository GitHub Anda
- Tunggu 5–10 menit hingga selesai. Output akhir berisi info admin dan password DB.

Format output ringkasan deploy:
```
DEPLOY SELESAI

  URL          : https://butuhtopup.net
  Admin Login  : admin / Admin#12345
  App Path     : /opt/ptopup

  DB Name      : ptopup
  DB User      : ptopup
  DB Password  : <hash random>
  Password File: /root/.ptopup-db-password

  Media Dir    : /opt/ptopup/data/uploads/{avatars,logos,brands,tickets}
```

Catat password DB atau gunakan `sudo cat /root/.ptopup-db-password` untuk membaca ulang.

---

## 2. Cleanup dan Pasang Ulang

Untuk menghapus instalasi lama dan deploy fresh.

- SSH ke VPS:
  ```
  ssh root@IP-VPS
  ```
- Cleanup penuh dengan auto-backup folder uploads:
  ```
  curl -fsSL "https://raw.githubusercontent.com/santricibiin/topup2/main/scripts/cleanup-vps.sh?$(date +%s)" | sudo bash -s -- \
      --hard --backup-uploads --domain=jagopay.biz.id
  ```
- Setelah cleanup selesai, jalankan deploy ulang seperti di Section 1.

Yang dihapus oleh `--hard`:
- Folder `/opt/ptopup` (termasuk `data/uploads/` jika tidak pakai `--backup-uploads`)
- Database `ptopup` dan user MySQL-nya
- PM2 process
- Nginx config
- User Linux `ptopup`
- SSL certificate

Yang tidak dihapus: Node.js, MySQL server, Nginx binary (untuk redeploy cepat).

Flag tambahan:
- `--backup-uploads` — auto tar.gz `data/uploads/` ke `/root/backups/` sebelum hapus
- `--remove-user` — hanya hapus user Linux
- `--remove-ssl --domain=DOMAIN` — hanya revoke SSL

---

## 3. Update Code

Untuk menarik code terbaru dari GitHub, build, dan restart.

- Cara A (script update resmi):
  ```
  sudo bash /opt/ptopup/scripts/vps-update.sh
  ```
- Cara B (one-liner manual):
  ```
  cd /opt/ptopup && \
    sudo -u ptopup git fetch origin && \
    sudo -u ptopup git reset --hard origin/main && \
    sudo -u ptopup bash -c "cd /opt/ptopup && npm install && npx prisma db push && NODE_OPTIONS='--max-old-space-size=1536' npm run build" && \
    sudo -u ptopup pm2 restart ptopup
  ```

Yang dilakukan script update:
- Pull code terbaru (force-reset ke `origin/main`)
- `npm install` jika ada dependency baru
- `prisma db push` untuk sync schema
- Pastikan folder `data/uploads/{avatars,logos,brands,tickets}` ada
- Auto-migrasi `public/uploads/` legacy ke `data/uploads/` jika ada
- Build production
- Restart PM2

Durasi: 5–10 menit tergantung banyaknya perubahan.

---

## 4. Pull Saja (Tanpa Build)

Untuk update file `.sh`, `.md`, atau dokumentasi yang tidak butuh rebuild.

- Jalankan:
  ```
  cd /opt/ptopup && \
    sudo -u ptopup git fetch origin && \
    sudo -u ptopup git reset --hard origin/main
  ```

Jangan pakai cara ini jika ada perubahan di `src/` atau `prisma/`. Kalau ragu, pakai update penuh di Section 3.

---

## 5. Cek Database MySQL

Beberapa cara akses MySQL.

- Cara cepat (auth socket sebagai root):
  ```
  sudo mysql ptopup
  ```
- Pakai user `ptopup` dengan password otomatis:
  ```
  DB_PASS=$(sudo cat /root/.ptopup-db-password)
  mysql -u ptopup -p"$DB_PASS" ptopup
  ```
- Lihat password tanpa login:
  ```
  sudo cat /root/.ptopup-db-password
  ```

Query umum di MySQL prompt:

```sql
-- Daftar tabel
SHOW TABLES;

-- Akun admin
SELECT id, email, username, role FROM User WHERE role='ADMIN';

-- Transaksi terakhir
SELECT id, status, amount, createdAt FROM Transaction
ORDER BY createdAt DESC LIMIT 10;

-- Saldo per user
SELECT u.username, b.amount FROM User u JOIN Balance b ON b.userId = u.id;

-- Keluar
EXIT;
```

One-liner tanpa masuk prompt:

```
sudo mysql -e "USE ptopup; SHOW TABLES;"
sudo mysql -e "SELECT COUNT(*) AS total FROM ptopup.User;"
sudo mysql -e "SELECT email, username FROM ptopup.User WHERE role='ADMIN';"
```

Tabel utama:

| Tabel | Isi |
|---|---|
| `User` | Akun user (admin, customer, reseller) |
| `Session` | Session login (iron-session) |
| `Balance` | Saldo per user |
| `BalanceMutation` | Riwayat saldo masuk/keluar |
| `Product` | Katalog Digiflazz |
| `Transaction` | Transaksi topup |
| `PaymentGatewayLog` | Log webhook Duitku/DANA |
| `Deposit` | Top-up saldo |
| `CategorySetting` | Setting kategori |
| `Setting` | Setting global site |
| `Ticket` | Tiket bantuan user |
| `TicketMessage` | Pesan thread tiket |
| `BrandAsset` | Logo brand custom |

---

## 6. Backup Database dan Uploads

PTopup menyimpan tiga jenis state: database MySQL, folder media (`data/uploads/`), dan kredensial WhatsApp (`data/wa-session/`). Backup ketiganya untuk recovery lengkap (kalau wa-session hilang, harus pair ulang QR/pairing code di `/admin/wa`).

- Backup DB saja (ke `/var/backups/ptopup/`, rotasi 7 hari):
  ```
  sudo bash /opt/ptopup/scripts/backup-db.sh
  ```
- Backup DB + folder data (uploads + wa-session):
  ```
  sudo bash /opt/ptopup/scripts/backup-db.sh --include-uploads
  ```
- Custom retention dan output:
  ```
  sudo bash /opt/ptopup/scripts/backup-db.sh --keep=14 --include-uploads
  sudo bash /opt/ptopup/scripts/backup-db.sh --output=/root/manual.sql.gz
  ```
- Backup manual cepat:
  ```
  sudo mysqldump ptopup | gzip > /root/manual-$(date +%Y%m%d-%H%M%S).sql.gz
  sudo tar -czf /root/data-$(date +%Y%m%d-%H%M%S).tar.gz -C /opt/ptopup data/uploads data/wa-session
  ```

Output file:
- `ptopup-YYYYMMDD-HHMMSS.sql.gz` — dump database
- `ptopup-uploads-YYYYMMDD-HHMMSS.tar.gz` — bundle uploads + wa-session

Setup backup harian otomatis (jam 3 pagi):

- Buka crontab:
  ```
  sudo crontab -e
  ```
- Tambahkan baris:
  ```
  0 3 * * * /opt/ptopup/scripts/backup-db.sh --include-uploads >> /var/log/ptopup-backup.log 2>&1
  ```

---

## 7. Restore Database dan Uploads

Script `db-restore.sh` mendukung restore DB, restore uploads, atau keduanya. Auto-backup state sekarang sebelum overwrite.

- Restore DB saja (paling umum):
  ```
  sudo bash /opt/ptopup/scripts/db-restore.sh /root/backup.sql.gz
  ```
- Restore DB + uploads sekaligus:
  ```
  sudo bash /opt/ptopup/scripts/db-restore.sh \
      /root/ptopup-20260530.sql.gz \
      --uploads=/root/ptopup-uploads-20260530.tar.gz
  ```
- Restore uploads saja (DB tidak diutak-atik):
  ```
  sudo bash /opt/ptopup/scripts/db-restore.sh \
      --uploads=/root/uploads.tar.gz \
      --no-db dummy.sql
  ```
- Restore langsung dari URL:
  ```
  sudo bash /opt/ptopup/scripts/db-restore.sh \
      https://example.com/backup.sql.gz \
      --uploads=https://example.com/uploads.tar.gz
  ```

Flag tambahan:
- `--yes` — skip konfirmasi (untuk automation/cron)
- `--no-restart` — tidak restart PM2 setelah selesai
- `--no-db` — skip restore DB (wajib bareng `--uploads`)

Pindah dari VPS lama ke VPS baru:

- Di VPS lama, backup DB dan uploads:
  ```
  sudo mysqldump ptopup | gzip > /root/backup.sql.gz
  sudo tar -czf /root/uploads.tar.gz -C /opt/ptopup data/uploads
  ```
- Transfer ke VPS baru via SCP (jalankan dari laptop):
  ```
  scp root@IP-VPS-LAMA:/root/backup.sql.gz ./
  scp root@IP-VPS-LAMA:/root/uploads.tar.gz ./
  scp ./backup.sql.gz ./uploads.tar.gz root@IP-VPS-BARU:/root/
  ```
- Di VPS baru (sudah deploy fresh), restore:
  ```
  ssh root@IP-VPS-BARU
  sudo bash /opt/ptopup/scripts/db-restore.sh /root/backup.sql.gz --uploads=/root/uploads.tar.gz
  ```
- Ketik `yes` saat konfirmasi.

Yang dilakukan script (7 step):
1. Validasi sumber (file lokal atau URL)
2. Konfirmasi state DB dan uploads sekarang vs target
3. Auto-backup state sekarang ke `/root/backups/pre-restore-*.sql` dan `pre-restore-uploads-*.tar.gz`
4. Drop database lalu import SQL baru (kecuali `--no-db`)
5. Hapus `data/uploads/` lama, extract bundle baru, set ownership ke `ptopup` (kecuali tanpa `--uploads`)
6. Run `prisma db push` untuk sync schema
7. Restart PM2

Rollback jika hasil restore salah. Script menampilkan command rollback otomatis di output. Format:

```
sudo bash db-restore.sh /root/backups/pre-restore-XXX.sql --uploads=/root/backups/pre-restore-uploads-XXX.tar.gz --yes
```

Verifikasi setelah restore:

```
sudo mysql ptopup -e "SHOW TABLES; SELECT COUNT(*) AS total_user FROM User;"
ls -lh /opt/ptopup/data/uploads/{avatars,logos,brands,tickets}
sudo -u ptopup pm2 logs ptopup --lines 50
```

Buka `https://domain-anda.com` dan login dengan kredensial dari DB backup (bukan default `admin/Admin#12345`).

---

## 8. Backup dan Restore via Admin Web UI

Halaman `/admin/backup` punya fitur penuh: bikin backup, upload file backup dari laptop, restore dengan satu klik, atau download untuk migrasi ke VPS lain.

### 8.1 Yang Bisa Di-backup dari UI

- Database MySQL → file `.sql.gz`
- Folder uploads (`data/uploads/`: avatar, logo, brand, attachment ticket) → file `.tar.gz`
- Keduanya sekaligus dengan tombol "Backup Keduanya"

Auto-backup yang berjalan tiap interval di pengaturan hanya untuk database. Bundle uploads dibikin manual lewat tombol.

### 8.2 Lokasi File di VPS

Semua file dari Admin UI tersimpan di:
```
/opt/ptopup/backups/
```

Folder ini sama dengan yang dipakai script CLI, jadi `db-restore.sh` bisa langsung pakai file dari UI dan sebaliknya. Cek isinya:
```
sudo ls -lh /opt/ptopup/backups/
```

Format file:
- `ptopup-YYYYMMDD-HHmmss.sql.gz` — auto/manual DB dump
- `ptopup-uploads-YYYYMMDD-HHmmss.tar.gz` — bundle data/ (uploads + wa-session)
- `uploaded-YYYYMMDD-HHmmss-<original>` — file yang di-upload via UI
- `pre-restore-uploads-YYYYMMDD-HHmmss.tar.gz` — auto-snapshot sebelum restore uploads

### 8.3 Upload File Backup Lewat UI

Berguna kalau Anda punya backup di laptop atau dari VPS lain.

- Login ke `/admin/backup`
- Klik tombol "Upload Backup"
- Pilih file `.sql`, `.sql.gz`, `.tar.gz`, atau `.tgz`
- Maksimum 500 MB per file (override via env `BACKUP_UPLOAD_MAX_MB` lalu restart PM2)

File akan tersimpan dengan prefix `uploaded-<timestamp>-<original-name>` di folder `backups/`. Setelah upload, file langsung muncul di "Daftar Backup" siap di-restore.

### 8.4 Restore Lewat UI

- Klik tombol "Restore" di baris file yang diinginkan
- Konfirmasi dialog (UI memberi peringatan jelas: "DB akan ditimpa total" atau "folder uploads akan diganti total")
- Untuk file uploads, sistem otomatis bikin `pre-restore-uploads-*.tar.gz` di folder yang sama sebelum mengganti, sebagai jaring pengaman

UI deteksi tipe file otomatis dari ekstensi:
- `.sql` / `.sql.gz` → restore database (drop tables + import)
- `.tar.gz` / `.tgz` → restore folder uploads (extract ke `data/uploads/`)

### 8.5 Restore File UI Lewat CLI di VPS

Kadang Anda butuh restore via SSH (misalnya UI tidak bisa diakses, atau mau pakai flag tambahan). File dari Admin UI dan dari CLI saling kompatibel.

Daftar file yang bisa dipakai:
```
sudo ls -lh /opt/ptopup/backups/
```

Restore DB dari file UI:
```
sudo bash /opt/ptopup/scripts/db-restore.sh /opt/ptopup/backups/ptopup-20260529-030000.sql.gz
```

Restore uploads dari file UI:
```
sudo bash /opt/ptopup/scripts/db-restore.sh \
    --uploads=/opt/ptopup/backups/ptopup-uploads-20260529-030500.tar.gz \
    --no-db dummy.sql
```

Restore keduanya:
```
sudo bash /opt/ptopup/scripts/db-restore.sh \
    /opt/ptopup/backups/ptopup-20260529-030000.sql.gz \
    --uploads=/opt/ptopup/backups/ptopup-uploads-20260529-030500.tar.gz
```

Kalau file dari upload UI dengan prefix `uploaded-...`:
```
sudo bash /opt/ptopup/scripts/db-restore.sh /opt/ptopup/backups/uploaded-20260529-031000-mybackup.sql.gz
```

### 8.6 Download File UI ke Lokal atau VPS Lain

Cara 1 (paling mudah, lewat UI): klik tombol "Download" di baris file. Browser akan menyimpan file ke laptop.

Cara 2 (lewat SCP, untuk file besar atau migrasi VPS):
```
# Dari laptop, ambil ke lokal
scp root@IP-VPS:/opt/ptopup/backups/ptopup-20260529-030000.sql.gz ./
scp root@IP-VPS:/opt/ptopup/backups/ptopup-uploads-20260529-030500.tar.gz ./

# Dari laptop, langsung kirim ke VPS lain
scp root@IP-VPS-A:/opt/ptopup/backups/ptopup-uploads-20260529.tar.gz \
    root@IP-VPS-B:/root/
```

Cara 3 (rsync, untuk pull periodik ke server backup):
```
rsync -avz --progress \
    root@IP-VPS:/opt/ptopup/backups/ \
    /backup-store/ptopup/
```

### 8.7 Hapus File dari UI

Klik tombol "Hapus" di baris file. Konfirmasi diperlukan. File langsung dihapus permanen dari `/opt/ptopup/backups/`.

Untuk cleanup file lama via CLI (otomatis berdasar usia):
```
# Hapus file backup lebih lama dari 30 hari
sudo find /opt/ptopup/backups/ -type f \( -name "*.sql.gz" -o -name "*.tar.gz" \) -mtime +30 -delete
```

### 8.8 Tips dan Batasan

- File yang muncul di UI hanya yang ada di `/opt/ptopup/backups/`. File di `/var/backups/ptopup/` (dari `backup-db.sh`) tidak terlihat. Untuk muncul di UI, copy/move ke `/opt/ptopup/backups/`:
  ```
  sudo cp /var/backups/ptopup/ptopup-20260529-030000.sql.gz /opt/ptopup/backups/
  sudo chown ptopup:ptopup /opt/ptopup/backups/ptopup-20260529-030000.sql.gz
  ```
- Setelah restore via UI, halaman aplikasi mungkin perlu di-reload (Ctrl+Shift+R) supaya gambar avatar/logo/brand pakai versi baru.
- Operasi backup/restore butuh `mysqldump`, `mysql`, dan `tar` di PATH server. Sudah tersedia default di Ubuntu 22/24 hasil `vps-deploy.sh`.
- Maksimum durasi restore via UI 5 menit (dibatasi `maxDuration = 300`). Untuk DB sangat besar, pakai CLI.

---

## 9. Perintah Operasional Harian

- Cek status PM2:
  ```
  sudo -u ptopup pm2 status
  ```
- Lihat log aplikasi:
  ```
  sudo -u ptopup pm2 logs ptopup --lines 100
  ```
- Restart aplikasi:
  ```
  sudo -u ptopup pm2 restart ptopup
  ```
- Stop aplikasi:
  ```
  sudo -u ptopup pm2 stop ptopup
  ```
- Edit file `.env` (kredensial Digiflazz, Duitku, dll):
  ```
  sudo nano /opt/ptopup/.env
  ```
  Save: `Ctrl+O`, `Enter`, `Ctrl+X`. Lalu restart PM2.
- Cek disk dan RAM:
  ```
  df -h
  free -h
  ```
- Cek size folder uploads:
  ```
  sudo du -sh /opt/ptopup/data/uploads/*
  ```

---

## 10. Setup Alias Shortcut

Setup sekali di VPS untuk shortcut perintah harian.

- Tambahkan ke `~/.bashrc`:
  ```
  cat >> ~/.bashrc <<'EOF'

  # PTopup Shortcuts
  alias ptpull="cd /opt/ptopup && sudo -u ptopup git fetch origin && sudo -u ptopup git reset --hard origin/main"
  alias ptupdate="sudo bash /opt/ptopup/scripts/vps-update.sh"
  alias ptrestart="sudo -u ptopup pm2 restart ptopup"
  alias ptstatus="sudo -u ptopup pm2 status"
  alias ptlogs="sudo -u ptopup pm2 logs ptopup --lines 100"
  alias ptdb='DB_PASS=$(sudo cat /root/.ptopup-db-password); mysql -u ptopup -p"$DB_PASS" ptopup'
  alias ptenv="sudo nano /opt/ptopup/.env"
  alias ptbackup="sudo bash /opt/ptopup/scripts/backup-db.sh --include-uploads"
  alias ptrestore="sudo bash /opt/ptopup/scripts/db-restore.sh"
  EOF
  source ~/.bashrc
  ```

Daftar alias:

| Alias | Fungsi |
|---|---|
| `ptpull` | Sync code dari GitHub (tanpa build) |
| `ptupdate` | Full update (pull + install + build + restart) |
| `ptrestart` | Restart PM2 |
| `ptstatus` | Status PM2 |
| `ptlogs` | Lihat 100 baris log terakhir |
| `ptdb` | Login MySQL ke DB ptopup |
| `ptenv` | Edit `.env` |
| `ptbackup` | Backup DB + uploads ke `/var/backups/ptopup/` |
| `ptrestore <file>` | Restore DB dari file backup |

Contoh `ptrestore` dengan uploads:

```
ptrestore /root/backup.sql.gz --uploads=/root/uploads.tar.gz
```

---

## 11. Troubleshooting Umum

App tidak bisa diakses (HTTP 502):
```
sudo -u ptopup pm2 logs ptopup --lines 50
sudo -u ptopup pm2 restart ptopup
```

Error "unstaged changes" saat `git pull`:
```
cd /opt/ptopup
sudo -u ptopup git fetch origin
sudo -u ptopup git reset --hard origin/main
```

Port 3000 dipakai proses lain:
```
sudo fuser -k 3000/tcp
sudo -u ptopup pm2 restart ptopup
```

Lupa password MySQL:
```
sudo cat /root/.ptopup-db-password
```

MySQL tidak jalan:
```
sudo systemctl status mysql
sudo systemctl start mysql
```

Avatar/logo tidak muncul atau upload gagal:
```
sudo chown -R ptopup:ptopup /opt/ptopup/data/uploads
sudo chmod -R 750 /opt/ptopup/data/uploads
```

SSL gagal saat deploy (DNS belum propagasi):
```
sudo certbot --nginx -d butuhtopup.net
```
Tunggu 5–30 menit DNS propagasi, lalu jalankan ulang.

Folder `data/uploads/` hilang setelah update:
```
sudo mkdir -p /opt/ptopup/data/uploads/{avatars,logos,brands,tickets}
sudo chown -R ptopup:ptopup /opt/ptopup/data
sudo chmod -R 750 /opt/ptopup/data
```

Restore DB gagal atau DB rusak (rollback):
```
ls -lh /root/backups/
sudo bash /opt/ptopup/scripts/db-restore.sh /root/backups/pre-restore-XXX.sql --yes
```

---

## 12. Checklist Keamanan Pasca Deploy

Setelah deploy selesai, wajib lakukan:

- Login ke `https://domain-anda.com` dengan `admin / Admin#12345`
- Ganti password admin di halaman `/profile`
- Edit `.env`, isi `DIGIFLAZZ_USERNAME` dan `DIGIFLAZZ_API_KEY`
- Set `DIGIFLAZZ_MODE="production"` saat siap go-live
- Generate webhook DANA secret di `/admin/deposits`
- Sync produk dari Digiflazz di `/admin/provider`
- Setup metode pembayaran QRIS di `/admin/deposits`
- Setup backup harian otomatis (Section 6)
- Cek SSL aktif (`https://`) dan auto-renew Certbot:
  ```
  sudo certbot renew --dry-run
  ```

---

## 13. Deploy untuk Repo Private

Jika repo GitHub berstatus private, gunakan Personal Access Token (PAT).

Cara A — Token (untuk buyer awam):

- Generate Fine-grained PAT di https://github.com/settings/tokens?type=beta
  - Token name: `buyer-domain-com`
  - Expiration: 1 tahun
  - Repository access: Only select repositories → pilih repo
  - Permissions: Contents = Read-only
- Klik Generate token, copy nilainya (cuma muncul sekali).
- Format token: `github_pat_11AAA...XYZ`
- Berikan command ini ke buyer:
  ```
  curl -fsSL -H "Authorization: token github_pat_11AAA_TOKEN" \
    "https://raw.githubusercontent.com/santricibiin/topup2/main/scripts/vps-deploy.sh?$(date +%s)" | \
    sudo bash -s -- \
      --domain=DOMAIN-BUYER.com \
      --email=email-buyer@gmail.com \
      --repo=https://github.com/santricibiin/topup2.git \
      --token=github_pat_11AAA_TOKEN
  ```
- Token disimpan di `/home/ptopup/.git-credentials` (mode 600). Update selanjutnya tidak butuh input token.
- Untuk revoke akses, hapus token di GitHub Settings → Tokens.

Cara B — Collaborator (untuk buyer techy):

- Tambah buyer sebagai collaborator di repo (role: Read).
- Buyer accept invitation, generate PAT mereka sendiri.
- Buyer pakai command yang sama dengan token mereka.
- Untuk revoke, remove dari collaborators.

Tips:
- Generate token unik per buyer dengan nama jelas.
- Set expiration 1 tahun untuk paksa renewal.
- Simpan list token-buyer di spreadsheet pribadi.
- Token bocor → revoke di GitHub, generate baru.
- Update credential setelah token baru:
  ```
  sudo bash -c 'echo "https://oauth2:TOKEN_BARU@github.com" > /home/ptopup/.git-credentials'
  sudo chown ptopup:ptopup /home/ptopup/.git-credentials
  sudo chmod 600 /home/ptopup/.git-credentials
  ```

---

## 14. Kumpulkan Info untuk Bantuan

Saat butuh bantuan support, paste output script ini:

```
echo "=== System ==="          && lsb_release -a 2>/dev/null
echo "=== Node ==="             && node -v && npm -v
echo "=== PM2 ==="              && sudo -u ptopup pm2 status
echo "=== App logs ==="         && sudo -u ptopup pm2 logs ptopup --lines 30 --nostream
echo "=== Nginx ==="            && sudo nginx -t
echo "=== Disk ==="              && df -h /
echo "=== RAM ==="               && free -h
echo "=== Uploads ==="           && sudo du -sh /opt/ptopup/data/uploads/* 2>/dev/null
echo "=== Env (no secrets) ===" && sudo grep -v "PASS\|KEY\|SECRET" /opt/ptopup/.env
```

Jangan paste isi `.env` mentah karena berisi kredensial.

---

## 15. WhatsApp Integration (OTP & Notifikasi)

PTopup punya integrasi WhatsApp via Baileys untuk:

- OTP saat user daftar (verifikasi nomor HP)
- OTP lupa password
- Notifikasi otomatis saat status transaksi berubah (PAID / SUCCESS / FAILED)

Sesi WA disimpan di `data/wa-session/` (Baileys multi-file auth state). File ini
**rahasia** — siapa pun yang dapat folder ini bisa pakai akun WA-mu. Folder ini
sudah ada di `.gitignore`.

### 15.1 Aktifkan dari Admin UI

1. Login sebagai admin → menu **WhatsApp** di sidebar.
2. Card **Mode & Master Switch**:
   - Centang **Aktifkan layanan WhatsApp**.
   - Pilih metode tautan:
     - **QR Code** — scan QR di HP utama (mirip WhatsApp Web).
     - **Pairing Code** — masukkan kode 8 digit di HP, tidak butuh kamera.
   - Kalau pakai pairing, isi nomor HP di field **Nomor HP default untuk pairing**.
   - Klik **Simpan**.
3. Card **Status Koneksi**:
   - Klik **Hubungkan**.
   - Tunggu QR / pairing code muncul (max 60 detik).
   - Scan QR atau masukkan pairing code di HP via **WhatsApp ➜ Perangkat tertaut ➜ Tautkan perangkat**.
   - Status berubah jadi **Terhubung** dengan badge hijau.
4. Card **Fitur** — pilih fitur yang aktif:
   - OTP saat daftar
   - OTP lupa password
   - Notifikasi transaksi
   Atur juga TTL OTP (60–900 detik), cooldown resend, dan max attempt.
5. Card **Template Pesan** — edit template OTP & notifikasi. Pakai placeholder
   `{{site}}`, `{{kode}}`, `{{ttl_menit}}`, `{{order_id}}`, `{{produk}}`,
   `{{tujuan}}`, `{{sn_line}}`, `{{pesan}}`. Klik chip placeholder untuk salin.
6. Card **Test Kirim** — verifikasi koneksi dengan kirim pesan ke nomor manapun.

### 15.2 Persistence Sesi

Folder `data/wa-session/` berisi:

- `creds.json` — kredensial akun (token, identityKey)
- `app-state-*.json`, `pre-key-*.json`, `sender-key-*.json`, `session-*.json`
  — Signal protocol state

Setelah PM2 restart / server reboot, koneksi auto-resume tanpa scan ulang
selama folder ini utuh dan akun belum di-logout dari HP.

### 15.3 Backup Sesi WA

Sesi WA **otomatis ikut** saat backup uploads:

```bash
# Manual via CLI
cd /opt/ptopup
bash scripts/backup-db.sh         # bikin db.sql.gz + uploads.tar.gz
```

Bundle `ptopup-uploads-*.tar.gz` berisi `data/uploads/` + `data/wa-session/`.
Restore bundle juga akan restore sesi WA (folder lama dibersihkan dulu, jadi
**tidak campur** file lama + baru).

Atau lewat Admin UI ➜ menu **Backup** ➜ tombol **Backup Uploads**.

### 15.4 Putuskan / Logout

- Tombol **Hentikan** — close socket tanpa logout. Sesi tetap tersimpan, bisa
  re-connect lagi.
- Tombol **Putuskan & Hapus Sesi** — full logout + hapus folder
  `data/wa-session/`. Akun WA juga keluar dari **Perangkat tertaut** di HP.
  Setelah ini wajib scan ulang.

### 15.5 Troubleshooting

**QR / pairing code expired sebelum sempat scan:**
- TTL default 60 detik. Klik **Hubungkan** lagi untuk dapat QR baru.

**Status balik ke `LOGGED_OUT` setelah beberapa jam:**
- User keluar dari **Perangkat tertaut** di HP, atau WA mendeteksi anomali
  (multi-login, IP change ekstrim).
- Klik **Hubungkan** lagi → scan ulang.

**Error `Cannot find module '@whiskeysockets/baileys'`:**
- Dependency belum terinstall. Run: `npm install` di server.

**Error spawn ENOENT (tar) saat backup:**
- Pastikan `tar` terinstall: `which tar` (di Linux/macOS biasanya sudah ada).
  Untuk Windows server, install Git Bash atau WSL.

**Notifikasi transaksi tidak terkirim:**
- Cek master switch ON di admin UI.
- Cek toggle **Notifikasi transaksi** ON di card **Fitur**.
- Cek user punya nomor HP di profil & toggle `notifWaTx` (default ON).
- Cek status WA = **Terhubung** (bukan ERROR / DISCONNECTED).

**OTP tidak sampai ke user:**
- Test kirim dari Card **Test Kirim** dulu untuk pastikan koneksi sehat.
- Cek nomor user format E.164 (62...). User input `08xx`/`+62xx` di-normalize
  otomatis di server.
- Cek nomor user terdaftar di WhatsApp (kalau bukan WA user, OTP tidak terkirim).

### 15.6 Keamanan

- **Jangan commit** folder `data/wa-session/` ke git. Sudah ada di `.gitignore`.
- File backup `*.tar.gz` yang berisi sesi WA harus dijaga sama ketatnya dengan
  file `.env`. Jangan share publik.
- Akun WA yang dipakai untuk OTP sebaiknya **akun terpisah** (bukan akun
  pribadi admin) — bisa pakai nomor virtual / SIM khusus.

---

## Referensi Lokasi File Penting

| Item | Path |
|---|---|
| Folder app | `/opt/ptopup` |
| Source code | `/opt/ptopup/src/` |
| Folder media | `/opt/ptopup/data/uploads/{avatars,logos,brands,tickets}` |
| Sesi WhatsApp | `/opt/ptopup/data/wa-session/` |
| Build artifact | `/opt/ptopup/.next/` |
| Konfigurasi env | `/opt/ptopup/.env` |
| Password DB | `/root/.ptopup-db-password` |
| Backup harian | `/var/backups/ptopup/` |
| Backup pre-restore | `/root/backups/` |
| Backup Admin UI | `/opt/ptopup/backups/` |
| Nginx config | `/etc/nginx/sites-available/ptopup` |
| SSL cert | `/etc/letsencrypt/live/<domain>/` |
| PM2 logs | `~/.pm2/logs/ptopup-*.log` (user `ptopup`) |
| User Linux | `ptopup` |
| Database | `ptopup` (MySQL localhost) |
| App URL | `https://<domain>` (port 3000 internal) |
