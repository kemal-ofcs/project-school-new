"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function TombolKeluar() {
  const router = useRouter();
  const [keluar, setKeluar] = useState(false);
  // Penjaga klik ganda: dua permintaan keluar tidak merusak apa pun, tetapi
  // keduanya menunggu jaringan dan tombolnya tampak menggantung.
  const isSubmittingRef = useRef(false);

  async function kerjakan() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setKeluar(true);
    try {
      await fetch("/api/wali/keluar", { method: "POST" });
      router.replace("/wali");
      router.refresh();
    } catch (error) {
      // Pengguna tetap diarahkan keluar: cookienya mungkin sudah terhapus, dan
      // membiarkannya terjebak di halaman data anaknya lebih buruk daripada
      // pencabutan server yang gagal. Kegagalannya tetap dicatat.
      console.error("[web-public] keluar gagal:", error);
      router.replace("/wali");
    } finally {
      isSubmittingRef.current = false;
      setKeluar(false);
    }
  }

  return (
    <button
      className="rounded-md border border-garis px-3 py-1.5 text-sm text-teks-lembut disabled:opacity-60"
      disabled={keluar}
      onClick={kerjakan}
      type="button"
    >
      {keluar ? "Keluar…" : "Keluar"}
    </button>
  );
}
