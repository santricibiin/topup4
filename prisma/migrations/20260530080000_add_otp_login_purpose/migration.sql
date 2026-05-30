-- =================================================================
-- Migration: add_otp_login_purpose
-- Tambah enum value LOGIN ke OtpPurpose untuk fitur OTP saat login.
-- =================================================================

ALTER TABLE `otp_codes`
  MODIFY COLUMN `purpose` ENUM('REGISTER', 'RESET_PASSWORD', 'PHONE_VERIFY', 'LOGIN') NOT NULL;
