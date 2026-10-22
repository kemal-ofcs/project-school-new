"use client";

import { useRef, useState } from "react";
import { TOMBOL_BAHAYA, TOMBOL_KEDUA } from "@/components/inventory/gaya";
import { saveFileWithPicker } from "@/lib/client/download";
import { siapkanBerkas } from "@/lib/client/siapkan-berkas";
import type { BerkasKiriman } from "@/lib/gateways/berkas-sekolah";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import {
  JENIS_BERKAS_SEKOLAH,
  LABEL_JENIS_BERKAS,
  MAKS_BYTE_BERKAS,
  MIME_BERKAS_SEKOLAH,
} from "@/lib/validations/berkas-sekolah";
import type { PmbFileContent, PmbFileMeta } from "@/types/pmb";

/**
 * Daftar berkas per jenis dengan lihat, unggah/ganti, dan hapus (v59). Dipakai
 * detail pendaftar /pmb dan data siswa /siswa di Web/Desktop dan Mobile
 * (disalin lewat `filesToCopy`). Satu berkas per jenis; foto dipadatkan
 * `siapkanBerkas` sebelum dikirim.
 */
export function KelolaBerkas({
  berkas,
  bisaUbah,
  ambil,
  simpan,
  hapus,
  onBerubah,
}: {
  berkas: readonly PmbFileMeta[];
  bisaUbah: boolean;
  ambil: (idBerkas: string) => Promise<PmbFileContent>;
  simpan: (berkas: BerkasKiriman) => Promise<void>;
  hapus: (idBerkas: string) => Promise<void>;
  onBerubah: () => Promise<void> | void;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const [dibuka, setDibuka] = useState<PmbFileContent | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const prosesRef = useRef(false);

  async function jalankan(kunci: string, aksi: () => Promise<string | null>) {
    if (prosesRef.current) return;
    prosesRef.current = true;
    setProses(kunci);
    setKabar(null);
    setGalat(null);
    try {
      const pesan = await aksi();
      if (pesan) setKabar(pesan);
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Berkas gagal diproses.");
    } finally {
      prosesRef.current = false;
      setProses(null);
    }
  }

  const lihat = (meta: PmbFileMeta) =>
    jalankan(meta.id_berkas, async () => {
      setDibuka(await ambil(meta.id_berkas));
      return null;
    });

  function unggah(jenis: string, masukan: HTMLInputElement) {
    const file = masukan.files?.[0];
    // Dikosongkan supaya memilih berkas yang sama lagi tetap memicu onChange.
    masukan.value = "";
    if (!file) return;
    const label = LABEL_JENIS_BERKAS[jenis as keyof typeof LABEL_JENIS_BERKAS];
    void jalankan(jenis, async () => {
      const siap = await siapkanBerkas(file);
      if (!siap.ok) throw new Error(`${label}: ${siap.pesan}`);
      await simpan({ jenis, ...siap.berkas });
      setDibuka(null);
      await onBerubah();
      return `${label} tersimpan (${Math.ceil(siap.berkas.ukuranByte / 1024)} KB).`;
    });
  }

  async function buang(meta: PmbFileMeta) {
    const label =
      LABEL_JENIS_BERKAS[meta.jenis as keyof typeof LABEL_JENIS_BERKAS] ??
      meta.jenis;
    const setuju = await konfirmasi({
      title: `Hapus ${label}?`,
      description: `${meta.nama_file} dihapus permanen dari database.`,
      preserved: "Berkas jenis lain dan data pendaftar/siswa tidak berubah.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!setuju) return;
    await jalankan(meta.id_berkas, async () => {
      await hapus(meta.id_berkas);
      if (dibuka?.id_berkas === meta.id_berkas) setDibuka(null);
      await onBerubah();
      return `${label} dihapus.`;
    });
  }

  const simpanKePerangkat = (isi: PmbFileContent) =>
    jalankan(`unduh-${isi.id_berkas}`, async () => {
      await saveFileWithPicker(
        `data:${isi.mime};base64,${isi.konten_base64}`,
        isi.nama_file,
      );
      return null;
    });

  return (
    <div className="space-y-2 text-sm">
      {dialogKonfirmasi}
      <p className="text-slate-400 text-xs">
        Foto dipadatkan otomatis. PDF maksimal{" "}
        {Math.round(MAKS_BYTE_BERKAS / 1024)} KB.
      </p>
      <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
        {JENIS_BERKAS_SEKOLAH.map((jenis) => {
          const milik = berkas.filter((b) => b.jenis === jenis);
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-2 p-2"
              key={jenis}
            >
              <div className="min-w-0">
                <p className="font-medium text-white">
                  {LABEL_JENIS_BERKAS[jenis]}
                </p>
                {milik.length === 0 ? (
                  <p className="text-slate-500 text-xs">Belum ada</p>
                ) : (
                  milik.map((b) => (
                    <p
                      className="break-all text-slate-400 text-xs"
                      key={b.id_berkas}
                    >
                      {b.nama_file} · {Math.ceil(b.ukuran_byte / 1024)} KB
                    </p>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {milik.map((b) => (
                  <button
                    className={TOMBOL_KEDUA}
                    disabled={proses !== null}
                    key={`lihat-${b.id_berkas}`}
                    onClick={() => void lihat(b)}
                    type="button"
                  >
                    {proses === b.id_berkas ? "Memuat..." : "Lihat"}
                  </button>
                ))}
                {bisaUbah ? (
                  <label
                    className={`${TOMBOL_KEDUA} inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-sky-500 ${proses !== null ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {proses === jenis
                      ? "Mengunggah..."
                      : milik.length > 0
                        ? "Ganti"
                        : "Unggah"}
                    <input
                      accept={MIME_BERKAS_SEKOLAH.join(",")}
                      className="sr-only"
                      disabled={proses !== null}
                      onChange={(e) => unggah(jenis, e.currentTarget)}
                      type="file"
                    />
                  </label>
                ) : null}
                {bisaUbah
                  ? milik.map((b) => (
                      <button
                        className={TOMBOL_BAHAYA}
                        disabled={proses !== null}
                        key={`hapus-${b.id_berkas}`}
                        onClick={() => void buang(b)}
                        type="button"
                      >
                        Hapus
                      </button>
                    ))
                  : null}
              </div>
            </li>
          );
        })}
      </ul>

      {kabar ? (
        <output className="block text-emerald-300 text-xs">{kabar}</output>
      ) : null}
      {galat ? (
        <p className="text-rose-300 text-xs" role="alert">
          {galat}
        </p>
      ) : null}

      {dibuka ? (
        <div className="space-y-2 rounded-lg border border-white/10 p-2">
          <p className="break-all text-slate-300 text-xs">
            {dibuka.nama_file} · {Math.ceil(dibuka.ukuran_byte / 1024)} KB
          </p>
          {dibuka.mime === "application/pdf" ? (
            <p className="text-slate-400 text-xs">
              Pratinjau PDF tidak tersedia di sini. Simpan ke perangkat untuk
              membukanya.
            </p>
          ) : (
            // biome-ignore lint/performance/noImgElement: sumbernya data URI dari cloud, bukan aset statis yang bisa dioptimalkan
            <img
              alt={`Berkas ${dibuka.nama_file}`}
              className="max-h-[60vh] w-full rounded-lg object-contain"
              src={`data:${dibuka.mime};base64,${dibuka.konten_base64}`}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={TOMBOL_KEDUA}
              disabled={proses !== null}
              onClick={() => void simpanKePerangkat(dibuka)}
              type="button"
            >
              Simpan ke perangkat
            </button>
            <button
              className={TOMBOL_KEDUA}
              onClick={() => setDibuka(null)}
              type="button"
            >
              Tutup pratinjau
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
