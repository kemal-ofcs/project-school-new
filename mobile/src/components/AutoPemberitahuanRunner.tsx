"use client";

import { useEffect, useRef } from "react";
import { hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { jalankanPemberitahuanTutupBuku } from "@/lib/gateways/accounting";
import { jalankanPengingatOtomatis } from "@/lib/gateways/billing";

const INTERVAL_MS = 30 * 60 * 1000;

/**
 * Mengetuk satu pemberitahuan latar setiap 30 menit selama `boleh`. Komponen
 * ini hanya mengetuk; backend yang memutuskan apakah ada yang perlu diantre
 * dan menjaga agar tidak ganda. Kegagalan tidak mengganggu layar dan dicatat
 * sekali per pesan berbeda, supaya kegagalan yang sama (mis. database belum
 * diatur) tidak berulang di konsol.
 */
function useKetukBerkala(
  nama: string,
  boleh: boolean,
  ketuk: () => Promise<unknown>,
) {
  const ketukRef = useRef(ketuk);
  ketukRef.current = ketuk;
  const isRunningRef = useRef(false);
  const pesanTerakhirRef = useRef("");

  useEffect(() => {
    if (!boleh) return;

    const jalan = async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        await ketukRef.current();
        pesanTerakhirRef.current = "";
      } catch (error) {
        // Lihat komentar fungsi: dicatat sekali per pesan, tidak ke layar.
        const pesan = error instanceof Error ? error.message : String(error);
        if (pesan !== pesanTerakhirRef.current) {
          pesanTerakhirRef.current = pesan;
          console.warn(`[AutoPemberitahuanRunner] ${nama} gagal:`, pesan);
        }
      } finally {
        isRunningRef.current = false;
      }
    };

    const awal = setTimeout(() => void jalan(), 60_000);
    const berkala = setInterval(() => void jalan(), INTERVAL_MS);
    return () => {
      clearTimeout(awal);
      clearInterval(berkala);
    };
  }, [boleh, nama]);
}

/**
 * Pemberitahuan WhatsApp latar selama aplikasi terbuka: pengingat tagihan
 * otomatis (sesi pemegang `billing.manage`; sakelar, H-n, dan sekali sehari
 * diputuskan backend) dan pemberitahuan tutup buku ke pemegang izin Tutup
 * Buku (sesi pemegang `accounting.view`; satu pesan per kejadian per orang).
 * Pesannya masuk antrean WhatsApp biasa dan terkirim lewat pengirim yang sama
 * dengan pesan lain.
 */
export function AutoPemberitahuanRunner() {
  const { isAuthenticated, user } = useAuth();
  useKetukBerkala(
    "Pengingat tagihan",
    isAuthenticated && hasPermission(user, "billing.manage"),
    jalankanPengingatOtomatis,
  );
  useKetukBerkala(
    "Pemberitahuan tutup buku",
    isAuthenticated && hasPermission(user, "accounting.view"),
    jalankanPemberitahuanTutupBuku,
  );
  return null;
}
