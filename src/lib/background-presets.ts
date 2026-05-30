/**
 * Background presets — pola dekoratif global yang dipilih admin.
 *
 * Pola dirender lewat `body[data-bg="<key>"]::before` di globals.css.
 * Semua pola memakai warna tema (`hsl(var(--primary))`) sehingga otomatis
 * ikut berubah saat admin mengganti warna tema.
 */

export interface BackgroundPreset {
  key: string;
  label: string;
  description: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    key: "parang",
    label: "Batik Parang Rusak",
    description: "Motif diagonal khas keraton Jawa — klasik & berwibawa.",
  },
  {
    key: "batik",
    label: "Batik Megamendung",
    description: "Motif awan berlapis khas Cirebon — adem & elegan.",
  },
  {
    key: "dots",
    label: "Dots",
    description: "Titik-titik rapi, bersih dan minimalis.",
  },
  {
    key: "aurora",
    label: "Aurora",
    description: "Gradien lembut mengambang, modern & estetik.",
  },
  {
    key: "diagonal",
    label: "Diagonal",
    description: "Garis miring tipis berulang, simpel & dinamis.",
  },
  {
    key: "social",
    label: "Media Sosial",
    description: "Tabur ikon sosmed (hati, chat, play, tagar) — playful.",
  },
  {
    key: "none",
    label: "Polos",
    description: "Tanpa pola, background bersih.",
  },
];

export const DEFAULT_BACKGROUND = "batik";

const PRESET_KEYS = new Set(BACKGROUND_PRESETS.map((p) => p.key));

/** Daftar key untuk validasi Zod (z.enum butuh tuple non-empty). */
export const BACKGROUND_KEYS = BACKGROUND_PRESETS.map((p) => p.key) as [
  string,
  ...string[],
];

/** Kembalikan key valid, fallback ke default bila tidak dikenal. */
export function resolveBackground(key: string | null | undefined): string {
  return key && PRESET_KEYS.has(key) ? key : DEFAULT_BACKGROUND;
}
