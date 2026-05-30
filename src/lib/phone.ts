/**
 * Phone Number Helper — normalisasi nomor HP Indonesia ke format E.164
 * tanpa "+", contoh "62812xxxxxxx". Dipakai untuk OTP & WhatsApp JID.
 *
 * Aturan:
 *   - Buang semua karakter non-digit.
 *   - Awalan "0"  → diganti "62".
 *   - Awalan "+62" / "62" → tetap "62".
 *   - Awalan "8"  → ditambah "62".
 *   - Selain itu (mis. nomor luar) → reject (return null).
 *
 * Validasi panjang: 10–15 digit setelah normalisasi (E.164).
 */

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = String(input).trim();
  // buang spasi, dash, dot, tanda kurung
  s = s.replace(/[^\d+]/g, "");
  // strip leading +
  if (s.startsWith("+")) s = s.slice(1);
  // strip leading zero(es)
  if (s.startsWith("0")) {
    s = "62" + s.replace(/^0+/, "");
  } else if (s.startsWith("8")) {
    s = "62" + s;
  }
  // sekarang harus mulai 62
  if (!s.startsWith("62")) return null;
  // setelah "62", digit pertama provider seluler ID adalah 8
  // (longgar saja: yang penting numeric & panjang valid)
  if (!/^\d+$/.test(s)) return null;
  if (s.length < 10 || s.length > 15) return null;
  return s;
}

/** Format tampilan: "+62 812-3456-7890" (untuk UI). */
export function formatPhoneDisplay(e164: string): string {
  if (!e164.startsWith("62")) return e164;
  const rest = e164.slice(2);
  const parts: string[] = [];
  let i = 0;
  // 3-4-4 grouping (atau sisa terakhir)
  if (rest.length > 0) parts.push(rest.slice(i, (i += 3)));
  if (i < rest.length) parts.push(rest.slice(i, (i += 4)));
  if (i < rest.length) parts.push(rest.slice(i));
  return `+62 ${parts.join("-")}`;
}

/** Konversi nomor E.164 ke JID WhatsApp. */
export function phoneToJid(e164: string): string {
  return `${e164}@s.whatsapp.net`;
}
