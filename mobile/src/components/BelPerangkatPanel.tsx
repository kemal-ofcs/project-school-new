"use client";

import { type ChangeEvent, useCallback, useEffect, useState } from "react";
import {
  bacaConfigBel,
  bunyikanBel,
  type ConfigBel,
  daftarMp3,
  hapusMp3,
  SLOT_MP3,
  type SlotMp3,
  simpanConfigBel,
  simpanMp3,
} from "@/lib/client/bel-perangkat";
import {
  LABEL_SUARA_BEL,
  SUARA_BEL,
  type SuaraBel,
} from "@/lib/validations/class-attendance";

export interface BelPerangkatPanelProps {
  unitList: Record<string, unknown>[];
}

/**
 * Sakelar "perangkat ini bel sekolah" dan MP3 miliknya. Semua di sini hanya
 * berlaku untuk perangkat yang sedang dipakai dan tidak ikut sinkronisasi.
 * Dipakai bersama Web/Desktop dan Mobile (`filesToCopy`).
 */
export function BelPerangkatPanel({ unitList }: BelPerangkatPanelProps) {
  const [config, setConfig] = useState<ConfigBel>({ aktif: false, unit: [] });
  const [mp3, setMp3] = useState<Record<SlotMp3, string | null>>({
    1: null,
    2: null,
    3: null,
  });
  const [pesan, setPesan] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const muatMp3 = useCallback(
    () =>
      daftarMp3()
        .then(setMp3)
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    setConfig(bacaConfigBel());
    void muatMp3();
  }, [muatMp3]);

  const ubah = (next: ConfigBel) => {
    setConfig(next);
    simpanConfigBel(next);
  };

  const uji = async (suara: SuaraBel) => {
    const berbunyi = await bunyikanBel({ jenis: "KBM", jam_ke: 1, suara });
    if (!berbunyi) {
      setPesan({
        tone: "error",
        text: "Perangkat ini belum bisa memutar suara. Periksa volume dan izin suara di peramban.",
      });
    }
  };

  const unggah = async (
    slot: SlotMp3,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await simpanMp3(slot, file);
      setPesan({
        tone: "success",
        text: `MP3 ${slot} tersimpan di perangkat ini.`,
      });
      await muatMp3();
    } catch (error: unknown) {
      setPesan({
        tone: "error",
        text: error instanceof Error ? error.message : "MP3 gagal disimpan.",
      });
    }
  };

  const hapus = async (slot: SlotMp3) => {
    try {
      await hapusMp3(slot);
      await muatMp3();
    } catch {
      setPesan({ tone: "error", text: "MP3 gagal dihapus." });
    }
  };

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <h3 className="text-sm font-black text-white">Bel di Perangkat Ini</h3>
      <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
        Bel berbunyi pada pukul jadwal bel selama aplikasi terbuka di perangkat
        ini. Nyalakan di satu perangkat saja, misalnya PC ruang TU yang
        tersambung ke pengeras suara. Di HP, bel berhenti saat layar mati.
      </p>

      {pesan ? (
        <output
          className={`mt-3 block rounded-xl border p-3 text-xs ${
            pesan.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {pesan.text}
        </output>
      ) : null}

      <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-200">
        <input
          type="checkbox"
          checked={config.aktif}
          onChange={(event) => ubah({ ...config, aktif: event.target.checked })}
          className="size-4 rounded border-slate-600 bg-slate-800 accent-sky-500"
        />
        Jadikan perangkat ini bel sekolah
      </label>

      {config.aktif && unitList.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-bold text-slate-300">
            Bunyikan jadwal unit
          </legend>
          <p className="text-xs text-slate-500">
            Tidak ada yang dicentang = jadwal "Semua unit".
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            {unitList.map((unit) => {
              const id = String(unit.id_unit);
              return (
                <label
                  key={id}
                  className="flex items-center gap-2 text-xs text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={config.unit.includes(id)}
                    onChange={(event) =>
                      ubah({
                        ...config,
                        unit: event.target.checked
                          ? [...config.unit, id]
                          : config.unit.filter((item) => item !== id),
                      })
                    }
                    className="size-4 rounded border-slate-600 bg-slate-800 accent-sky-500"
                  />
                  {String(unit.nama_unit)}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-bold text-slate-300">Uji suara</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUARA_BEL.map((suara) => (
            <button
              key={suara}
              type="button"
              onClick={() => void uji(suara)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-slate-700"
            >
              {LABEL_SUARA_BEL[suara]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs font-bold text-slate-300">
          MP3 di perangkat ini (maksimal 5 MB)
        </p>
        {SLOT_MP3.map((slot) => (
          <div
            key={slot}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 px-3 py-2 text-xs"
          >
            <span className="font-semibold text-slate-200">MP3 {slot}</span>
            <span className="min-w-0 flex-1 truncate text-slate-400">
              {mp3[slot] ?? "Belum ada. Baris ber-MP3 ini berbunyi ding-dong."}
            </span>
            <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-200 hover:bg-slate-700">
              {mp3[slot] ? "Ganti" : "Pilih berkas"}
              <input
                type="file"
                accept="audio/*"
                aria-label={`Pilih berkas MP3 ${slot}`}
                onChange={(event) => void unggah(slot, event)}
                className="sr-only"
              />
            </label>
            {mp3[slot] ? (
              <button
                type="button"
                onClick={() => void hapus(slot)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-rose-300 hover:bg-slate-700"
              >
                Hapus
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
