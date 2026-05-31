"use client";

/**
 * Registrasi service worker `/sw.js` sedini mungkin setelah app load.
 *
 * Hanya register — tidak meminta izin notifikasi di sini. Permission baru
 * diminta saat user menekan tombol "Aktifkan Notifikasi" di halaman profil
 * (best practice: jangan prompt permission tanpa interaksi user).
 */
import { useEffect } from "react";

export function ServiceWorkerBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("[sw] register failed:", err);
      });
    };

    // Tunggu load supaya tidak bersaing dengan resource kritikal awal.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
