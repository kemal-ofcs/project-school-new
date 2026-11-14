"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { saveFileWithPicker } from "@/lib/client/download";
import { siapkanBerkas } from "@/lib/client/siapkan-berkas";
import {
  ambilBerkasDokumen,
  type DaftarDokumen,
  type DokumenBaris,
  hapusBerkasDokumen,
  hapusDokumen,
  type IsiBerkasDokumen,
  muatDokumen,
  simpanDokumen,
  tambahBerkasDokumen,
} from "@/lib/gateways/hris";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { MIME_BERKAS_SEKOLAH } from "@/lib/validations/berkas-sekolah";
import { MAKS_BERKAS_DOKUMEN, MAKS_BYTE_DOKUMEN } from "@/lib/validations/hris";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

const kb = (byte: number) => Math.ceil(byte / 1024);

/**
 * Dokumen pegawai (cloud-only, §19.2.5): data dokumen wajib, berkas
 * opsional (JPG/PNG/WEBP/PDF, maks 1 MB, 5 per dokumen). Daftar tidak membawa
 * isi berkas; isinya diambil saat dibuka.
 */
export function DokumenPegawai({
  idKaryawan,
  bolehUbah,
}: {
  idKaryawan: string;
  bolehUbah: boolean;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const [data, setData] = useState<DaftarDokumen | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [sunting, setSunting] = useState<DokumenBaris | "baru" | null>(null);
  const [dibuka, setDibuka] = useState<IsiBerkasDokumen | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatDokumen(idKaryawan));
      setGalatMuat(null);
    } catch (error) {
      setGalatMuat(pesanGalat(error));
    }
  }, [idKaryawan]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (
    kunci: string,
    aksi: () => Promise<string | null>,
  ) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setProses(kunci);
    setKabar(null);
    setGalat(null);
    try {
      const pesan = await aksi();
      if (pesan) setKabar(pesan);
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setProses(null);
    }
  };

  const unggah = (dokumen: DokumenBaris, masukan: HTMLInputElement) => {
    const file = masukan.files?.[0];
    // Dikosongkan supaya memilih berkas yang sama lagi tetap memicu onChange.
    masukan.value = "";
    if (!file) return;
    void jalankan(`unggah-${dokumen.id_dokumen}`, async () => {
      const siap = await siapkanBerkas(file, MAKS_BYTE_DOKUMEN);
      if (!siap.ok) throw new Error(siap.pesan);
      await tambahBerkasDokumen({
        id_dokumen: dokumen.id_dokumen,
        nama_berkas: siap.berkas.namaFile,
        mime_type: siap.berkas.mime,
        data_base64: siap.berkas.kontenBase64,
      });
      await muat();
      return `${siap.berkas.namaFile} tersimpan (${kb(siap.berkas.ukuranByte)} KB).`;
    });
  };

  const buang = async (
    judul: string,
    keterangan: string,
    kunci: string,
    aksi: () => Promise<unknown>,
  ) => {
    const setuju = await konfirmasi({
      title: `Hapus ${judul}?`,
      description: keterangan,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!setuju) return;
    await jalankan(kunci, async () => {
      await aksi();
      setDibuka(null);
      await muat();
      return `${judul} dihapus.`;
    });
  };

  if (galatMuat) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300" role="alert">
          {galatMuat}
        </p>
        <button type="button" className={TOMBOL} onClick={() => void muat()}>
          Coba lagi
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Memuat…</p>;

  const dokumen = data.dokumen ?? [];
  const berkas = data.berkas ?? [];

  return (
    <div className="space-y-4 text-sm">
      {dialogKonfirmasi}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">
          Foto dipadatkan otomatis. Tiap berkas maksimal {kb(MAKS_BYTE_DOKUMEN)}{" "}
          KB, {MAKS_BERKAS_DOKUMEN} berkas per dokumen.
        </p>
        {bolehUbah ? (
          <button
            type="button"
            className={TOMBOL}
            onClick={() => setSunting("baru")}
          >
            Tambah dokumen
          </button>
        ) : null}
      </div>
      {kabar ? (
        <output className="block text-emerald-300">{kabar}</output>
      ) : null}
      {galat ? (
        <p className="text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}

      {sunting ? (
        <FormDokumen
          key={sunting === "baru" ? "baru" : sunting.id_dokumen}
          awal={sunting === "baru" ? null : sunting}
          jenis={data.jenis}
          menyimpan={proses !== null}
          onBatal={() => setSunting(null)}
          onSimpan={(draft) =>
            void jalankan("simpan", async () => {
              await simpanDokumen({
                ...draft,
                id: sunting === "baru" ? undefined : sunting.id_dokumen,
                id_karyawan: idKaryawan,
              });
              setSunting(null);
              await muat();
              return "Dokumen tersimpan.";
            })
          }
        />
      ) : null}

      <ul className="space-y-2">
        {dokumen.map((d) => {
          const milik = berkas.filter((b) => b.id_dokumen === d.id_dokumen);
          return (
            <li
              key={d.id_dokumen}
              className="space-y-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span>
                  <span className="font-semibold text-white">{d.jenis}</span>
                  <span className="text-slate-400">
                    {d.nomor ? ` · ${d.nomor}` : ""} · terbit {d.tanggal_terbit}
                    {d.tanggal_kedaluwarsa
                      ? ` · berlaku s.d. ${d.tanggal_kedaluwarsa}`
                      : ""}
                  </span>
                  {d.catatan ? (
                    <span className="block text-xs text-slate-400">
                      {d.catatan}
                    </span>
                  ) : null}
                </span>
                {bolehUbah ? (
                  <span className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() => setSunting(d)}
                    >
                      Ubah
                    </button>
                    {milik.length < MAKS_BERKAS_DOKUMEN ? (
                      <label
                        className={`${TOMBOL} relative inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-sky-500 ${proses !== null ? "pointer-events-none opacity-60" : ""}`}
                      >
                        {proses === `unggah-${d.id_dokumen}`
                          ? "Mengunggah..."
                          : "Unggah berkas"}
                        <input
                          type="file"
                          accept={MIME_BERKAS_SEKOLAH.join(",")}
                          className="sr-only"
                          disabled={proses !== null}
                          onChange={(e) => unggah(d, e.currentTarget)}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className={TOMBOL}
                      disabled={proses !== null}
                      onClick={() =>
                        void buang(
                          `dokumen ${d.jenis}`,
                          `Dokumen dan ${milik.length} berkasnya dihapus permanen dari database.`,
                          `hapus-${d.id_dokumen}`,
                          () => hapusDokumen(d.id_dokumen),
                        )
                      }
                    >
                      Hapus
                    </button>
                  </span>
                ) : null}
              </div>
              {milik.length > 0 ? (
                <ul className="space-y-1">
                  {milik.map((b) => (
                    <li
                      key={b.id_berkas}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300"
                    >
                      <span className="break-all">
                        {b.nama_berkas} · {kb(b.ukuran_byte)} KB
                      </span>
                      <span className="flex gap-2">
                        <button
                          type="button"
                          className={TOMBOL}
                          disabled={proses !== null}
                          onClick={() =>
                            void jalankan(b.id_berkas, async () => {
                              setDibuka(await ambilBerkasDokumen(b.id_berkas));
                              return null;
                            })
                          }
                        >
                          {proses === b.id_berkas ? "Memuat..." : "Lihat"}
                        </button>
                        {bolehUbah ? (
                          <button
                            type="button"
                            className={TOMBOL}
                            disabled={proses !== null}
                            onClick={() =>
                              void buang(
                                b.nama_berkas,
                                "Berkas ini dihapus permanen; data dokumennya tetap.",
                                `hapus-${b.id_berkas}`,
                                () => hapusBerkasDokumen(b.id_berkas),
                              )
                            }
                          >
                            Hapus berkas
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
        {dokumen.length === 0 ? (
          <li className="text-slate-400">Belum ada dokumen.</li>
        ) : null}
      </ul>

      {dibuka ? (
        <div className="space-y-2 rounded-xl border border-white/10 p-2">
          <p className="break-all text-xs text-slate-300">
            {dibuka.nama_berkas}
          </p>
          {dibuka.mime_type === "application/pdf" ? (
            <p className="text-xs text-slate-400">
              Pratinjau PDF tidak tersedia di sini. Simpan ke perangkat untuk
              membukanya.
            </p>
          ) : (
            // biome-ignore lint/performance/noImgElement: sumbernya data URI dari cloud, bukan aset statis yang bisa dioptimalkan
            <img
              alt={`Berkas ${dibuka.nama_berkas}`}
              className="max-h-[50vh] w-full rounded-lg object-contain"
              src={`data:${dibuka.mime_type};base64,${dibuka.data_base64}`}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={TOMBOL}
              disabled={proses !== null}
              onClick={() =>
                void jalankan(`unduh-${dibuka.id_berkas}`, async () => {
                  await saveFileWithPicker(
                    `data:${dibuka.mime_type};base64,${dibuka.data_base64}`,
                    dibuka.nama_berkas,
                  );
                  return null;
                })
              }
            >
              Simpan ke perangkat
            </button>
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setDibuka(null)}
            >
              Tutup pratinjau
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FormDokumen({
  awal,
  jenis,
  menyimpan,
  onBatal,
  onSimpan,
}: {
  awal: DokumenBaris | null;
  jenis: DaftarDokumen["jenis"];
  menyimpan: boolean;
  onBatal: () => void;
  onSimpan: (draft: {
    id_jenis: string;
    nomor: string;
    tanggal_terbit: string;
    tanggal_kedaluwarsa: string;
    catatan: string;
  }) => void;
}) {
  const [idJenis, setIdJenis] = useState(awal?.id_jenis ?? "");
  const [nomor, setNomor] = useState(awal?.nomor ?? "");
  const [terbit, setTerbit] = useState(awal?.tanggal_terbit ?? "");
  const [kedaluwarsa, setKedaluwarsa] = useState(
    awal?.tanggal_kedaluwarsa ?? "",
  );
  const [catatan, setCatatan] = useState(awal?.catatan ?? "");
  // Jenis nonaktif tetap terpilih pada dokumen lama, tetapi tidak ditawarkan.
  const pilihan = jenis.filter(
    (j) => j.is_aktif === 1 || j.id_jenis === awal?.id_jenis,
  );
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan({
      id_jenis: idJenis,
      nomor,
      tanggal_terbit: terbit,
      tanggal_kedaluwarsa: kedaluwarsa,
      catatan,
    });
  };
  return (
    <form
      onSubmit={kirim}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-sky-500/30 p-3 sm:grid-cols-2"
    >
      <h3 className="font-semibold text-white sm:col-span-2">
        {awal ? "Ubah dokumen" : "Tambah dokumen"}
      </h3>
      <div>
        <label htmlFor="dok-jenis" className={LABEL}>
          Jenis dokumen
        </label>
        <select
          id="dok-jenis"
          required
          value={idJenis}
          onChange={(e) => setIdJenis(e.target.value)}
          className={INPUT}
        >
          <option value="">Pilih jenis</option>
          {pilihan.map((j) => (
            <option key={j.id_jenis} value={j.id_jenis}>
              {j.nama}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="dok-nomor" className={LABEL}>
          Nomor (opsional)
        </label>
        <input
          id="dok-nomor"
          maxLength={80}
          value={nomor}
          onChange={(e) => setNomor(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="dok-terbit" className={LABEL}>
          Tanggal terbit
        </label>
        <input
          id="dok-terbit"
          type="date"
          required
          value={terbit}
          onChange={(e) => setTerbit(e.target.value)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="dok-kedaluwarsa" className={LABEL}>
          Berlaku sampai (opsional)
        </label>
        <input
          id="dok-kedaluwarsa"
          type="date"
          value={kedaluwarsa}
          onChange={(e) => setKedaluwarsa(e.target.value)}
          className={INPUT}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="dok-catatan" className={LABEL}>
          Catatan
        </label>
        <input
          id="dok-catatan"
          maxLength={500}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          className={INPUT}
        />
      </div>
      <p className="text-xs text-slate-400 sm:col-span-2">
        Berkas pindaian diunggah sesudah dokumen tersimpan.
      </p>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className={TOMBOL} onClick={onBatal}>
          Batal
        </button>
        <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
          Simpan
        </button>
      </div>
    </form>
  );
}
