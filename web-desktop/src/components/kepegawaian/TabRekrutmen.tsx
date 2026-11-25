"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { PilihCari } from "@/components/ui/PilihCari";
import { siapkanBerkas } from "@/lib/client/siapkan-berkas";
import { getDaftarUnit } from "@/lib/gateways/academic";
import {
  ambilBerkasPelamar,
  hapusBerkasPelamar,
  hapusPelamar,
  muatKontrak,
  muatLowongan,
  muatPelamar,
  muatRincianPelamar,
  type OrgKepegawaian,
  type PegawaiKepegawaian,
  simpanLowongan,
  simpanPelamar,
  simpanTahapPelamar,
  tambahBerkasPelamar,
} from "@/lib/gateways/hris";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import type { PermissionKey as Permission } from "@/lib/rbac/catalog";
import { MIME_BERKAS_SEKOLAH } from "@/lib/validations/berkas-sekolah";
import {
  type DaftarLowongan,
  type IsiBerkasPelamar,
  idDariPelamar,
  KELOMPOK_LOWONGAN,
  type LowonganBaris,
  MAKS_BERKAS_PELAMAR,
  type PelamarBaris,
  type RincianPelamar,
  TAHAP_AKHIR,
  TAHAP_PROSES,
} from "@/lib/validations/hr-rekrutmen";
import { JENJANG, MAKS_BYTE_DOKUMEN } from "@/lib/validations/hris";
import { KONFIRMASI_HAPUS_PERMANEN } from "@/lib/validations/inventory";
import type { PermintaanSurat } from "./DialogCetakSurat";
import { DialogCetakSurat } from "./DialogCetakSurat";
import { DialogJadikanPersonil } from "./DialogJadikanPersonil";
import {
  INPUT,
  LABEL,
  PERINGATAN,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
  tgl,
} from "./gaya";
import { PratinjauBerkas } from "./PratinjauBerkas";
import { RincianPegawai } from "./RincianPegawai";
import { ModalBatal } from "./TabKontrak";

const SEMUA_TAHAP = [...TAHAP_PROSES, ...TAHAP_AKHIR] as const;
const SARAN_SUMBER = [
  "Brosur",
  "Media Sosial",
  "Situs Sekolah",
  "Referensi Guru/Pegawai",
  "Dinas",
  "Datang Langsung",
  "Lainnya",
];
const BADGE = "rounded-full border border-white/10 px-2 py-0.5 text-xs";
const WARNA_STATUS: Record<string, string> = {
  Dibuka: "text-emerald-300",
  Dijadwalkan: "text-sky-300",
  Ditutup: "text-slate-300",
  Diterima: "text-emerald-300",
  Ditolak: "text-rose-300",
  Mundur: "text-amber-200",
};

const kb = (byte: number) => Math.ceil(byte / 1024);
const tambahHari = (tanggal: string, hari: number) => {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
};
const prosesBerjalan = (status: string) =>
  (TAHAP_PROSES as readonly string[]).includes(status);

/**
 * Tab Rekrutmen (HRIS Fase 7c, §25.5): lowongan, pelamar per status, tahap,
 * CV, Jadikan personil / Lanjutkan, dan hapus permanen. Semua data khusus
 * cloud; status lowongan dan pelamar diturunkan backend. Tombol tulis hanya
 * tampil untuk pemegang izinnya; backend memeriksa ulang dari sesi.
 */
