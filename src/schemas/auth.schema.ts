import { z } from "zod";

/** Validator nomor HP Indonesia — toleran terhadap +62/62/0 prefix dan tanpa pemisah. */
const phoneRegexId = /^(\+62|62|0)8[1-9][0-9]{6,11}$/;

export const RegisterSchema = z
  .object({
    email: z.string().email("Email tidak valid"),
    username: z
      .string()
      .min(4, "Min 4 karakter")
      .max(24, "Max 24 karakter")
      .regex(/^[a-zA-Z0-9_]+$/, "Hanya huruf, angka, underscore"),
    phone: z
      .string()
      .regex(phoneRegexId, "Nomor HP Indonesia tidak valid")
      .optional(),
    fullName: z.string().min(2).max(80).optional(),
    password: z
      .string()
      .min(8, "Min 8 karakter")
      .regex(/[A-Z]/, "Harus mengandung huruf besar")
      .regex(/[a-z]/, "Harus mengandung huruf kecil")
      .regex(/[0-9]/, "Harus mengandung angka"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  identifier: z.string().min(1, "Email / username wajib diisi"),
  password: z.string().min(1, "Password wajib diisi"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const PinSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, "PIN harus 6 digit angka"),
});

// =====================================================================
// OTP — verifikasi via WhatsApp untuk register & reset password
// =====================================================================

/** Step 1 register: minta OTP — input nomor HP. Field lain diverifikasi di step 2. */
export const RegisterOtpRequestSchema = z.object({
  phone: z.string().regex(phoneRegexId, "Nomor HP Indonesia tidak valid"),
});
export type RegisterOtpRequestInput = z.infer<typeof RegisterOtpRequestSchema>;

/** Step 2 register: verify + buat akun. */
export const RegisterOtpVerifySchema = z
  .object({
    email: z.string().email("Email tidak valid"),
    username: z
      .string()
      .min(4, "Min 4 karakter")
      .max(24, "Max 24 karakter")
      .regex(/^[a-zA-Z0-9_]+$/, "Hanya huruf, angka, underscore"),
    phone: z.string().regex(phoneRegexId, "Nomor HP Indonesia tidak valid"),
    fullName: z.string().min(2).max(80).optional(),
    password: z
      .string()
      .min(8, "Min 8 karakter")
      .regex(/[A-Z]/, "Harus mengandung huruf besar")
      .regex(/[a-z]/, "Harus mengandung huruf kecil")
      .regex(/[0-9]/, "Harus mengandung angka"),
    confirmPassword: z.string(),
    code: z.string().regex(/^\d{6}$/, "Kode OTP harus 6 digit angka"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
export type RegisterOtpVerifyInput = z.infer<typeof RegisterOtpVerifySchema>;

/** Forgot password step 1: identifier (email/username/phone). */
export const ForgotPasswordRequestSchema = z.object({
  identifier: z
    .string()
    .min(1, "Email / username / nomor HP wajib diisi")
    .max(120),
});
export type ForgotPasswordRequestInput = z.infer<
  typeof ForgotPasswordRequestSchema
>;

/** Forgot password step 2: phone + OTP + password baru. */
export const ForgotPasswordVerifySchema = z
  .object({
    phone: z.string().regex(phoneRegexId, "Nomor HP Indonesia tidak valid"),
    code: z.string().regex(/^\d{6}$/, "Kode OTP harus 6 digit angka"),
    password: z
      .string()
      .min(8, "Min 8 karakter")
      .regex(/[A-Z]/, "Harus mengandung huruf besar")
      .regex(/[a-z]/, "Harus mengandung huruf kecil")
      .regex(/[0-9]/, "Harus mengandung angka"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirmPassword"],
  });
export type ForgotPasswordVerifyInput = z.infer<
  typeof ForgotPasswordVerifySchema
>;

/**
 * Login OTP step 1: identifier (email/username/phone) + password.
 * Server akan validasi password dulu sebelum kirim OTP — supaya tidak buang
 * OTP percuma untuk pencoba random.
 */
export const LoginOtpRequestSchema = z.object({
  identifier: z.string().min(1, "Email / username / nomor HP wajib diisi").max(120),
  password: z.string().min(1, "Password wajib diisi"),
});
export type LoginOtpRequestInput = z.infer<typeof LoginOtpRequestSchema>;

/** Login OTP step 2: phone + OTP. */
export const LoginOtpVerifySchema = z.object({
  phone: z.string().regex(phoneRegexId, "Nomor HP Indonesia tidak valid"),
  code: z.string().regex(/^\d{6}$/, "Kode OTP harus 6 digit angka"),
});
export type LoginOtpVerifyInput = z.infer<typeof LoginOtpVerifySchema>;

