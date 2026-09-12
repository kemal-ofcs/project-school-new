"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { triggerHaptic } from "@/lib/client/haptics";
import {
  getJpSettings,
  getLessonPeriods,
  type LessonPeriodRow,
  saveJpSettings,
} from "@/lib/gateways/class-attendance";
import {
  DEFAULT_JP_DURATION_MINUTES,
  DEFAULT_JP_MAX_PER_DAY,
  MAX_JAM_KE,
} from "@/lib/validations/class-attendance";

/*
 * Jam pelajaran sekolah — padanan `JamPelajaranCard` di Pengaturan Web/Desktop.
 *
 * Keduanya kebijakan sekolah, bukan setelan perangkat: nilainya hidup di
 * `setting_gex_system` yang ikut sinkronisasi, sehingga sekali diubah di mana
 * pun akan berlaku di seluruh perangkat sekolah itu. Pemanggil wajib
 * menjaganya dengan `settings.manage` — backend menolak akun lain.
 */

const INPUT_CLASS =
  "min-h-11 w-28 rounded-xl border border-white/15 bg-slate-950 px-3 font-mono text-xs text-white outline-none transition focus:border-sky-400";

export function JamPelajaranCard() {
  const [maxPerHari, setMaxPerHari] = useState(DEFAULT_JP_MAX_PER_DAY);
  const [durasiMenit, setDurasiMenit] = useState(DEFAULT_JP_DURATION_MINUTES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isSubmittingRef = useRef(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [periods, setPeriods] = useState<LessonPeriodRow[]>([]);

  const muat = useCallback(async () => {
    try {
      const [settings, daftarBel] = await Promise.all([
        getJpSettings(),
        getLessonPeriods(),
      ]);
      setMaxPerHari(settings.maxPerHari);
      setDurasiMenit(settings.durasiMenit);
      setPeriods(daftarBel);
    } catch (err) {
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Gagal memuat pengaturan jam pelajaran.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSaving(true);
    try {
      await saveJpSettings(maxPerHari, durasiMenit);
      triggerHaptic("success");
      setFeedback({
        type: "success",
        message: "Pengaturan jam pelajaran tersimpan dan ikut tersinkronisasi.",
      });
      await muat();
    } catch (err) {
      triggerHaptic("error");
      setFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Pengaturan jam pelajaran gagal disimpan.",
      });
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-sky-500/20 bg-slate-900/80 p-4 backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/20 text-sky-300">
            <Icon name="tools" className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">Jam Pelajaran</h3>
            <p className="text-[11px] text-slate-400">
              Jumlah per hari &amp; lama satu jam
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-white/10 bg-slate-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-300">
          {loading ? "Memuat" : `${maxPerHari} JP · ${durasiMenit} mnt`}
        </span>
      </div>

      {feedback ? (
        <FeedbackBanner
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
          className="mt-3 text-xs"
        />
      ) : null}

      <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
        <label
          htmlFor="jp-max-per-hari"
          className="block text-xs font-bold text-slate-200"
        >
          Jumlah jam pelajaran per hari
        </label>
        <p className="text-[11px] leading-4 text-slate-500">
          Sesi presensi di atas angka ini ditolak, termasuk dari perangkat lain.
          Maksimal {MAX_JAM_KE}.
        </p>
        <input
          id="jp-max-per-hari"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_JAM_KE}
          step={1}
          disabled={loading}
          value={maxPerHari}
          onChange={(event) => setMaxPerHari(Number(event.target.value))}
          className={INPUT_CLASS}
        />
      </div>

      <div className="mt-2 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
        <label
          htmlFor="jp-durasi-menit"
          className="block text-xs font-bold text-slate-200"
        >
          Lama satu jam pelajaran (menit)
        </label>
        <p className="text-[11px] leading-4 text-slate-500">
          Umumnya 35 menit di SD, 40 di SMP, 45 di SMA/SMK. Honor guru dibayar
          per jam pelajaran, jadi angka ini tidak mengubah nominal gaji.
        </p>
        <input
          id="jp-durasi-menit"
          type="number"
          inputMode="numeric"
          min={1}
          max={240}
          step={1}
          disabled={loading}
          value={durasiMenit}
          onChange={(event) => setDurasiMenit(Number(event.target.value))}
          className={INPUT_CLASS}
        />
      </div>

      <button
        type="submit"
        disabled={saving || loading}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl bg-sky-500 text-sm font-black text-slate-950 transition active:scale-95 disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Simpan Pengaturan"}
      </button>

      {/* Jadwal bel: DAFTAR SAJA di Mobile. Menyusunnya menuntut mengetik
          belasan pasang jam berurutan, dan itu pekerjaan layar besar; di sini
          gunanya memastikan jadwalnya benar sampai ke perangkat. */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
        <p className="text-xs font-bold text-slate-200">Jadwal bel</p>
        {periods.length === 0 ? (
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Belum diisi. Presensi tetap berjalan tanpa ini — pukulnya saja yang
            belum muncul. Susun jadwalnya lewat Pengaturan di layar besar.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {periods.map((row) => (
              <li
                key={row.id_jam_pelajaran}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                <span className="text-slate-400">
                  Jam ke-{row.jam_ke}
                  {row.jenis === "KBM" ? "" : ` · ${row.jenis}`}
                  {row.is_aktif === 1 ? "" : " · nonaktif"}
                </span>
                <span className="font-mono text-slate-300">
                  {row.jam_mulai}–{row.jam_selesai}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
