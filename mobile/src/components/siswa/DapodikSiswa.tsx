"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INPUT,
  LABEL,
  TOMBOL_BAHAYA,
  TOMBOL_KEDUA,
  TOMBOL_UTAMA,
} from "@/components/inventory/gaya";
import { Modal } from "@/components/ui/Modal";
import { saveFileWithPicker } from "@/lib/client/download";
import { createXlsxBuffer } from "@/lib/client/xlsx";
import {
  daftarDapodikSiswa,
  kosongkanDapodikSiswa,
  simpanDapodikSiswa,
} from "@/lib/gateways/siswa-dapodik";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import {
  AGAMA,
  ALAT_TRANSPORTASI,
  barisEksporDapodik,
  JENIS_TINGGAL,
  JENJANG_PENDIDIKAN,
  JUDUL_EKSPOR_DAPODIK,
  KEBUTUHAN_KHUSUS,
  PEKERJAAN,
  PENGHASILAN,
  uraiDataDapodik,
} from "@/lib/validations/pmb-dapodik";
import {
  type BarisDapodikSiswa,
  isianKurangDapodik,
} from "@/lib/validations/siswa-dapodik";

/**
 * Data DAPODIK per siswa di halaman Siswa (Web/Desktop dan Mobile, disalin
 * lewat `filesToCopy`). Datanya cloud-only di `siswa_dapodik` (v57); melihat
 * butuh `pmb.view`, mengubah butuh `pmb.manage` + `students.manage`.
 */

type Siswa = Record<string, unknown>;

interface Isian {
  kunci: string;
  label: string;
  jenis?: "angka" | "tanggal" | "pilihan" | "yaTidak";
  pilihan?: readonly string[];
  maks?: number;
  inputMode?: "numeric" | "decimal" | "tel" | "email";
}

const orangTua = (awalan: string, siapa: string): Isian[] => [
  { kunci: `${awalan}Nama`, label: `Nama ${siapa}`, maks: 120 },
  {
    kunci: `${awalan}TahunLahir`,
    label: "Tahun lahir",
    jenis: "angka",
    inputMode: "numeric",
  },
  {
    kunci: `${awalan}Pendidikan`,
    label: "Pendidikan",
    jenis: "pilihan",
    pilihan: JENJANG_PENDIDIKAN,
  },
  {
    kunci: `${awalan}Pekerjaan`,
    label: "Pekerjaan",
    jenis: "pilihan",
    pilihan: PEKERJAAN,
  },
  {
    kunci: `${awalan}Penghasilan`,
    label: "Penghasilan",
    jenis: "pilihan",
    pilihan: PENGHASILAN,
  },
  { kunci: `${awalan}Nik`, label: "NIK", maks: 16, inputMode: "numeric" },
];

