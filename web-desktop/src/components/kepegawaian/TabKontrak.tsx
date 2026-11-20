"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import {
  batalKontrak,
  type DaftarKontrak,
  type KontrakBaris,
  muatKontrak,
  type OrgKepegawaian,
  type PegawaiKepegawaian,
  simpanKontrak,
} from "@/lib/gateways/hris";
import { kontrakSah, STATUS_KONTRAK } from "@/lib/validations/hris";
import {
  DialogCetakSurat,
  type PermintaanSurat,
  permintaanPengangkatan,
} from "./DialogCetakSurat";
import {
  INPUT,
  LABEL,
  PERINGATAN,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
  tgl,
} from "./gaya";

const STATUS_GURU = ["GTY", "GTT", "Honorer", "PNS", "PPPK"];
const STATUS_TENDIK = ["PTY", "PTT", "Honorer", "PNS", "PPPK"];

export function TabKontrak({
  org,
  bolehUbah,
  bolehCetak,
  onPesan,
  onGalat,
}: {
  org: OrgKepegawaian;
  bolehUbah: boolean;
  /** `hr.duty.manage`: SK Pengangkatan untuk kontrak GTY/PTY sah (§21.5). */
  bolehCetak: boolean;
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
}) {
  const [data, setData] = useState<DaftarKontrak | null>(null);
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<string | null>(null);
  const [tambah, setTambah] = useState<PegawaiKepegawaian | null>(null);
  const [batal, setBatal] = useState<KontrakBaris | null>(null);
  const [cetak, setCetak] = useState<PermintaanSurat | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatKontrak());
    } catch (error) {
      onGalat(pesanGalat(error));
    }
  }, [onGalat]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (aksi: () => Promise<unknown>, berhasil: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await aksi();
      setTambah(null);
      setBatal(null);
      onPesan(berhasil);
      await muat();
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  if (!data) return <p className="text-sm text-slate-400">Memuat kontrak…</p>;

  const ringkas = new Map(data.ringkas.map((r) => [r.id_karyawan, r]));
  const dibatalkan = new Set(data.dibatalkan);
  const alasanBatal = new Map(
    data.kontrak
      .filter((k) => k.status === "Pembatalan")
      .map((k) => [k.id_ref, k.catatan]),
  );
  const aturan = data.pengaturan.berlaku;
  const labelTanda = (t: string) =>
    t === "percobaan_lewat"
      ? `Masa percobaan lebih dari ${aturan.percobaan_maks_bulan} bulan`
      : `GTT/PTT berturut-turut lebih dari ${aturan.pkwt_maks_bulan} bulan`;
  const kunci = cari.trim().toLowerCase();
  const pegawai = org.pegawai.filter(
    (p) =>
      kunci === "" ||
      p.nama.toLowerCase().includes(kunci) ||
      p.kode_karyawan.toLowerCase().includes(kunci),
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Status kepegawaian diturunkan dari kontrak terakhir. Kontrak tidak
        pernah dihapus; salah input dibatalkan dengan alasan.
      </p>
      <div>
        <label htmlFor="cari-kontrak" className={LABEL}>
          Cari pegawai
        </label>
        <input
          id="cari-kontrak"
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          className={INPUT}
          placeholder="Nama atau kode"
        />
      </div>
      <ul className="space-y-2">
        {pegawai.map((p) => {
          const r = ringkas.get(p.id_unik);
          const riwayat = data.kontrak.filter(
            (k) => k.id_karyawan === p.id_unik && k.status !== "Pembatalan",
          );
          return (
            <li
              key={p.id_unik}
              className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-white">{p.nama}</span>
                  <span className="text-slate-400"> · {p.kelompok}</span>
                  <span className="block text-slate-300">
                    {r && r.keadaan !== "Tanpa kontrak"
                      ? `${r.status} · ${r.keadaan}${r.sampai ? ` sampai ${tgl(r.sampai)}` : ""}${r.percobaan_sampai ? ` · percobaan sampai ${tgl(r.percobaan_sampai)}` : ""}`
                      : `Tanpa kontrak${p.status_kepegawaian ? ` · status ${p.status_kepegawaian}` : ""}`}
                  </span>
                  {r?.tanda.map((t) => (
                    <span key={t} className="block text-xs text-amber-200">
                      {labelTanda(t)}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {riwayat.length > 0 ? (
                    <button
                      type="button"
                      className={TOMBOL}
                      aria-expanded={buka === p.id_unik}
                      onClick={() =>
                        setBuka(buka === p.id_unik ? null : p.id_unik)
                      }
                    >
                      Riwayat ({riwayat.length})
                    </button>
                  ) : null}
                  {bolehUbah ? (
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() => setTambah(p)}
                    >
                      Tambah kontrak
                    </button>
                  ) : null}
                </div>
              </div>
              {buka === p.id_unik ? (
                <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
                  {riwayat.map((k) => (
                    <li
                      key={k.id_kontrak}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span
                        className={
                          dibatalkan.has(k.id_kontrak)
                            ? "text-slate-500 line-through"
                            : "text-slate-200"
                        }
                      >
                        {k.status} · {tgl(k.tanggal_mulai)} s.d.{" "}
                        {k.tanggal_selesai
                          ? tgl(k.tanggal_selesai)
                          : "seterusnya"}
                        {k.nomor ? ` · ${k.nomor}` : ""}
                        {k.dicatat_oleh ? ` · dicatat ${k.dicatat_oleh}` : ""}
                      </span>
                      {dibatalkan.has(k.id_kontrak) ? (
                        <span className="text-xs text-slate-400">
                          Dibatalkan: {alasanBatal.get(k.id_kontrak)}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {bolehCetak &&
                          (k.status === "GTY" || k.status === "PTY") ? (
                            <button
                              type="button"
                              className={TOMBOL}
                              onClick={() =>
                                setCetak(permintaanPengangkatan(k, p.nama))
                              }
                            >
                              Cetak SK
                            </button>
                          ) : null}
                          {bolehUbah ? (
                            <button
                              type="button"
                              className={TOMBOL}
                              onClick={() => setBatal(k)}
                            >
                              Batalkan
                            </button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
        {pegawai.length === 0 ? (
          <li className="text-sm text-slate-400">Tidak ada pegawai.</li>
        ) : null}
      </ul>

      {tambah ? (
        <ModalKontrak
          pegawai={tambah}
          tanpaKontrakSah={
            kontrakSah(
              data.kontrak.filter((k) => k.id_karyawan === tambah.id_unik),
            ).length === 0
          }
          hariIni={data.hari_ini}
          menyimpan={menyimpan}
          onClose={() => setTambah(null)}
          onSimpan={(draft) =>
            jalankan(
              () => simpanKontrak(draft),
              `Kontrak ${draft.status} untuk ${tambah.nama} dicatat.`,
            )
          }
        />
      ) : null}
      {cetak ? (
        <DialogCetakSurat permintaan={cetak} onClose={() => setCetak(null)} />
      ) : null}
      {batal ? (
        <ModalBatal
          judul={`Batalkan kontrak ${batal.status}`}
          menyimpan={menyimpan}
          onClose={() => setBatal(null)}
          onBatal={(alasan) =>
            jalankan(
              () => batalKontrak(batal.id_kontrak, alasan),
              "Kontrak dibatalkan.",
            )
          }
        />
      ) : null}
    </div>
  );
}

function ModalKontrak({
  pegawai,
  tanpaKontrakSah,
  hariIni,
  menyimpan,
  onClose,
  onSimpan,
}: {
  pegawai: PegawaiKepegawaian;
  tanpaKontrakSah: boolean;
  hariIni: string;
  menyimpan: boolean;
  onClose: () => void;
  onSimpan: (draft: {
    id_karyawan: string;
    status: string;
    nomor: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    percobaan_selesai: string;
    catatan: string;
  }) => void;
}) {
  const [nilai, setNilai] = useState(() =>
    kontrakAwal(pegawai.kelompok, hariIni),
  );
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan({ id_karyawan: pegawai.id_unik, ...rapikanKontrak(nilai) });
  };
  return (
    <Modal title={`Kontrak ${pegawai.nama}`} onClose={onClose} hideFooter>
      <form className="space-y-4" onSubmit={kirim}>
        <IsianKontrak
          kelompok={pegawai.kelompok}
          nilai={nilai}
          onChange={setNilai}
        />
        {tanpaKontrakSah && nilai.tanggal_mulai > hariIni ? (
          <p className={PERINGATAN}>
            Ini kontrak pertama dan baru berlaku nanti. Status sebelum tanggal
            mulainya ikut menjadi {nilai.status} untuk gaji. Catat dulu kontrak
            yang sedang berjalan bila statusnya berbeda.
          </p>
        ) : null}
        {pegawai.kelompok === "Guru" ? (
          <p className="text-xs text-slate-400">
            Status di data guru ikut berubah dan isian statusnya di form guru
            terkunci selama ada kontrak.
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan kontrak
          </button>
        </div>
      </form>
    </Modal>
  );
}

export interface NilaiKontrak {
  status: string;
  nomor: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  percobaan_selesai: string;
  catatan: string;
}

export function kontrakAwal(
  kelompok: "Guru" | "Tendik",
  hariIni: string,
): NilaiKontrak {
  return {
    status: kelompok === "Guru" ? STATUS_GURU[0] : STATUS_TENDIK[0],
    nomor: "",
    tanggal_mulai: hariIni,
    tanggal_selesai: "",
    percobaan_selesai: "",
    catatan: "",
  };
}

/** Masa percobaan hanya untuk GTY/PTY; isian lain dibuang saat dikirim. */
export function rapikanKontrak(nilai: NilaiKontrak): NilaiKontrak {
  const percobaan = nilai.status === "GTY" || nilai.status === "PTY";
  return {
    ...nilai,
    percobaan_selesai: percobaan ? nilai.percobaan_selesai : "",
  };
}

/**
 * Isian satu kontrak: tab Kontrak dan kontrak pertama Jadikan personil
 * (HRIS Fase 7c). GTY/GTT hanya ditawarkan untuk Guru, PTY/PTT untuk Tendik.
 */
export function IsianKontrak({
  kelompok,
  nilai,
  onChange,
}: {
  kelompok: "Guru" | "Tendik";
  nilai: NilaiKontrak;
  onChange: (nilai: NilaiKontrak) => void;
}) {
  const pilihan = kelompok === "Guru" ? STATUS_GURU : STATUS_TENDIK;
  const ubah = (kunci: keyof NilaiKontrak, v: string) =>
    onChange({ ...nilai, [kunci]: v });
  const bolehPercobaan = nilai.status === "GTY" || nilai.status === "PTY";
  const wajibSelesai = nilai.status === "GTT" || nilai.status === "PTT";
  return (
    <>
      <div>
        <label htmlFor="kontrak-status" className={LABEL}>
          Status
        </label>
        <select
          id="kontrak-status"
          value={nilai.status}
          onChange={(e) => ubah("status", e.target.value)}
          className={INPUT}
        >
          {pilihan
            .filter((s) => (STATUS_KONTRAK as readonly string[]).includes(s))
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label htmlFor="kontrak-nomor" className={LABEL}>
          Nomor SK/kontrak
        </label>
        <input
          id="kontrak-nomor"
          maxLength={80}
          value={nilai.nomor}
          onChange={(e) => ubah("nomor", e.target.value)}
          className={INPUT}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="kontrak-mulai" className={LABEL}>
            Tanggal mulai
          </label>
          <input
            id="kontrak-mulai"
            type="date"
            required
            value={nilai.tanggal_mulai}
            onChange={(e) => ubah("tanggal_mulai", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="kontrak-selesai" className={LABEL}>
            Tanggal selesai{wajibSelesai ? "" : " (opsional)"}
          </label>
          <input
            id="kontrak-selesai"
            type="date"
            required={wajibSelesai}
            min={nilai.tanggal_mulai}
            value={nilai.tanggal_selesai}
            onChange={(e) => ubah("tanggal_selesai", e.target.value)}
            className={INPUT}
          />
        </div>
      </div>
      {bolehPercobaan ? (
        <div>
          <label htmlFor="kontrak-percobaan" className={LABEL}>
            Akhir masa percobaan (opsional)
          </label>
          <input
            id="kontrak-percobaan"
            type="date"
            min={nilai.tanggal_mulai}
            value={nilai.percobaan_selesai}
            onChange={(e) => ubah("percobaan_selesai", e.target.value)}
            className={INPUT}
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="kontrak-catatan" className={LABEL}>
          Catatan (opsional)
        </label>
        <textarea
          id="kontrak-catatan"
          maxLength={500}
          rows={2}
          value={nilai.catatan}
          onChange={(e) => ubah("catatan", e.target.value)}
          className={`${INPUT} py-2`}
        />
      </div>
    </>
  );
}

export function ModalBatal({
  judul,
  menyimpan,
  galat,
  onClose,
  onBatal,
}: {
  judul: string;
  menyimpan: boolean;
  /** Galat simpan, ditampilkan di dialog (banner halaman tertutup latarnya). */
  galat?: string | null;
  onClose: () => void;
  onBatal: (alasan: string) => void;
}) {
  const [alasan, setAlasan] = useState("");
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onBatal(alasan);
  };
  return (
    <Modal title={judul} onClose={onClose} hideFooter>
      <form className="space-y-4" onSubmit={kirim} data-tanpa-konfirmasi>
        <div>
          <label htmlFor="alasan-batal" className={LABEL}>
            Alasan pembatalan
          </label>
          <textarea
            id="alasan-batal"
            required
            maxLength={500}
            rows={3}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className={PERINGATAN}>
          Pembatalan tidak bisa ditarik kembali; datanya tetap tercatat sebagai
          dibatalkan.
        </p>
        {galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Kembali
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Batalkan
          </button>
        </div>
      </form>
    </Modal>
  );
}
