"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  INPUT,
  LABEL,
  pesanGalat,
  TOMBOL_UTAMA,
} from "@/components/kepegawaian/gaya";
import { Icon } from "@/components/ui/Icon";
import { muatDataPemotong, simpanDataPemotong } from "@/lib/gateways/payroll";
import {
  type DataPemotong,
  KUNCI_PEMOTONG,
  type KunciPemotong,
} from "@/lib/validations/lapor-pajak";

const ISIAN: Record<
  KunciPemotong,
  { label: string; ket?: string; numerik?: boolean }
> = {
  npwp: { label: "NPWP sekolah/yayasan", ket: "16 digit.", numerik: true },
  nitku: {
    label: "NITKU",
    ket: "22 digit, diawali NPWP di atas.",
    numerik: true,
  },
  nama_penandatangan: { label: "Nama penandatangan bukti potong" },
  nik_penandatangan: {
    label: "NIK penandatangan",
    ket: "16 digit.",
    numerik: true,
  },
  no_bpjs_ketenagakerjaan: { label: "No. pendaftaran BPJS Ketenagakerjaan" },
  no_bpjs_kesehatan: { label: "No. pendaftaran BPJS Kesehatan" },
};

/**
 * Data pemotong untuk rekap PPh 21/BPJS (§26.5 nomor 3). Hanya Superadmin;
 * isian kosong berarti belum diisi, tanda baca dan spasi dibuang saat disimpan.
 */
export function DataPemotongCard() {
  const [nilai, setNilai] = useState<DataPemotong | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let batal = false;
    void muatDataPemotong()
      .then((d) => {
        if (!batal) setNilai(d);
      })
      .catch((error) => {
        if (!batal) setGalat(pesanGalat(error));
      });
    return () => {
      batal = true;
    };
  }, []);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    if (!nilai || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    setKabar(null);
    try {
      const hasil = await simpanDataPemotong(nilai);
      setNilai(hasil.pemotong);
      setKabar("Data pemotong disimpan.");
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <section className="app-panel rounded-3xl p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
          <Icon name="document" className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-black text-white">Data pemotong</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Identitas sekolah sebagai pemotong PPh 21 dan pemberi kerja BPJS.
            Dicantumkan di Excel rekap Pelaporan.
          </p>
        </div>
      </div>
      {!nilai && !galat ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : null}
      {nilai ? (
        <form className="mt-6 space-y-4" onSubmit={kirim}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {KUNCI_PEMOTONG.map((k) => (
              <div key={k}>
                <label className={LABEL} htmlFor={`pemotong-${k}`}>
                  {ISIAN[k].label}
                </label>
                <input
                  id={`pemotong-${k}`}
                  aria-describedby={
                    ISIAN[k].ket ? `pemotong-${k}-ket` : undefined
                  }
                  inputMode={ISIAN[k].numerik ? "numeric" : undefined}
                  maxLength={100}
                  value={nilai[k]}
                  onChange={(e) =>
                    setNilai((n) => (n ? { ...n, [k]: e.target.value } : n))
                  }
                  className={INPUT}
                />
                {ISIAN[k].ket ? (
                  <p
                    id={`pemotong-${k}-ket`}
                    className="mt-1 text-xs text-slate-400"
                  >
                    {ISIAN[k].ket}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {kabar ? (
            <output className="block text-sm text-emerald-300">{kabar}</output>
          ) : null}
          <div className="flex justify-end">
            <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </form>
      ) : null}
      {galat ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
    </section>
  );
}