const KELOMPOK: { judul: string; isian: Isian[] }[] = [
  {
    judul: "Identitas",
    isian: [
      { kunci: "tempatLahir", label: "Tempat lahir", maks: 80 },
      { kunci: "tanggalLahir", label: "Tanggal lahir", jenis: "tanggal" },
      { kunci: "sekolahAsal", label: "Sekolah asal", maks: 120 },
      { kunci: "nik", label: "NIK", maks: 16, inputMode: "numeric" },
      { kunci: "agama", label: "Agama", jenis: "pilihan", pilihan: AGAMA },
      { kunci: "noAktaLahir", label: "No registrasi akta lahir", maks: 40 },
      {
        kunci: "kebutuhanKhusus",
        label: "Kebutuhan khusus",
        jenis: "pilihan",
        pilihan: KEBUTUHAN_KHUSUS,
      },
      {
        kunci: "anakKe",
        label: "Anak ke-",
        jenis: "angka",
        inputMode: "numeric",
      },
      {
        kunci: "jumlahSaudara",
        label: "Jumlah saudara kandung",
        jenis: "angka",
        inputMode: "numeric",
      },
      { kunci: "hpSiswa", label: "HP siswa", maks: 20, inputMode: "tel" },
      {
        kunci: "emailSiswa",
        label: "Email siswa",
        maks: 120,
        inputMode: "email",
      },
    ],
  },
  {
    judul: "Alamat",
    isian: [
      { kunci: "rt", label: "RT", maks: 3, inputMode: "numeric" },
      { kunci: "rw", label: "RW", maks: 3, inputMode: "numeric" },
      { kunci: "dusun", label: "Dusun", maks: 80 },
      { kunci: "kelurahan", label: "Kelurahan/desa", maks: 80 },
      { kunci: "kecamatan", label: "Kecamatan", maks: 80 },
      { kunci: "kodePos", label: "Kode pos", maks: 5, inputMode: "numeric" },
      {
        kunci: "jenisTinggal",
        label: "Tinggal bersama",
        jenis: "pilihan",
        pilihan: JENIS_TINGGAL,
      },
      {
        kunci: "transportasi",
        label: "Alat transportasi",
        jenis: "pilihan",
        pilihan: ALAT_TRANSPORTASI,
      },
      {
        kunci: "jarakKm",
        label: "Jarak ke sekolah (km)",
        jenis: "angka",
        inputMode: "decimal",
      },
    ],
  },
  {
    judul: "Keluarga",
    isian: [{ kunci: "noKk", label: "No KK", maks: 16, inputMode: "numeric" }],
  },
  { judul: "Ayah", isian: orangTua("ayah", "ayah") },
  { judul: "Ibu", isian: orangTua("ibu", "ibu kandung") },
  { judul: "Wali", isian: orangTua("wali", "wali") },
  {
    judul: "Bantuan",
    isian: [
      { kunci: "kps", label: "Penerima KPS/PKH", jenis: "yaTidak" },
      { kunci: "noKps", label: "No KPS/PKH", maks: 40 },
      { kunci: "kip", label: "Penerima KIP", jenis: "yaTidak" },
      { kunci: "noKip", label: "No KIP", maks: 40 },
      { kunci: "namaKip", label: "Nama di KIP", maks: 120 },
      { kunci: "noKks", label: "No KKS", maks: 40 },
    ],
  },
  {
    judul: "Periodik",
    isian: [
      {
        kunci: "beratKg",
        label: "Berat (kg)",
        jenis: "angka",
        inputMode: "decimal",
      },
      {
        kunci: "tinggiCm",
        label: "Tinggi (cm)",
        jenis: "angka",
        inputMode: "decimal",
      },
      {
        kunci: "lingkarKepalaCm",
        label: "Lingkar kepala (cm)",
        jenis: "angka",
        inputMode: "decimal",
      },
    ],
  },
];

const LABEL_ISIAN = new Map(
  KELOMPOK.flatMap((k) => k.isian.map((i) => [i.kunci, i.label] as const)),
);
const KUNCI_ATAS = new Set(["tempatLahir", "tanggalLahir", "sekolahAsal"]);

type Draf = Record<string, string>;

function drafDariBaris(baris: BarisDapodikSiswa | null | undefined): Draf {
  const d: Record<string, unknown> = uraiDataDapodik(baris?.data_dapodik) ?? {};
  const draf: Draf = {
    tempatLahir: baris?.tempat_lahir ?? "",
    tanggalLahir: baris?.tanggal_lahir ?? "",
    sekolahAsal: baris?.sekolah_asal ?? "",
  };
  for (const { isian } of KELOMPOK) {
    for (const { kunci } of isian) {
      if (KUNCI_ATAS.has(kunci)) continue;
      const nilai = d[kunci];
      draf[kunci] =
        nilai === true
          ? "Ya"
          : nilai === false
            ? "Tidak"
            : nilai === null || nilai === undefined
              ? ""
              : String(nilai);
    }
  }
  return draf;
}

function dataDariDraf(draf: Draf): Record<string, string> {
  return Object.fromEntries(
    Object.entries(draf).filter(([kunci]) => !KUNCI_ATAS.has(kunci)),
  );
}

