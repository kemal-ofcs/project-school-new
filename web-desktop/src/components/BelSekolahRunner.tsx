"use client";

import { useEffect, useState } from "react";
import {
  formatJamOperasional,
  formatTanggalOperasional,
} from "@/lib/attendance/time-policy";
import {
  BEL_BERUBAH_EVENT,
  bacaConfigBel,
  bunyikanBel,
  type ConfigBel,
} from "@/lib/client/bel-perangkat";
import { useAuth } from "@/lib/context/AuthContext";
import {
  getLessonPeriods,
  type LessonPeriodRow,
} from "@/lib/gateways/class-attendance";
import { subscribeSyncCompleted } from "@/lib/gateways/sync-status";
import { audioSynth } from "@/lib/utils/audio";
import {
  barisBelBerbunyi,
  hariDariTanggal,
} from "@/lib/validations/class-attendance";

const MUAT_ULANG_MS = 5 * 60 * 1000;

// Kunci `tanggal|id` yang sudah dibunyikan. Tingkat modul, bukan `useRef`:
// shell dipasang ulang di setiap halaman, dan pindah halaman pada menit yang
// sama tidak boleh membunyikan bel dua kali.
const sudahBerbunyi = new Set<string>();

/**
 * Membunyikan bel sekolah pada pukul jadwal bel, HANYA di perangkat yang
 * ditandai "bel sekolah" (lihat `bel-perangkat.ts`). Bel yang terlewat karena
 * aplikasi tertutup tidak dibunyikan belakangan: bel jam 07:00 yang baru
 * berbunyi 07:20 lebih membingungkan daripada tidak berbunyi.
 *
 * Peramban mengunci suara sampai ada klik pertama. Selama terkunci, sebuah
 * tombol kecil ditampilkan supaya petugas tahu belnya belum siap.
 */
export function BelSekolahRunner() {
  const { isAuthenticated } = useAuth();
  const [config, setConfig] = useState<ConfigBel>({ aktif: false, unit: [] });
  const [periods, setPeriods] = useState<LessonPeriodRow[]>([]);
  const [terkunci, setTerkunci] = useState(false);

  useEffect(() => {
    const muat = () => setConfig(bacaConfigBel());
    muat();
    window.addEventListener(BEL_BERUBAH_EVENT, muat);
    window.addEventListener("storage", muat);
    return () => {
      window.removeEventListener(BEL_BERUBAH_EVENT, muat);
      window.removeEventListener("storage", muat);
    };
  }, []);

  const aktif = isAuthenticated && config.aktif;

  useEffect(() => {
    if (!aktif) return;
    const muat = () =>
      getLessonPeriods()
        .then(setPeriods)
        .catch((error: unknown) => {
          // Jadwal lama tetap dipakai; kegagalannya hanya dicatat.
          console.warn("[BelSekolahRunner] Jadwal bel gagal dimuat:", error);
        });
    void muat();
    const timer = setInterval(() => void muat(), MUAT_ULANG_MS);
    const lepas = subscribeSyncCompleted(() => void muat());
    return () => {
      clearInterval(timer);
      lepas();
    };
  }, [aktif]);

  useEffect(() => {
    if (!aktif) return;
    void audioSynth.bukaKunci().then((siap) => setTerkunci(!siap));
    const buka = () => {
      void audioSynth.bukaKunci().then((siap) => setTerkunci(!siap));
    };
    window.addEventListener("pointerdown", buka);
    window.addEventListener("keydown", buka);
    return () => {
      window.removeEventListener("pointerdown", buka);
      window.removeEventListener("keydown", buka);
    };
  }, [aktif]);

  useEffect(() => {
    if (!aktif || periods.length === 0) return;
    const periksa = () => {
      const sekarang = new Date();
      const tanggal = formatTanggalOperasional(sekarang);
      const pukul = formatJamOperasional(sekarang).slice(0, 5);
      const baris = barisBelBerbunyi(
        periods,
        config.unit,
        hariDariTanggal(tanggal),
      ).find(
        (row) =>
          row.jam_mulai === pukul &&
          !sudahBerbunyi.has(`${tanggal}|${row.id_jam_pelajaran}`),
      );
      if (!baris) return;
      sudahBerbunyi.add(`${tanggal}|${baris.id_jam_pelajaran}`);
      void bunyikanBel(baris).then((berbunyi) => setTerkunci(!berbunyi));
    };
    periksa();
    const timer = setInterval(periksa, 1000);
    return () => clearInterval(timer);
  }, [aktif, periods, config.unit]);

  if (!aktif || !terkunci) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void audioSynth.bukaKunci().then((siap) => setTerkunci(!siap));
      }}
      className="fixed bottom-4 right-4 z-50 rounded-xl border border-amber-300/40 bg-amber-500/90 px-4 py-2 text-sm font-bold text-slate-950 shadow-lg"
    >
      Ketuk untuk mengaktifkan suara bel
    </button>
  );
}
