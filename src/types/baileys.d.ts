/**
 * Ambient declaration untuk @whiskeysockets/baileys (fork skyzopedia/Baileys).
 * Fork ini tidak menyertakan file .d.ts, sehingga kita expose API yang dipakai
 * sebagai `any` agar TypeScript tidak komplain.
 *
 * Pemakaian di aplikasi:
 *   - default export: makeWASocket
 *   - named: useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason,
 *            Browsers, makeCacheableSignalKeyStore
 *
 * Kita tetap import secara dinamis di `wa.service.ts` untuk menghindari
 * tarikan dependency saat tidak dipakai (mis. saat fitur WA dimatikan).
 */
declare module "@whiskeysockets/baileys" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baileys: any;
  export default baileys;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const useMultiFileAuthState: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const fetchLatestBaileysVersion: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const DisconnectReason: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Browsers: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const makeCacheableSignalKeyStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const proto: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const downloadContentFromMessage: any;
}