/**
 * Data DAPODIK siswa yang tampil, dimuat dari cloud sekali per siswa. Siswa
 * tanpa baris tercatat `null`; `muatUlang(id)` dipanggil setelah simpan.
 */
export function useDapodikSiswa(ids: readonly string[], aktif: boolean) {
  const [peta, setPeta] = useState<
    ReadonlyMap<string, BarisDapodikSiswa | null>
  >(new Map());
  const [galat, setGalat] = useState<string | null>(null);
  const dimintaRef = useRef(new Set<string>());

  const muat = useCallback(async (daftar: readonly string[]) => {
    if (daftar.length === 0) return;
    for (const id of daftar) dimintaRef.current.add(id);
    try {
      const baris = await daftarDapodikSiswa(daftar);
      const ketemu = new Map(baris.map((b) => [b.id_siswa, b]));
      setPeta((lama) => {
        const baru = new Map(lama);
        for (const id of daftar) baru.set(id, ketemu.get(id) ?? null);
        return baru;
      });
      setGalat(null);
    } catch (err) {
      for (const id of daftar) dimintaRef.current.delete(id);
      setGalat(
        err instanceof Error ? err.message : "Data DAPODIK gagal dimuat.",
      );
    }
  }, []);

  const kunci = ids.join("\u0000");
  useEffect(() => {
    if (!aktif) return;
    const belum = (kunci ? kunci.split("\u0000") : []).filter(
      (id) => !dimintaRef.current.has(id),
    );
    void muat(belum);
  }, [aktif, kunci, muat]);

  const muatUlang = useCallback((id: string) => muat([id]), [muat]);
  return { peta, galat, muatUlang };
}

/** Penanda kelengkapan di daftar siswa; membuka modal saat ditekan. */
export function LencanaDapodik({
  baris,
  onBuka,
}: {
  baris: BarisDapodikSiswa | null | undefined;
  onBuka: () => void;
}) {
  if (baris === undefined) return null;
  const kurang = isianKurangDapodik(baris).length;
  return (
    <button
      className={`mt-1 inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-semibold ${
        kurang === 0
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300"
      }`}
      onClick={onBuka}
      type="button"
    >
      {kurang === 0 ? "DAPODIK lengkap" : `DAPODIK kurang ${kurang} isian`}
    </button>
  );
}

