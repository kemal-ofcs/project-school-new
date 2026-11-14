"use client";

import { useEffect, useRef, useState } from "react";
import {
  muatStatusTidakTetap,
  type StatusTidakTetap,
  simpanStatusTidakTetap,
} from "@/lib/gateways/hris";
import { formatTarif, PAJAK_BAWAAN } from "@/lib/validations/pajak";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/**
 * PTKP, biaya jabatan, dan TER harian dari `pajak-bawaan.json` (Q-9 (a)):
 * konstanta di kode (`prd-hris.md` §6.7). Status tidak tetap dibaca dari kunci
 * `pajak_status_tidak_tetap` dan bisa dicentang pemegang
 * `payroll.config.manage` (Q-26 (a)). Dipakai Web dan Mobile (`filesToCopy`).
 */
export function KartuKonstantaPajak({ bolehUbah }: { bolehUbah: boolean }) {
  const { ptkp, biaya_jabatan, ter_harian } = PAJAK_BAWAAN;
  const baris: [string, string][] = [
    ["PTKP dasar (TK/0)", IDR.format(ptkp.dasar)],
    ["Tambahan kawin", IDR.format(ptkp.kawin)],
    [
      `Tambahan per tanggungan (maks ${ptkp.maks_tanggungan})`,
      IDR.format(ptkp.per_tanggungan),
    ],
    [
      "Biaya jabatan (masa terakhir)",
      `${formatTarif(biaya_jabatan.basis)}, maks ${IDR.format(biaya_jabatan.maks_per_masa)} per bulan`,
    ],
    [
      "TER harian pegawai tidak tetap",
      `0% s.d. ${IDR.format(ter_harian.batas_nol)}/hari; ${formatTarif(ter_harian.basis)} s.d. ${IDR.format(ter_harian.batas_tarif)}/hari; di atasnya Pasal 17 atas ${formatTarif(ter_harian.basis_dasar_pasal_17)} bruto`,
    ],
  ];
  return (
    <section
      id="kartu-konstanta-pajak"
      aria-labelledby="judul-konstanta-pajak"
      className="mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
    >
      <h2
        id="judul-konstanta-pajak"
        className="text-sm font-semibold text-slate-200"
      >
        Konstanta PPh 21 (tidak bisa disunting)
      </h2>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        {baris.map(([label, nilai]) => (
          <div key={label} className="contents">
            <dt className="text-slate-400">{label}</dt>
            <dd className="min-w-0 break-words font-mono text-slate-200">
              {nilai}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-slate-500">
        Pajak dihitung per masa (bulan tanggal mulai proses gaji). Desember,
        atau bulan personil nonaktif, menghitung ulang setahun dengan Pasal 17
        untuk pegawai tetap. Pegawai dengan status yang dicentang di bawah
        dihitung sebagai pegawai tidak tetap, tanpa perhitungan ulang Desember.
      </p>
      <StatusTidakTetapIsian bolehUbah={bolehUbah} />
    </section>
  );
}

function StatusTidakTetapIsian({ bolehUbah }: { bolehUbah: boolean }) {
  const [data, setData] = useState<StatusTidakTetap | null>(null);
  const [dipilih, setDipilih] = useState<string[]>([]);
  const [pesan, setPesan] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    muatStatusTidakTetap()
      .then((hasil) => {
        setData(hasil);
        setDipilih(hasil.daftar);
      })
      .catch((error: unknown) =>
        setPesan(error instanceof Error ? error.message : "Gagal memuat."),
      );
  }, []);

  if (!data) {
    return pesan ? <p className="mt-3 text-xs text-rose-300">{pesan}</p> : null;
  }

  const sama = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const tercentang = (s: string) => dipilih.some((d) => sama(d, s));
  const ubah = (s: string) =>
    setDipilih((lama) =>
      tercentang(s) ? lama.filter((d) => !sama(d, s)) : [...lama, s],
    );
  const simpan = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      const hasil = await simpanStatusTidakTetap(dipilih);
      setData(hasil);
      setDipilih(hasil.daftar);
      setPesan(
        "Status tidak tetap disimpan; berlaku untuk proses gaji berikutnya.",
      );
    } catch (error) {
      setPesan(error instanceof Error ? error.message : "Gagal menyimpan.");
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <fieldset className="mt-3 border-t border-slate-800 pt-3">
      <legend className="text-xs font-semibold text-slate-300">
        Status kepegawaian tidak tetap{data.tersimpan ? "" : " (bawaan)"}
      </legend>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
        {data.pilihan.map((s) => (
          <label
            key={s}
            className="flex min-h-10 items-center gap-2 text-sm text-slate-200"
          >
            <input
              type="checkbox"
              checked={tercentang(s)}
              disabled={!bolehUbah}
              onChange={() => ubah(s)}
              className="h-4 w-4"
            />
            {s}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Status diambil dari kontrak terakhir (guru dan tendik), atau dari data
        guru bila belum ada kontrak. Proses gaji yang sudah ada tidak dihitung
        ulang. Untuk PNS/PPPK yang dipekerjakan, tanyakan konsultan pajak.
      </p>
      {bolehUbah ? (
        <button
          type="button"
          data-konfirmasi
          disabled={menyimpan}
          onClick={() => void simpan()}
          className="mt-2 min-h-10 rounded-xl bg-sky-500 px-4 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
        >
          Simpan status
        </button>
      ) : null}
      {pesan ? (
        <output className="mt-2 block text-xs text-slate-300">{pesan}</output>
      ) : null}
    </fieldset>
  );
}

/** Catatan di halaman BPJS (§6.7): batas upah JP diperbarui setiap Maret. */
export function CatatanBatasJp() {
  return (
    <p
      id="catatan-batas-jp"
      className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
    >
      Batas upah Jaminan Pensiun berubah setiap Maret menurut surat BPJS
      Ketenagakerjaan; perbarui baris JP_EMP dan JP_CO. BPJS dihitung per bulan
      atas gaji pokok ditambah tunjangan yang ditandai tetap; honor JP tidak
      ikut.
    </p>
  );
}