export function TabRekrutmen({
  org,
  boleh,
  onPesan,
  onGalat,
  onOrgBerubah,
}: {
  org: OrgKepegawaian;
  boleh: (izin: Permission) => boolean;
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
  /** Personil baru dibuat: daftar pegawai halaman dimuat ulang. */
  onOrgBerubah: () => Promise<void>;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const bolehKelola = boleh("hr.recruit.manage");
  const [data, setData] = useState<DaftarLowongan | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [sunting, setSunting] = useState<LowonganBaris | "baru" | null>(null);
  const [bukaLagi, setBukaLagi] = useState<LowonganBaris | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatLowongan());
      setGalatMuat(null);
    } catch (error) {
      setGalatMuat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (aksi: () => Promise<string>) => {
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalatModal(null);
    try {
      onPesan(await aksi());
      await muat();
      return true;
    } catch (error) {
      if (sunting || bukaLagi) setGalatModal(pesanGalat(error));
      else onGalat(pesanGalat(error));
      return false;
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const tutup = async (l: LowonganBaris) => {
    const setuju = await konfirmasi({
      title: `Tutup lowongan "${l.judul}"?`,
      description:
        "Pelamar tidak bisa ditambahkan lagi setelah hari ini. Data pelamar yang tidak menjadi personil dihapus permanen 12 bulan sesudah lowongan ditutup.",
      confirmLabel: "Tutup lowongan",
      tone: "warning",
    });
    if (!setuju) return;
    await jalankan(async () => {
      await simpanLowongan({ aksi: "tutup", id_lowongan: l.id_lowongan });
      return `Lowongan "${l.judul}" ditutup.`;
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
  if (!data) return <p className="text-sm text-slate-400">Memuat lowongan…</p>;

  const lowongan = data.lowongan.find((l) => l.id_lowongan === dipilih);
  if (lowongan) {
    return (
      <RincianLowongan
        lowongan={lowongan}
        org={org}
        hariIni={data.hari_ini}
        boleh={boleh}
        onKembali={() => setDipilih(null)}
        onBerubah={muat}
        onPesan={onPesan}
        onOrgBerubah={onOrgBerubah}
      />
    );
  }

  const batasSorot = tambahHari(data.hari_ini, 30);

  return (
    <div className="space-y-4">
      {dialogKonfirmasi}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          {data.lowongan.length} lowongan. Data pelamar yang tidak menjadi
          personil dihapus 12 bulan sesudah lowongannya ditutup.
        </p>
        {bolehKelola ? (
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => setSunting("baru")}
          >
            Tambah lowongan
          </button>
        ) : null}
      </div>
      <ul className="space-y-3">
        {data.lowongan.map((l) => {
          const diterima = l.per_status.Diterima ?? 0;
          const rincianStatus = SEMUA_TAHAP.filter((s) => l.per_status[s])
            .map((s) => `${s} ${l.per_status[s]}`)
            .join(" · ");
          return (
            <li
              key={l.id_lowongan}
              className="space-y-2 rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="font-semibold text-white">{l.judul}</span>{" "}
                  <span
                    className={`${BADGE} ${WARNA_STATUS[l.status] ?? "text-slate-300"}`}
                  >
                    {l.status}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {l.kelompok}
                    {l.unit ? ` · ${l.unit}` : " · Yayasan"}
                    {l.bagian ? ` · ${l.bagian}` : ""}
                    {l.jabatan ? ` · ${l.jabatan}` : ""} · buka{" "}
                    {tgl(l.tanggal_buka)}
                    {l.tanggal_tutup ? ` s.d. ${tgl(l.tanggal_tutup)}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    aria-label={`Pelamar lowongan ${l.judul}`}
                    onClick={() => setDipilih(l.id_lowongan)}
                  >
                    Pelamar
                  </button>
                  {bolehKelola ? (
                    <>
                      <button
                        type="button"
                        className={TOMBOL}
                        onClick={() => setSunting(l)}
                      >
                        Ubah
                      </button>
                      {l.status === "Ditutup" ? (
                        <button
                          type="button"
                          className={TOMBOL}
                          disabled={menyimpan}
                          onClick={() => setBukaLagi(l)}
                        >
                          Buka lagi
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={TOMBOL}
                          disabled={menyimpan}
                          onClick={() => void tutup(l)}
                        >
                          Tutup
                        </button>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
              <p className="text-slate-300">
                {l.pelamar} pelamar · Diterima {diterima} dari {l.jumlah}{" "}
                dibutuhkan
                {rincianStatus ? (
                  <span className="block text-xs text-slate-400">
                    {rincianStatus}
                  </span>
                ) : null}
              </p>
              {l.lewat_kuota ? (
                <p className="text-xs text-amber-200">
                  Pelamar yang diterima melebihi jumlah yang dibutuhkan.
                </p>
              ) : null}
              {l.pelamar_dihapus > 0 ? (
                <p className="text-xs text-slate-400">
                  {l.pelamar_dihapus} data pelamar sudah dihapus.
                </p>
              ) : null}
              {l.tanggal_hapus ? (
                <p
                  className={
                    l.tanggal_hapus <= batasSorot
                      ? PERINGATAN
                      : "text-xs text-slate-400"
                  }
                >
                  Data pelamar yang tidak menjadi personil dihapus pada{" "}
                  {tgl(l.tanggal_hapus)}.
                </p>
              ) : null}
            </li>
          );
        })}
        {data.lowongan.length === 0 ? (
          <li className="text-sm text-slate-400">Belum ada lowongan.</li>
        ) : null}
      </ul>

      {sunting ? (
        <FormLowongan
          awal={sunting === "baru" ? null : sunting}
          org={org}
          hariIni={data.hari_ini}
          menyimpan={menyimpan}
          galat={galatModal}
          onClose={() => setSunting(null)}
          onSimpan={async (draft) => {
            if (
              await jalankan(async () => {
                await simpanLowongan({ aksi: "simpan", ...draft });
                return `Lowongan "${draft.judul}" disimpan.`;
              })
            )
              setSunting(null);
          }}
        />
      ) : null}
      {bukaLagi ? (
        <ModalBukaLagi
          lowongan={bukaLagi}
          hariIni={data.hari_ini}
          menyimpan={menyimpan}
          galat={galatModal}
          onClose={() => setBukaLagi(null)}
          onBuka={async (tanggalTutup) => {
            if (
              await jalankan(async () => {
                await simpanLowongan({
                  aksi: "buka",
                  id_lowongan: bukaLagi.id_lowongan,
                  tanggal_tutup: tanggalTutup,
                });
                return `Lowongan "${bukaLagi.judul}" dibuka lagi.`;
              })
            )
              setBukaLagi(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface IsianLowongan {
  id_lowongan: string;
  judul: string;
  kelompok: string;
  unit: string;
  id_bagian: string;
  id_jabatan: string;
  jumlah: number;
  tanggal_buka: string;
  tanggal_tutup: string;
  keterangan: string;
}

function FormLowongan({
  awal,
  org,
  hariIni,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: {
  awal: LowonganBaris | null;
  org: OrgKepegawaian;
  hariIni: string;
  menyimpan: boolean;
  galat?: string | null;
  onClose: () => void;
  onSimpan: (draft: IsianLowongan) => void;
}) {
  const [nilai, setNilai] = useState<IsianLowongan>({
    id_lowongan: awal?.id_lowongan ?? "",
    judul: awal?.judul ?? "",
    kelompok: awal?.kelompok ?? "Guru",
    unit: awal?.unit ?? "",
    id_bagian: awal?.id_bagian ?? "",
    id_jabatan: awal?.id_jabatan ?? "",
    jumlah: awal?.jumlah ?? 1,
    tanggal_buka: awal?.tanggal_buka ?? hariIni,
    tanggal_tutup: awal?.tanggal_tutup ?? "",
    keterangan: awal?.keterangan ?? "",
  });
  const [unit, setUnit] = useState<string[]>([]);
  useEffect(() => {
    getDaftarUnit()
      .then((u) =>
        setUnit(
          u
            .filter((x) => Number(x.status_aktif) === 1)
            .map((x) => String(x.nama_unit)),
        ),
      )
      .catch(() => setUnit([]));
  }, []);
  const ubah = <K extends keyof IsianLowongan>(k: K, v: IsianLowongan[K]) =>
    setNilai((n) => ({ ...n, [k]: v }));
  const kelompokTerkunci = (awal?.pelamar ?? 0) > 0;
  // Pilihan nonaktif tetap tampil pada lowongan lama, tetapi tidak ditawarkan.
  const pilihUnit = [...new Set([...unit, ...(awal?.unit ? [awal.unit] : [])])];
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan(nilai);
  };
  return (
    <Modal
      title={awal ? "Ubah lowongan" : "Tambah lowongan"}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-xl"
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={kirim}>
        <div className="sm:col-span-2">
          <label htmlFor="low-judul" className={LABEL}>
            Judul
          </label>
          <input
            id="low-judul"
            required
            maxLength={100}
            placeholder="Guru Matematika SMP"
            value={nilai.judul}
            onChange={(e) => ubah("judul", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="low-kelompok" className={LABEL}>
            Kelompok
          </label>
          <select
            id="low-kelompok"
            value={nilai.kelompok}
            disabled={kelompokTerkunci}
            aria-describedby={
              kelompokTerkunci ? "low-kelompok-terkunci" : undefined
            }
            onChange={(e) => ubah("kelompok", e.target.value)}
            className={INPUT}
          >
            {KELOMPOK_LOWONGAN.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {kelompokTerkunci ? (
            <p
              id="low-kelompok-terkunci"
              className="mt-1 text-xs text-slate-400"
            >
              Tidak bisa diubah karena sudah ada pelamar.
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="low-jumlah" className={LABEL}>
            Jumlah dibutuhkan
          </label>
          <input
            id="low-jumlah"
            type="number"
            required
            min={1}
            max={99}
            value={nilai.jumlah}
            onChange={(e) => ubah("jumlah", Number(e.target.value))}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="low-unit" className={LABEL}>
            Unit
          </label>
          <PilihCari
            id="low-unit"
            value={nilai.unit}
            onChange={(e) => ubah("unit", e.target.value)}
            className={INPUT}
          >
            <option value="">Yayasan (tanpa unit)</option>
            {pilihUnit.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </PilihCari>
        </div>
        <div>
          <label htmlFor="low-bagian" className={LABEL}>
            Bagian (opsional)
          </label>
          <PilihCari
            id="low-bagian"
            value={nilai.id_bagian}
            onChange={(e) => ubah("id_bagian", e.target.value)}
            className={INPUT}
          >
            <option value="">Tidak ditentukan</option>
            {org.bagian
              .filter(
                (b) => b.is_aktif === 1 || b.id_bagian === awal?.id_bagian,
              )
              .map((b) => (
                <option key={b.id_bagian} value={b.id_bagian}>
                  {b.nama}
                </option>
              ))}
          </PilihCari>
        </div>
        <div>
          <label htmlFor="low-jabatan" className={LABEL}>
            Jabatan (opsional)
          </label>
          <PilihCari
            id="low-jabatan"
            value={nilai.id_jabatan}
            onChange={(e) => ubah("id_jabatan", e.target.value)}
            className={INPUT}
          >
            <option value="">Tidak ditentukan</option>
            {org.jabatan
              .filter(
                (j) => j.is_aktif === 1 || j.id_jabatan === awal?.id_jabatan,
              )
              .map((j) => (
                <option key={j.id_jabatan} value={j.id_jabatan}>
                  {j.nama}
                </option>
              ))}
          </PilihCari>
        </div>
        <div>
          <label htmlFor="low-buka" className={LABEL}>
            Tanggal buka
          </label>
          <input
            id="low-buka"
            type="date"
            required
            value={nilai.tanggal_buka}
            onChange={(e) => ubah("tanggal_buka", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="low-tutup" className={LABEL}>
            Tanggal tutup (opsional)
          </label>
          <input
            id="low-tutup"
            type="date"
            min={nilai.tanggal_buka}
            value={nilai.tanggal_tutup}
            onChange={(e) => ubah("tanggal_tutup", e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="low-keterangan" className={LABEL}>
            Keterangan (opsional)
          </label>
          <textarea
            id="low-keterangan"
            rows={3}
            maxLength={2000}
            value={nilai.keterangan}
            onChange={(e) => ubah("keterangan", e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className="text-xs text-slate-400 sm:col-span-2">
          Lowongan tanpa tanggal tutup yang tidak pernah ditutup menyimpan data
          pelamarnya tanpa batas.
        </p>
        <Galat teks={galat} />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalBukaLagi({
  lowongan,
  hariIni,
  menyimpan,
  galat,
  onClose,
  onBuka,
}: {
  lowongan: LowonganBaris;
  hariIni: string;
  menyimpan: boolean;
  galat?: string | null;
  onClose: () => void;
  onBuka: (tanggalTutup: string) => void;
}) {
  const [tutup, setTutup] = useState(
    lowongan.tanggal_tutup >= hariIni ? lowongan.tanggal_tutup : "",
  );
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onBuka(tutup);
  };
  return (
    <Modal title={`Buka lagi "${lowongan.judul}"`} onClose={onClose} hideFooter>
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label htmlFor="buka-tutup" className={LABEL}>
            Tanggal tutup baru (opsional)
          </label>
          <input
            id="buka-tutup"
            type="date"
            min={
              hariIni > lowongan.tanggal_buka ? hariIni : lowongan.tanggal_buka
            }
            value={tutup}
            onChange={(e) => setTutup(e.target.value)}
            className={INPUT}
          />
        </div>
        <p className={PERINGATAN}>
          Hitungan 12 bulan penghapusan data pelamar mulai dari nol lagi saat
          lowongan ini ditutup berikutnya.
        </p>
        <Galat teks={galat} />
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Buka lagi
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RincianLowongan({
  lowongan: l,
  org,
  hariIni,
  boleh,
  onKembali,
  onBerubah,
  onPesan,
  onOrgBerubah,
}: {
  lowongan: LowonganBaris;
  org: OrgKepegawaian;
  hariIni: string;
  boleh: (izin: Permission) => boolean;
  onKembali: () => void;
  onBerubah: () => Promise<void>;
  onPesan: (pesan: string) => void;
  onOrgBerubah: () => Promise<void>;
}) {
  const bolehKelola = boleh("hr.recruit.manage");
  const [pelamar, setPelamar] = useState<PelamarBaris[] | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [tambah, setTambah] = useState(false);
  const [galatTambah, setGalatTambah] = useState<string | null>(null);
  const [buka, setBuka] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setPelamar((await muatPelamar(l.id_lowongan)).pelamar);
      setGalatMuat(null);
    } catch (error) {
      setGalatMuat(pesanGalat(error));
    }
  }, [l.id_lowongan]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const berubah = async () => {
    await Promise.all([muat(), onBerubah()]);
  };

  const masihProses = (pelamar ?? []).filter(
    (p) => prosesBerjalan(p.status) && !p.id_karyawan,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button type="button" className={TOMBOL} onClick={onKembali}>
            Semua lowongan
          </button>
          <h2 className="mt-3 text-base font-semibold text-white">
            {l.judul}{" "}
            <span
              className={`${BADGE} ${WARNA_STATUS[l.status] ?? "text-slate-300"}`}
            >
              {l.status}
            </span>
          </h2>
          <p className="text-xs text-slate-400">
            {l.kelompok} · {l.unit || "Yayasan"} · Diterima{" "}
            {l.per_status.Diterima ?? 0} dari {l.jumlah}
          </p>
        </div>
        {bolehKelola && l.status !== "Dijadwalkan" ? (
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => setTambah(true)}
          >
            Tambah pelamar
          </button>
        ) : null}
      </div>
      {l.keterangan ? (
        <p className="whitespace-pre-line text-sm text-slate-300">
          {l.keterangan}
        </p>
      ) : null}
      {l.status === "Ditutup" && masihProses > 0 ? (
        <p className={PERINGATAN}>
          Lowongan sudah ditutup, tetapi {masihProses} pelamar masih di tahap
          proses.
          {l.tanggal_hapus
            ? ` Datanya ikut terhapus pada ${tgl(l.tanggal_hapus)}.`
            : ""}
        </p>
      ) : null}
      {galatMuat ? (
        <div className="space-y-2">
          <p className="text-sm text-rose-300" role="alert">
            {galatMuat}
          </p>
          <button type="button" className={TOMBOL} onClick={() => void muat()}>
            Coba lagi
          </button>
        </div>
      ) : !pelamar ? (
        <p className="text-sm text-slate-400">Memuat pelamar…</p>
      ) : pelamar.length === 0 ? (
        <p className="text-sm text-slate-400">Belum ada pelamar.</p>
      ) : (
        SEMUA_TAHAP.filter((s) => pelamar.some((p) => p.status === s)).map(
          (s) => {
            const isi = pelamar.filter((p) => p.status === s);
            return (
              <section
                key={s}
                aria-labelledby={`status-${s}`}
                className="space-y-2"
              >
                <h3
                  id={`status-${s}`}
                  className="text-sm font-semibold text-slate-200"
                >
                  {s} ({isi.length})
                </h3>
                <ul className="space-y-2">
                  {isi.map((p) => (
                    <li
                      key={p.id_pelamar}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
                    >
                      <span>
                        <span className="font-semibold text-white">
                          {p.nama}
                        </span>
                        {p.mungkin_ganda ? (
                          <span className={`${BADGE} ml-2 text-amber-200`}>
                            Mungkin ganda
                          </span>
                        ) : null}
                        <span className="block text-xs text-slate-400">
                          Melamar {tgl(p.tanggal_lamaran)}
                          {p.sumber ? ` · ${p.sumber}` : ""}
                          {p.pendidikan
                            ? ` · ${p.pendidikan}${p.prodi ? ` ${p.prodi}` : ""}`
                            : ""}
                          {p.jumlah_berkas > 0
                            ? ` · ${p.jumlah_berkas} berkas`
                            : ""}
                          {p.id_karyawan ? " · sudah menjadi personil" : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        className={TOMBOL}
                        aria-label={`Rincian pelamar ${p.nama}`}
                        onClick={() => setBuka(p.id_pelamar)}
                      >
                        Rincian
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          },
        )
      )}

      {tambah ? (
        <FormPelamar
          awal={null}
          lowongan={l}
          hariIni={hariIni}
          menyimpan={menyimpan}
          galat={galatTambah}
          onClose={() => setTambah(false)}
          onSimpan={async (draft) => {
            if (isSubmittingRef.current) return;
            isSubmittingRef.current = true;
            setMenyimpan(true);
            setGalatTambah(null);
            try {
              const hasil = await simpanPelamar(draft);
              onPesan(
                hasil.mungkin_ganda
                  ? `${draft.nama} dicatat. Ada pelamar lain dengan nama dan nomor HP yang sama di lowongan ini.`
                  : `${draft.nama} dicatat.`,
              );
              setTambah(false);
              await berubah();
            } catch (error) {
              setGalatTambah(pesanGalat(error));
            } finally {
              isSubmittingRef.current = false;
              setMenyimpan(false);
            }
          }}
        />
      ) : null}
      {buka ? (
        <RincianPelamarModal
          idPelamar={buka}
          lowongan={l}
          org={org}
          hariIni={hariIni}
          boleh={boleh}
          onClose={() => setBuka(null)}
          onBerubah={berubah}
          onDihapus={async (nama) => {
            setBuka(null);
            onPesan(`Data pelamar ${nama} dihapus permanen.`);
            await berubah();
          }}
          onOrgBerubah={onOrgBerubah}
        />
      ) : null}
    </div>
  );
}

type IsianPelamar = {
  id_pelamar: string;
  id_lowongan: string;
  nama: string;
  no_hp: string;
  email: string;
  lp: string;
  tanggal_lahir: string;
  alamat: string;
  pendidikan: string;
  prodi: string;
  sumber: string;
  tanggal_lamaran: string;
  catatan: string;
};

function FormPelamar({
  awal,
  lowongan,
  hariIni,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: {
  awal: PelamarBaris | null;
  lowongan: LowonganBaris;
  hariIni: string;
  menyimpan: boolean;
  galat?: string | null;
  onClose: () => void;
  onSimpan: (draft: IsianPelamar) => void;
}) {
  const [n, setN] = useState<IsianPelamar>({
    id_pelamar: awal?.id_pelamar ?? "",
    id_lowongan: lowongan.id_lowongan,
    nama: awal?.nama ?? "",
    no_hp: awal?.no_hp ?? "",
    email: awal?.email ?? "",
    lp: awal?.lp ?? "",
    tanggal_lahir: awal?.tanggal_lahir ?? "",
    alamat: awal?.alamat ?? "",
    pendidikan: awal?.pendidikan ?? "",
    prodi: awal?.prodi ?? "",
    sumber: awal?.sumber ?? "",
    tanggal_lamaran: awal?.tanggal_lamaran ?? hariIni,
    catatan: awal?.catatan ?? "",
  });
  const ubah = (k: keyof IsianPelamar, v: string) =>
    setN((lama) => ({ ...lama, [k]: v }));
  const teks = (
    k: keyof IsianPelamar,
    label: string,
    maks: number,
    lain: { type?: string; inputMode?: "tel" | "email"; list?: string } = {},
  ) => (
    <div>
      <label htmlFor={`plm-${k}`} className={LABEL}>
        {label}
      </label>
      <input
        id={`plm-${k}`}
        maxLength={maks}
        value={n[k]}
        onChange={(e) => ubah(k, e.target.value)}
        className={INPUT}
        {...lain}
      />
    </div>
  );
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan(n);
  };
  return (
    <Modal
      title={awal ? `Ubah data ${awal.nama}` : `Pelamar ${lowongan.judul}`}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-xl"
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={kirim}>
        <div className="sm:col-span-2">
          <label htmlFor="plm-nama" className={LABEL}>
            Nama
          </label>
          <input
            id="plm-nama"
            required
            minLength={2}
            maxLength={100}
            value={n.nama}
            onChange={(e) => ubah("nama", e.target.value)}
            className={INPUT}
          />
        </div>
        {teks("no_hp", "Nomor HP (opsional)", 20, { inputMode: "tel" })}
        {teks("email", "Email (opsional)", 120, { type: "email" })}
        <div>
          <label htmlFor="plm-lp" className={LABEL}>
            Jenis kelamin
          </label>
          <select
            id="plm-lp"
            value={n.lp}
            onChange={(e) => ubah("lp", e.target.value)}
            className={INPUT}
          >
            <option value="">-</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        </div>
        <div>
          <label htmlFor="plm-lahir" className={LABEL}>
            Tanggal lahir (opsional)
          </label>
          <input
            id="plm-lahir"
            type="date"
            max={hariIni}
            value={n.tanggal_lahir}
            onChange={(e) => ubah("tanggal_lahir", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="plm-pendidikan" className={LABEL}>
            Pendidikan terakhir
          </label>
          <select
            id="plm-pendidikan"
            value={n.pendidikan}
            onChange={(e) => ubah("pendidikan", e.target.value)}
            className={INPUT}
          >
            <option value="">-</option>
            {JENJANG.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
        {teks("prodi", "Program studi (opsional)", 100)}
        {teks("sumber", "Sumber lamaran (opsional)", 100, {
          list: "saran-sumber",
        })}
        <datalist id="saran-sumber">
          {SARAN_SUMBER.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div>
          <label htmlFor="plm-lamaran" className={LABEL}>
            Tanggal lamaran
          </label>
          <input
            id="plm-lamaran"
            type="date"
            required
            disabled={Boolean(awal)}
            aria-describedby={awal ? "plm-lamaran-tetap" : undefined}
            min={lowongan.tanggal_buka}
            max={hariIni}
            value={n.tanggal_lamaran}
            onChange={(e) => ubah("tanggal_lamaran", e.target.value)}
            className={INPUT}
          />
          {awal ? (
            <p id="plm-lamaran-tetap" className="mt-1 text-xs text-slate-400">
              Tidak bisa diubah. Bila salah, hapus lalu catat ulang.
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="plm-alamat" className={LABEL}>
            Alamat (opsional)
          </label>
          <textarea
            id="plm-alamat"
            rows={2}
            maxLength={1000}
            value={n.alamat}
            onChange={(e) => ubah("alamat", e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="plm-catatan" className={LABEL}>
            Catatan (opsional)
          </label>
          <textarea
            id="plm-catatan"
            rows={2}
            maxLength={2000}
            value={n.catatan}
            onChange={(e) => ubah("catatan", e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className="text-xs text-slate-400 sm:col-span-2">
          NIK, KK, dan rekening tidak dicatat untuk pelamar; datanya diisi di
          rincian pegawai sesudah menjadi personil.
        </p>
        <Galat teks={galat} />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

type Personil = "belum" | "lengkap" | "belum_lengkap";

function RincianPelamarModal({
  idPelamar,
  lowongan,
  org,
  hariIni,
  boleh,
  onClose,
  onBerubah,
  onDihapus,
  onOrgBerubah,
}: {
  idPelamar: string;
  lowongan: LowonganBaris;
  org: OrgKepegawaian;
  hariIni: string;
  boleh: (izin: Permission) => boolean;
  onClose: () => void;
  onBerubah: () => Promise<void>;
  onDihapus: (nama: string) => Promise<void>;
  onOrgBerubah: () => Promise<void>;
}) {
  const bolehKelola = boleh("hr.recruit.manage");
  const [data, setData] = useState<RincianPelamar | null>(null);
  const [personil, setPersonil] = useState<Personil>("belum");
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const [dibuka, setDibuka] = useState<IsiBerkasPelamar | null>(null);
  const [ubahData, setUbahData] = useState(false);
  const [batal, setBatal] = useState(false);
  const [hapus, setHapus] = useState(false);
  const [hire, setHire] = useState<"jadikan" | "lanjutkan" | null>(null);
  const [pegawai, setPegawai] = useState<PegawaiKepegawaian | null>(null);
  const [cetak, setCetak] = useState<PermintaanSurat | null>(null);
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      const r = await muatRincianPelamar(idPelamar);
      let keadaan: Personil = "belum";
      if (r.pelamar.id_karyawan) {
        // Lengkap = personil ada di daftar pegawai DAN kontrak pertamanya
        // tercatat, dua langkah yang diulang tombol Lanjutkan.
        const ids = idDariPelamar(r.pelamar.id_pelamar, r.pelamar.kelompok);
        const adaPegawai = org.pegawai.some(
          (p) => p.id_unik === r.pelamar.id_karyawan,
        );
        const adaKontrak =
          ids.ok &&
          adaPegawai &&
          (await muatKontrak()).kontrak.some(
            (k) => k.id_kontrak === ids.nilai.id_kontrak,
          );
        keadaan = adaKontrak ? "lengkap" : "belum_lengkap";
      }
      setData(r);
      setPersonil(keadaan);
      setGalatMuat(null);
    } catch (error) {
      setGalatMuat(pesanGalat(error));
    }
  }, [idPelamar, org.pegawai]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (
    kunci: string,
    aksi: () => Promise<string | null>,
  ) => {
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    setProses(kunci);
    setKabar(null);
    setGalat(null);
    try {
      const pesan = await aksi();
      if (pesan) setKabar(pesan);
      return true;
    } catch (error) {
      setGalat(pesanGalat(error));
      return false;
    } finally {
      isSubmittingRef.current = false;
      setProses(null);
    }
  };

  const ubahLalu = async (kunci: string, aksi: () => Promise<string>) => {
    const berhasil = await jalankan(kunci, async () => {
      const pesan = await aksi();
      await Promise.all([muat(), onBerubah()]);
      return pesan;
    });
    return berhasil;
  };

  const p = data?.pelamar;
  const dijadikan = Boolean(p?.id_karyawan);
  const terakhir = data?.tahap
    .filter((t) => !t.dibatalkan_pada)
    .reduce<RincianPelamar["tahap"][number] | null>(
      (a, t) => (!a || t.urutan > a.urutan ? t : a),
      null,
    );
  const subDialog =
    ubahData && p ? (
      <FormPelamar
        awal={p}
        lowongan={lowongan}
        hariIni={hariIni}
        menyimpan={proses !== null}
        galat={galat}
        onClose={() => {
          setUbahData(false);
          setGalat(null);
        }}
        onSimpan={async (draft) => {
          if (
            await ubahLalu("ubah", async () => {
              await simpanPelamar(draft);
              return "Data pelamar disimpan.";
            })
          )
            setUbahData(false);
        }}
      />
    ) : batal && p && terakhir ? (
      <ModalBatal
        judul={`Batalkan tahap ${terakhir.tahap}?`}
        menyimpan={proses !== null}
        galat={galat}
        onClose={() => {
          setBatal(false);
          setGalat(null);
        }}
        onBatal={async (alasan) => {
          if (
            await ubahLalu("batal", async () => {
              await simpanTahapPelamar({
                aksi: "batal",
                id_pelamar: p.id_pelamar,
                id_tahap: terakhir.id_tahap,
                alasan,
              });
              return `Tahap ${terakhir.tahap} dibatalkan.`;
            })
          )
            setBatal(false);
        }}
      />
    ) : hapus && p ? (
      <ModalHapusPermanen
        nama={p.nama}
        menyimpan={proses !== null}
        galat={galat}
        onClose={() => {
          setHapus(false);
          setGalat(null);
        }}
        onHapus={async () => {
          if (
            await jalankan("hapus", async () => {
              await hapusPelamar(p.id_pelamar);
              return null;
            })
          )
            await onDihapus(p.nama);
        }}
      />
    ) : hire && p ? (
      <DialogJadikanPersonil
        pelamar={p}
        lowongan={lowongan}
        aksi={hire}
        hariIni={hariIni}
        onClose={() => setHire(null)}
        onGagal={() => void muat()}
        onSelesai={async (hasil) => {
          setHire(null);
          setKabar(
            `${p.nama} kini tercatat sebagai ${hasil.kelompok === "Guru" ? "guru" : "tendik"} dengan kontrak pertamanya.`,
          );
          await onOrgBerubah();
          await Promise.all([muat(), onBerubah()]);
        }}
      />
    ) : null;
  if (subDialog) return subDialog;
  if (cetak) {
    return (
      <DialogCetakSurat permintaan={cetak} onClose={() => setCetak(null)} />
    );
  }
  if (pegawai) {
    return (
      <RincianPegawai
        pegawai={pegawai}
        org={org}
        hariIni={hariIni}
        onClose={() => setPegawai(null)}
        onCetak={(permintaan) => {
          setPegawai(null);
          setCetak(permintaan);
        }}
      />
    );
  }

  const tahapAkhir = p
    ? (TAHAP_AKHIR as readonly string[]).includes(p.status)
    : false;
  const bolehJadikan =
    p !== undefined &&
    bolehKelola &&
    boleh("hr.contract.manage") &&
    boleh(p.kelompok === "Guru" ? "teachers.manage" : "employees.manage");
  const pegawaiIni = p
    ? org.pegawai.find((x) => x.id_unik === p.id_karyawan)
    : undefined;

  const unggah = (masukan: HTMLInputElement) => {
    const file = masukan.files?.[0];
    // Dikosongkan supaya memilih berkas yang sama lagi tetap memicu onChange.
    masukan.value = "";
    if (!file || !p) return;
    void ubahLalu("unggah", async () => {
      const siap = await siapkanBerkas(file, MAKS_BYTE_DOKUMEN);
      if (!siap.ok) throw new Error(siap.pesan);
      await tambahBerkasPelamar({
        id_pelamar: p.id_pelamar,
        nama_berkas: siap.berkas.namaFile,
        mime_type: siap.berkas.mime,
        data_base64: siap.berkas.kontenBase64,
      });
      return `${siap.berkas.namaFile} tersimpan (${kb(siap.berkas.ukuranByte)} KB).`;
    });
  };

  return (
    <Modal
      title={p ? p.nama : "Rincian pelamar"}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 text-sm">
        {dialogKonfirmasi}
        {galatMuat ? (
          <div className="space-y-2">
            <p className="text-rose-300" role="alert">
              {galatMuat}
            </p>
            <button
              type="button"
              className={TOMBOL}
              onClick={() => void muat()}
            >
              Coba lagi
            </button>
          </div>
        ) : null}
        {!data && !galatMuat ? <p className="text-slate-400">Memuat…</p> : null}
        {kabar ? (
          <output className="block text-emerald-300">{kabar}</output>
        ) : null}
        {galat ? (
          <p className="text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        {p && data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`${BADGE} ${WARNA_STATUS[p.status] ?? "text-cyan-300"}`}
              >
                {p.status}
              </span>
              {p.mungkin_ganda ? (
                <span className={`${BADGE} text-amber-200`}>Mungkin ganda</span>
              ) : null}
            </div>

            {personil === "lengkap" ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300/30 px-3 py-2">
                <span className="text-emerald-300">
                  Sudah menjadi personil.
                </span>
                {pegawaiIni ? (
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setPegawai(pegawaiIni)}
                  >
                    Buka rincian pegawai
                  </button>
                ) : null}
              </div>
            ) : personil === "belum_lengkap" ? (
              <div
                className={`${PERINGATAN} flex flex-wrap items-center justify-between gap-2`}
              >
                <span>
                  Diterima, data personil belum lengkap. Lanjutkan untuk
                  melengkapi data pegawai dan kontrak pertamanya.
                </span>
                {bolehJadikan ? (
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setHire("lanjutkan")}
                  >
                    Lanjutkan
                  </button>
                ) : null}
              </div>
            ) : p.status === "Diterima" && bolehJadikan ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  className={TOMBOL_UTAMA}
                  onClick={() => setHire("jadikan")}
                >
                  Jadikan personil
                </button>
              </div>
            ) : null}

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {(
                [
                  ["Lowongan", p.judul_lowongan],
                  ["Tanggal lamaran", tgl(p.tanggal_lamaran)],
                  ["Nomor HP", p.no_hp || "-"],
                  ["Email", p.email || "-"],
                  [
                    "Jenis kelamin",
                    p.lp === "L"
                      ? "Laki-laki"
                      : p.lp === "P"
                        ? "Perempuan"
                        : "-",
                  ],
                  ["Tanggal lahir", tgl(p.tanggal_lahir)],
                  [
                    "Pendidikan",
                    p.pendidikan
                      ? `${p.pendidikan}${p.prodi ? ` ${p.prodi}` : ""}`
                      : "-",
                  ],
                  ["Sumber", p.sumber || "-"],
                  ["Alamat", p.alamat || "-"],
                  ["Catatan", p.catatan || "-"],
                ] as const
              ).map(([label, nilai]) => (
                <div key={label}>
                  <dt className="text-xs text-slate-400">{label}</dt>
                  <dd className="whitespace-pre-line text-white">{nilai}</dd>
                </div>
              ))}
            </dl>

            {!dijadikan && (bolehKelola || boleh("hr.recruit.delete")) ? (
              <div className="flex flex-wrap gap-2">
                {bolehKelola ? (
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setUbahData(true)}
                  >
                    Ubah data
                  </button>
                ) : null}
                {boleh("hr.recruit.delete") ? (
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setHapus(true)}
                  >
                    Hapus permanen
                  </button>
                ) : null}
              </div>
            ) : null}

            <section aria-labelledby="judul-tahap" className="space-y-2">
              <h3 id="judul-tahap" className="font-semibold text-white">
                Riwayat tahap
              </h3>
              <ol className="space-y-1">
                {data.tahap.map((t) => (
                  <li
                    key={t.id_tahap}
                    className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
                  >
                    <span
                      className={
                        t.dibatalkan_pada
                          ? "text-slate-400 line-through"
                          : "font-semibold text-white"
                      }
                    >
                      {t.urutan}. {t.tahap}
                    </span>
                    <span className="text-slate-400">
                      {" "}
                      · {tgl(t.tanggal)} · {t.oleh}
                    </span>
                    {t.catatan ? (
                      <span className="block text-xs text-slate-300">
                        {t.catatan}
                      </span>
                    ) : null}
                    {t.dibatalkan_pada ? (
                      <span className="block text-xs text-amber-200">
                        Dibatalkan {t.dibatalkan_oleh}: {t.alasan_batal}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {bolehKelola && !dijadikan && terakhir && terakhir.urutan > 1 ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setBatal(true)}
                >
                  Batalkan tahap terakhir
                </button>
              ) : null}
              {bolehKelola && !dijadikan && !tahapAkhir ? (
                <FormTahap
                  kelompok={p.kelompok}
                  tanggalLamaran={p.tanggal_lamaran}
                  hariIni={hariIni}
                  menyimpan={proses !== null}
                  onCatat={(draft) =>
                    ubahLalu("tahap", async () => {
                      await simpanTahapPelamar({
                        aksi: "catat",
                        id_pelamar: p.id_pelamar,
                        ...draft,
                      });
                      return `Tahap ${draft.tahap} dicatat.`;
                    })
                  }
                />
              ) : null}
            </section>

            <section aria-labelledby="judul-cv" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="judul-cv" className="font-semibold text-white">
                  CV dan berkas
                </h3>
                {bolehKelola &&
                !dijadikan &&
                data.berkas.length < MAKS_BERKAS_PELAMAR ? (
                  <label
                    className={`${TOMBOL} relative inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-sky-500 ${proses !== null ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {proses === "unggah" ? "Mengunggah..." : "Unggah berkas"}
                    <input
                      type="file"
                      accept={MIME_BERKAS_SEKOLAH.join(",")}
                      className="sr-only"
                      disabled={proses !== null}
                      onChange={(e) => unggah(e.currentTarget)}
                    />
                  </label>
                ) : null}
              </div>
              <p className="text-xs text-slate-400">
                Maksimal {MAKS_BERKAS_PELAMAR} berkas, masing-masing{" "}
                {kb(MAKS_BYTE_DOKUMEN)} KB. CV tidak disalin ke Dokumen pegawai.
              </p>
              <ul className="space-y-1">
                {data.berkas.map((b) => (
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
                            setDibuka(await ambilBerkasPelamar(b.id_berkas));
                            return null;
                          })
                        }
                      >
                        {proses === b.id_berkas ? "Memuat..." : "Lihat"}
                      </button>
                      {bolehKelola && !dijadikan ? (
                        <button
                          type="button"
                          className={TOMBOL}
                          disabled={proses !== null}
                          onClick={async () => {
                            const setuju = await konfirmasi({
                              title: `Hapus ${b.nama_berkas}?`,
                              description:
                                "Berkas ini dihapus permanen dari database.",
                              confirmLabel: "Hapus",
                              tone: "danger",
                            });
                            if (!setuju) return;
                            void ubahLalu(`hapus-${b.id_berkas}`, async () => {
                              await hapusBerkasPelamar(b.id_berkas);
                              setDibuka(null);
                              return `${b.nama_berkas} dihapus.`;
                            });
                          }}
                        >
                          Hapus berkas
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
                {data.berkas.length === 0 ? (
                  <li className="text-xs text-slate-400">Belum ada berkas.</li>
                ) : null}
              </ul>
              {dibuka ? (
                <PratinjauBerkas
                  berkas={dibuka}
                  onTutup={() => setDibuka(null)}
                />
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function FormTahap({
  kelompok,
  tanggalLamaran,
  hariIni,
  menyimpan,
  onCatat,
}: {
  kelompok: string;
  tanggalLamaran: string;
  hariIni: string;
  menyimpan: boolean;
  onCatat: (draft: {
    tahap: string;
    tanggal: string;
    catatan: string;
  }) => Promise<boolean>;
}) {
  const pilihan = SEMUA_TAHAP.filter(
    (t) => t !== "Lamaran" && (t !== "Microteaching" || kelompok === "Guru"),
  );
  const [tahap, setTahap] = useState<string>(pilihan[0]);
  const [tanggal, setTanggal] = useState(hariIni);
  const [catatan, setCatatan] = useState("");
  const wajibCatatan = tahap === "Ditolak" || tahap === "Mundur";
  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (await onCatat({ tahap, tanggal, catatan })) setCatatan("");
  };
  return (
    <form
      onSubmit={(e) => void kirim(e)}
      className="grid gap-3 rounded-2xl border border-sky-500/30 p-3 sm:grid-cols-3"
    >
      <h4 className="font-semibold text-white sm:col-span-3">Catat tahap</h4>
      <div>
        <label htmlFor="tahap-baru" className={LABEL}>
          Tahap
        </label>
        <select
          id="tahap-baru"
          value={tahap}
          onChange={(e) => setTahap(e.target.value)}
          className={INPUT}
        >
          {pilihan.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="tahap-tanggal" className={LABEL}>
          Tanggal
        </label>
        <input
          id="tahap-tanggal"
          type="date"
          required
          min={tanggalLamaran}
          max={hariIni}
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className={INPUT}
        />
      </div>
      <div className="sm:col-span-3">
        <label htmlFor="tahap-catatan" className={LABEL}>
          Catatan{wajibCatatan ? "" : " (opsional)"}
        </label>
        <textarea
          id="tahap-catatan"
          rows={2}
          maxLength={1000}
          required={wajibCatatan}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          className={`${INPUT} py-2`}
        />
      </div>
      <p className="text-xs text-slate-400 sm:col-span-3">
        Diterima, Ditolak, dan Mundur adalah tahap akhir; sesudahnya tidak ada
        tahap baru kecuali tahap terakhir dibatalkan.
      </p>
      <div className="flex justify-end sm:col-span-3">
        <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
          Catat tahap
        </button>
      </div>
    </form>
  );
}

function ModalHapusPermanen({
  nama,
  menyimpan,
  galat,
  onClose,
  onHapus,
}: {
  nama: string;
  menyimpan: boolean;
  galat?: string | null;
  onClose: () => void;
  onHapus: () => void;
}) {
  const [ketikan, setKetikan] = useState("");
  const cocok = ketikan.trim() === KONFIRMASI_HAPUS_PERMANEN;
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    if (cocok) onHapus();
  };
  return (
    <Modal title={`Hapus permanen data ${nama}?`} onClose={onClose} hideFooter>
      <form data-tanpa-konfirmasi className="space-y-4" onSubmit={kirim}>
        <p className={PERINGATAN}>
          Data pelamar, riwayat tahap, dan seluruh berkasnya dihapus permanen
          dari database. Yang tersisa hanya jumlah pelamar yang dihapus pada
          lowongan ini.
        </p>
        <div>
          <label htmlFor="ketik-hapus-pelamar" className={LABEL}>
            Ketik {KONFIRMASI_HAPUS_PERMANEN} untuk melanjutkan
          </label>
          <input
            id="ketik-hapus-pelamar"
            autoComplete="off"
            value={ketikan}
            onChange={(e) => setKetikan(e.target.value)}
            className={INPUT}
          />
        </div>
        <Galat teks={galat} />
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button
            type="submit"
            className={TOMBOL_UTAMA}
            disabled={menyimpan || !cocok}
          >
            Hapus permanen
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Galat({ teks }: { teks?: string | null }) {
  return teks ? (
    <p className="text-sm text-rose-300" role="alert">
      {teks}
    </p>
  ) : null;
}