export function ModalDapodikSiswa({
  siswa,
  baris,
  bisaUbah,
  onClose,
  onTersimpan,
}: {
  siswa: Siswa;
  baris: BarisDapodikSiswa | null | undefined;
  bisaUbah: boolean;
  onClose: () => void;
  onTersimpan: (pesan: string) => void;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const [draf, setDraf] = useState<Draf>(() => drafDariBaris(baris));
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState(false);
  const prosesRef = useRef(false);
  const idSiswa = String(siswa.id_siswa ?? "");

  const kurang = useMemo(
    () =>
      isianKurangDapodik({
        id_siswa: idSiswa,
        tempat_lahir: draf.tempatLahir,
        tanggal_lahir: draf.tanggalLahir,
        sekolah_asal: draf.sekolahAsal,
        data_dapodik: JSON.stringify(dataDariDraf(draf)),
        diubah_oleh: null,
        updated_at: null,
      }),
    [draf, idSiswa],
  );

  async function jalankan(aksi: () => Promise<void>, pesan: string) {
    if (prosesRef.current) return;
    prosesRef.current = true;
    setProses(true);
    setGalat(null);
    try {
      await aksi();
      onTersimpan(pesan);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      prosesRef.current = false;
      setProses(false);
    }
  }

  const simpan = () =>
    jalankan(
      () =>
        simpanDapodikSiswa({
          idSiswa,
          tempatLahir: draf.tempatLahir,
          tanggalLahir: draf.tanggalLahir,
          sekolahAsal: draf.sekolahAsal,
          data: dataDariDraf(draf),
        }),
      `Data DAPODIK ${String(siswa.nama_lengkap ?? "")} tersimpan.`,
    );

  async function kosongkan() {
    const setuju = await konfirmasi({
      title: "Kosongkan data DAPODIK?",
      description: `Semua isian DAPODIK ${String(siswa.nama_lengkap ?? "")} dihapus.`,
      preserved:
        "Data siswa, rombel, QR, dan arsip formulir PMB-nya tidak berubah.",
      confirmLabel: "Kosongkan",
      tone: "danger",
    });
    if (!setuju) return;
    await jalankan(
      () => kosongkanDapodikSiswa(idSiswa),
      `Data DAPODIK ${String(siswa.nama_lengkap ?? "")} dikosongkan.`,
    );
  }

  const ubah = (kunci: string, nilai: string) =>
    setDraf((lama) => ({ ...lama, [kunci]: nilai }));

  return (
    <Modal
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {bisaUbah && baris ? (
            <button
              className={TOMBOL_BAHAYA}
              disabled={proses}
              onClick={() => void kosongkan()}
              type="button"
            >
              Kosongkan
            </button>
          ) : null}
          <button className={TOMBOL_KEDUA} onClick={onClose} type="button">
            {bisaUbah ? "Batal" : "Tutup"}
          </button>
          {bisaUbah ? (
            <button
              className={TOMBOL_UTAMA}
              disabled={proses}
              onClick={() => void simpan()}
              type="button"
            >
              {proses ? "Menyimpan..." : "Simpan"}
            </button>
          ) : null}
        </div>
      }
      isOpen
      maxWidth="max-w-3xl"
      onClose={onClose}
      subtitle={`NISN ${String(siswa.nisn || "-")} · NIS ${String(siswa.nis || "-")}`}
      title={`Data DAPODIK: ${String(siswa.nama_lengkap ?? "")}`}
    >
      <div className="space-y-5 text-sm">
        <p className="text-slate-400">
          {kurang.length === 0
            ? "Semua isian wajib DAPODIK sudah terisi."
            : `Kurang ${kurang.length} isian: ${kurang
                .map((k) => LABEL_ISIAN.get(k) ?? k)
                .join(", ")}.`}{" "}
          Nama, NISN, jenis kelamin, dan alamat jalan diambil dari data siswa
          {siswa.alamat ? ` (${String(siswa.alamat)})` : ""}.
        </p>
        {galat ? (
          <p
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-300"
            role="alert"
          >
            {galat}
          </p>
        ) : null}
        <fieldset className="space-y-5" disabled={!bisaUbah || proses}>
          {KELOMPOK.map((kelompok) => (
            <div key={kelompok.judul}>
              <h3 className="mb-2 font-semibold text-white text-xs uppercase">
                {kelompok.judul}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {kelompok.isian.map((isian) => {
                  const id = `dapodik-${isian.kunci}`;
                  const nilai = draf[isian.kunci] ?? "";
                  return (
                    <div key={isian.kunci}>
                      <label className={LABEL} htmlFor={id}>
                        {isian.label}
                      </label>
                      {isian.jenis === "pilihan" ||
                      isian.jenis === "yaTidak" ? (
                        <select
                          className={INPUT}
                          id={id}
                          onChange={(e) => ubah(isian.kunci, e.target.value)}
                          value={nilai}
                        >
                          <option value="">(Belum diisi)</option>
                          {(isian.jenis === "yaTidak"
                            ? ["Ya", "Tidak"]
                            : (isian.pilihan ?? [])
                          ).map((pilihan) => (
                            <option key={pilihan} value={pilihan}>
                              {pilihan}
                            </option>
                          ))}
                          {/* Nilai lama di luar daftar tetap terlihat, dan ditolak saat disimpan. */}
                          {nilai &&
                          isian.jenis === "pilihan" &&
                          !isian.pilihan?.includes(nilai) ? (
                            <option value={nilai}>{nilai}</option>
                          ) : null}
                        </select>
                      ) : (
                        <input
                          autoComplete="off"
                          className={INPUT}
                          id={id}
                          inputMode={isian.inputMode}
                          maxLength={isian.maks}
                          onChange={(e) => ubah(isian.kunci, e.target.value)}
                          type={isian.jenis === "tanggal" ? "date" : "text"}
                          value={nilai}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
        {baris?.diubah_oleh ? (
          <p className="text-slate-500 text-xs">
            Terakhir diubah{" "}
            {baris.diubah_oleh === "PMB"
              ? "dari formulir PMB"
              : `oleh ${baris.diubah_oleh}`}
            {baris.updated_at ? ` pada ${baris.updated_at} WIB` : ""}.
          </p>
        ) : null}
      </div>
      {dialogKonfirmasi}
    </Modal>
  );
}

/**
 * Ekspor siswa ke Excel berformat "daftar_pd" DAPODIK: yang dicentang, atau
 * semua yang tampil bila tidak ada yang dicentang. Data DAPODIK dibaca ulang
 * dari cloud supaya berkasnya memuat perubahan terakhir perangkat lain.
 */
export function TombolEksporDapodikSiswa({
  siswa,
  className,
  onSelesai,
}: {
  siswa: readonly Siswa[];
  className: string;
  onSelesai: (hasil: { tone: "success" | "error"; message: string }) => void;
}) {
  const [proses, setProses] = useState(false);

  async function ekspor() {
    if (proses) return;
    if (siswa.length === 0) {
      onSelesai({
        tone: "error",
        message: "Tidak ada peserta didik untuk diekspor.",
      });
      return;
    }
    setProses(true);
    try {
      const peta = new Map(
        (await daftarDapodikSiswa(siswa.map((s) => String(s.id_siswa)))).map(
          (b) => [b.id_siswa, b],
        ),
      );
      const baris = siswa.map((s, i) => {
        const d = peta.get(String(s.id_siswa));
        return barisEksporDapodik(
          {
            nomor_pendaftaran: "",
            nama_lengkap: String(s.nama_lengkap ?? ""),
            jenis_kelamin: (s.jenis_kelamin as string | null) ?? null,
            nisn: (s.nisn as string | null) ?? null,
            tempat_lahir: d?.tempat_lahir ?? null,
            tanggal_lahir: d?.tanggal_lahir ?? null,
            alamat: (s.alamat as string | null) ?? null,
            asal_sekolah: d?.sekolah_asal ?? null,
            status: "",
            data_dapodik: d?.data_dapodik ?? null,
            nipd: (s.nis as string | null) ?? null,
            rombel: (s.nama_rombel as string | null) ?? null,
          },
          i + 1,
        );
      });
      const isi = createXlsxBuffer(
        JUDUL_EKSPOR_DAPODIK.baris1,
        [JUDUL_EKSPOR_DAPODIK.baris2, ...baris],
        "Daftar PD",
      );
      const hasil = await saveFileWithPicker(
        new Blob([isi as unknown as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "siswa-format-dapodik.xlsx",
        {
          description: "Excel Spreadsheet (*.xlsx)",
          accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              [".xlsx"],
          },
        },
      );
      if (!hasil.cancelled) {
        onSelesai(
          hasil.sukses
            ? {
                tone: "success",
                message: `${baris.length} peserta didik diekspor ke format DAPODIK${hasil.path ? ` di: ${hasil.path}` : ""}.`,
              }
            : { tone: "error", message: "Berkas ekspor gagal disimpan." },
        );
      }
    } catch (err) {
      onSelesai({
        tone: "error",
        message: err instanceof Error ? err.message : "Ekspor DAPODIK gagal.",
      });
    } finally {
      setProses(false);
    }
  }

  return (
    <button
      className={className}
      disabled={proses}
      onClick={() => void ekspor()}
      type="button"
    >
      {proses ? "Menyiapkan..." : "Ekspor DAPODIK"}
    </button>
  );
}
