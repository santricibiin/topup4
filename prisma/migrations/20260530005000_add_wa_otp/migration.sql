-- =================================================================
-- Migration: add_wa_otp
-- Tambah:
--   - kolom users.phone_verified
--   - kolom users.notif_wa_tx (default true)
--   - tabel otp_codes (verifikasi WhatsApp untuk register/reset)
-- =================================================================

-- AlterTable: users
ALTER TABLE `users`
  ADD COLUMN `phone_verified` DATETIME(3) NULL,
  ADD COLUMN `notif_wa_tx` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: otp_codes
CREATE TABLE `otp_codes` (
  `id` VARCHAR(191) NOT NULL,
  `purpose` ENUM('REGISTER', 'RESET_PASSWORD', 'PHONE_VERIFY') NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `code_hash` VARCHAR(120) NOT NULL,
  `status` ENUM('ACTIVE', 'USED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `attempt` INTEGER NOT NULL DEFAULT 0,
  `ip_address` VARCHAR(64) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `otp_codes_phone_purpose_status_idx` (`phone`, `purpose`, `status`),
  INDEX `otp_codes_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
