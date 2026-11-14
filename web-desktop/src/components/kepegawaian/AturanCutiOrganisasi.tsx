"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type AturanCuti,
  type AturanCutiDraft,
  muatSaldoCuti,
  simpanAturanCuti,
} from "@/lib/gateways/hr-pengajuan";
import {
  BATAS_CUTI,
  KELOMPOK_CUTI,
  type KelompokCuti,
} from "@/lib/validations/hr-pengajuan";
import { INPUT, LABEL, pesanGalat, TOMBOL_UTAMA } from "./gaya";

const NAMA_KELOMPOK: Record<KelompokCuti, string> = {
  guru: "Guru",
  tendik: "Tendik",
};

/**
 * Aturan jatah cuti per kelompok (§20.2.4) di tab Organisasi, `hr.org.manage`.
 * Disimpan di `setting_gex_system` lewat outbox `setting`; sisa jatah
 * dihitung ulang untuk semua periode begitu aturannya berubah.
 */
export function AturanCutiOrganisasi({
  bolehUbah,
  onBerhasil,
  onGalat,
}: {
  bolehUbah: boolean;
  onBerhasil: (pesan: string) => Promise<void>;
  onGalat: (pesan: string) => void;
}) {
  const [aturan, setAturan] = useState<AturanCutiDraft | null>(null);
  const [awal, setAwal] = useState<AturanCutiDraft | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);
  const onGalatRef = useRef(onGalat);
  onGalatRef.current = onGalat;

  useEffect(() => {
    muatSaldoCuti(null)
      .then((hasil) => {
        setAturan(hasil.aturan);
        setAwal(hasil.aturan);
      })
      .catch((error: unknown) => onGalatRef.current(pesanGalat(error)));
  }, []);

  if (!aturan || !awal) {
    return <p className="text-sm text-slate-400">Memuat aturan cuti…</p>;
  }

  const ubah = (k: KelompokCuti, sebagian: Partial<AturanCuti>) =>
    setAturan((lama) =>
      lama ? { ...lama, [k]: { ...lama[k], ...sebagian } } : lama,
    );

  const gantiPeriode = KELOMPOK_CUTI.some(
    (k) =>
      aturan[k].periode !== awal[k].periode ||
      aturan[k].bulan_awal !== awal[k].bulan_awal,
  );

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      const hasil = await simpanAturanCuti(aturan);
      setAturan(hasil);
      setAwal(hasil);
      await onBerhasil("Aturan cuti tersimpan.");
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <section aria-labelledby="judul-aturan-cuti" className="space-y-3">
      <h2 id="judul-aturan-cuti" className="text-base font-semibold text-white">
        Aturan cuti
      </h2>
      <p className="text-sm text-slate-400">
        Guru = personil yang punya data guru; selain itu tendik. Jatah dihitung
        dari TMT, tidak disimpan, jadi perubahan di sini berlaku untuk semua
        periode termasuk yang sudah lewat.
      </p>
      <form className="space-y-4" onSubmit={(e) => void kirim(e)}>
        <div className="grid gap-4 md:grid-cols-2">
          {KELOMPOK_CUTI.map((k) => (
            <fieldset
              key={k}
              disabled={!bolehUbah}
              className="space-y-3 rounded-xl border border-white/10 p-3"
            >
              <legend className="px-1 text-sm font-semibold text-white">
                {NAMA_KELOMPOK[k]}
              </legend>
              <div>
                <label htmlFor={`cuti-${k}-periode`} className={LABEL}>
                  Periode jatah
                </label>
                <select
                  id={`cuti-${k}-periode`}
                  value={aturan[k].periode}
                  onChange={(e) => ubah(k, { periode: e.target.value })}
                  className={INPUT}
                >
                  <option value="tahunan">
                    Tahunan (mulai bulan tertentu)
                  </option>
                  <option value="ulang_tahun_kerja">
                    Ulang tahun kerja dari TMT
                  </option>
                </select>
              </div>
              <div>
                <label htmlFor={`cuti-${k}-sisa`} className={LABEL}>
                  Sisa akhir periode
                </label>
                <select
                  id={`cuti-${k}-sisa`}
                  value={aturan[k].sisa}
                  onChange={(e) => ubah(k, { sisa: e.target.value })}
                  className={INPUT}
                >
                  <option value="hangus">Hangus</option>
                  <option value="dibawa">Dibawa ke periode berikutnya</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {BATAS_CUTI.map(([isian, label, min, maks]) =>
                  isian === "bulan_awal" &&
                  aturan[k].periode !== "tahunan" ? null : (isian ===
                      "bawa_maks" ||
                      isian === "bawa_bulan") &&
                    aturan[k].sisa !== "dibawa" ? null : (
                    <div key={isian}>
                      <label htmlFor={`cuti-${k}-${isian}`} className={LABEL}>
                        {label}
                      </label>
                      <input
                        id={`cuti-${k}-${isian}`}
                        type="number"
                        required
                        min={min}
                        max={maks}
                        inputMode="numeric"
                        value={aturan[k][isian]}
                        onChange={(e) =>
                          ubah(k, { [isian]: Number(e.target.value) })
                        }
                        className={INPUT}
                      />
                    </div>
                  ),
                )}
              </div>
            </fieldset>
          ))}
        </div>
        {gantiPeriode ? (
          <output className="block text-sm text-amber-200">
            Periode jatah berubah: sisa cuti semua pegawai di kelompok itu akan
            dihitung ulang dengan periode baru.
          </output>
        ) : null}
        {bolehUbah ? (
          <div className="flex justify-end">
            <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
              Simpan aturan cuti
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
