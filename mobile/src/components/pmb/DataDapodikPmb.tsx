"use client";

import { useState } from "react";
import { saveFileWithPicker } from "@/lib/client/download";
import { createXlsxBuffer } from "@/lib/client/xlsx";
import { daftarPendaftarPmb } from "@/lib/gateways/pmb";
import {
  barisEksporDapodik,
  JUDUL_EKSPOR_DAPODIK,
  uraiDataDapodik,
} from "@/lib/validations/pmb-dapodik";
import type { PmbRegistrantExportItem, PmbRegistrantFilter } from "@/types/pmb";

/**
 * Isian DAPODIK pendaftar PMB di panel admin (Web/Desktop dan Mobile, disalin
 * lewat `filesToCopy`). Datanya cloud-only di `pmb_pendaftar.data_dapodik`.
 */

type Baris = [string, unknown];

function Kelompok({ judul, baris }: { judul: string; baris: Baris[] }) {
  return (
    <div>
      <h3 className="font-semibold text-white text-xs uppercase">{judul}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-slate-300">
        {baris.map(([label, nilai]) => (
          <div className="contents" key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd className="break-words">
              {nilai === null || nilai === undefined || nilai === ""
                ? "—"
                : nilai === true
                  ? "Ya"
                  : nilai === false
                    ? "Tidak"
                    : String(nilai)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DataDapodikDetail({
  pendaftar,
}: {
  pendaftar: {
    tempat_lahir: string | null;
    tanggal_lahir: string | null;
    alamat: string | null;
    data_dapodik: string | null;
  };
}) {
  const d = uraiDataDapodik(pendaftar.data_dapodik);
  if (!d) {
    return (
      <p className="text-slate-400">
        Pendaftar ini mengisi formulir versi lama, jadi data DAPODIK-nya belum
        ada. Lengkapi saat daftar ulang.
      </p>
    );
  }
  const orangTua = (awalan: "ayah" | "ibu" | "wali"): Baris[] => [
    ["Nama", d[`${awalan}Nama`]],
    ["Tahun lahir", d[`${awalan}TahunLahir`]],
    ["NIK", d[`${awalan}Nik`]],
    ["Pendidikan", d[`${awalan}Pendidikan`]],
    ["Pekerjaan", d[`${awalan}Pekerjaan`]],
    ["Penghasilan", d[`${awalan}Penghasilan`]],
  ];
  return (
    <div className="space-y-4">
      <Kelompok
        baris={[
          ["Tempat lahir", pendaftar.tempat_lahir],
          ["Tanggal lahir", pendaftar.tanggal_lahir],
          ["NIK", d.nik],
          ["Agama", d.agama],
          ["No akta lahir", d.noAktaLahir],
          ["Kebutuhan khusus", d.kebutuhanKhusus],
          ["Anak ke-", d.anakKe],
          ["Saudara kandung", d.jumlahSaudara],
          ["HP siswa", d.hpSiswa],
          ["Email siswa", d.emailSiswa],
        ]}
        judul="Data DAPODIK calon siswa"
      />
      <Kelompok
        baris={[
          ["Alamat", pendaftar.alamat],
          ["RT / RW", [d.rt, d.rw].filter(Boolean).join(" / ")],
          ["Dusun", d.dusun],
          ["Kelurahan", d.kelurahan],
          ["Kecamatan", d.kecamatan],
          ["Kode pos", d.kodePos],
          ["Tinggal bersama", d.jenisTinggal],
          ["Transportasi", d.transportasi],
          ["Jarak (km)", d.jarakKm],
        ]}
        judul="Alamat"
      />
      <Kelompok baris={[["No KK", d.noKk]]} judul="Keluarga" />
      <Kelompok baris={orangTua("ayah")} judul="Ayah" />
      <Kelompok baris={orangTua("ibu")} judul="Ibu" />
      <Kelompok baris={orangTua("wali")} judul="Wali" />
      <Kelompok
        baris={[
          ["Penerima KPS/PKH", d.kps],
          ["No KPS/PKH", d.noKps],
          ["Penerima KIP", d.kip],
          ["No KIP", d.noKip],
          ["Nama di KIP", d.namaKip],
          ["No KKS", d.noKks],
          ["Berat (kg)", d.beratKg],
          ["Tinggi (cm)", d.tinggiCm],
          ["Lingkar kepala (cm)", d.lingkarKepalaCm],
        ]}
        judul="Bantuan & kesehatan"
      />
    </div>
  );
}

/**
 * Ekspor pendaftar sesuai saringan aktif ke Excel dengan kolom persis berkas
 * "daftar_pd" DAPODIK (dua baris judul). Maksimal 500 baris per ekspor, sama
 * dengan batas daftar.
 */
export function TombolEksporDapodik({
  filter,
}: {
  filter: PmbRegistrantFilter;
}) {
  const [keadaan, setKeadaan] = useState<
    { jenis: "diam" } | { jenis: "proses" } | { jenis: "pesan"; teks: string }
  >({ jenis: "diam" });

  async function ekspor() {
    if (keadaan.jenis === "proses") return;
    setKeadaan({ jenis: "proses" });
    try {
      const { items } = await daftarPendaftarPmb({
        ...filter,
        dapodik: true,
        limit: 500,
      });
      const baris = (items as PmbRegistrantExportItem[]).map((p, i) =>
        barisEksporDapodik(p, i + 1),
      );
      const isi = createXlsxBuffer(
        JUDUL_EKSPOR_DAPODIK.baris1,
        [JUDUL_EKSPOR_DAPODIK.baris2, ...baris],
        "Daftar PD",
      );
      const hasil = await saveFileWithPicker(
        new Blob([isi as unknown as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "pmb-format-dapodik.xlsx",
        {
          description: "Excel Spreadsheet (*.xlsx)",
          accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              [".xlsx"],
          },
        },
      );
      setKeadaan(
        hasil.cancelled
          ? { jenis: "diam" }
          : {
              jenis: "pesan",
              teks: hasil.sukses
                ? `${baris.length} pendaftar diekspor${items.length >= 500 ? " (batas 500; persempit saringan untuk sisanya)" : ""}.`
                : "Berkas ekspor gagal disimpan.",
            },
      );
    } catch (err) {
      setKeadaan({
        jenis: "pesan",
        teks: err instanceof Error ? err.message : "Ekspor gagal.",
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        disabled={keadaan.jenis === "proses"}
        onClick={ekspor}
        type="button"
      >
        {keadaan.jenis === "proses" ? "Menyiapkan..." : "Ekspor format DAPODIK"}
      </button>
      {keadaan.jenis === "pesan" ? (
        <output className="text-xs text-slate-400">{keadaan.teks}</output>
      ) : null}
    </div>
  );
}
