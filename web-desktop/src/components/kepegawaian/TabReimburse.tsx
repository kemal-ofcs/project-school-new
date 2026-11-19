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
import { hasPermission } from "@/lib/auth/access";
import { saveFileWithPicker } from "@/lib/client/download";
import { siapkanBerkas } from "@/lib/client/siapkan-berkas";
import { useAuth } from "@/lib/context/AuthContext";
import {
  ambilNotaKlaim,
  batalBayarKlaim,
  bayarKlaim,
  muatJenisReimburse,
  muatKlaimBulan,
  muatKlaimPegawai,
  muatRincianKlaim,
  type OrgKepegawaian,
  putusKlaim,
  simpanKlaim,
  simpanNotaKlaim,
} from "@/lib/gateways/hris";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { MIME_BERKAS_SEKOLAH } from "@/lib/validations/berkas-sekolah";
import {
  type AksiKeputusan,
  type IsiNota,
  type JenisReimburse,
  type KlaimBaris,
  type KlaimBulan,
  type KlaimPegawai,
  MAKS_ALASAN_REIMBURSE,
  MAKS_KEPERLUAN,
  MAKS_KETERANGAN_BAYAR,
  MAKS_NOMINAL_REIMBURSE,
  type RincianKlaim,
  type SesiReimburse,
  type StatusKlaim,
  type TandaKlaim,
} from "@/lib/validations/hr-reimburse";
import { MAKS_BERKAS_DOKUMEN, MAKS_BYTE_DOKUMEN } from "@/lib/validations/hris";
import {
  INPUT,
  LABEL,
  PERINGATAN,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
} from "./gaya";

const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const LABEL_TANDA: Record<TandaKlaim, string> = {
  tanpa_nota: "Nota belum diunggah",
  lewat_batas: "Melewati batas bulanan jenis ini",
  dibayar_ganda: "Tercatat dibayar lebih dari sekali",
};
const WARNA_STATUS: Record<StatusKlaim, string> = {
  Menunggu: "text-amber-200",
  Disetujui: "text-emerald-300",
  Ditolak: "text-rose-300",
  Dibatalkan: "text-slate-400",
};
const kb = (byte: number) => Math.ceil(byte / 1024);

interface Wewenang {
  username: string;
  superadmin: boolean;
  ajukan: boolean;
  putus: boolean;
  bayar: boolean;
}

/** Perkiraan tombol dari sesi; command dan rute tetap memeriksa ulang. */
function bolehPutus(w: Wewenang, sesi: SesiReimburse, k: KlaimBaris) {
  const sendiri = sesi.id_karyawan !== "" && sesi.id_karyawan === k.id_karyawan;
  const cakupan = sesi.lingkup_semua || sesi.unit === k.unit;
  return w.putus && !sendiri && cakupan;
}

function NominalKlaim({ k }: { k: KlaimBaris }) {
  if (k.nominal_disetujui !== null && k.nominal_disetujui !== k.nominal) {
    return (
      <>
        {IDR.format(k.nominal_disetujui)}
        <span className="block text-xs text-slate-400 line-through">
          {IDR.format(k.nominal)}
        </span>
      </>
    );
  }
  return <>{IDR.format(k.nominal)}</>;
}

/**
 * Reimbursement (§26.5 nomor 5): klaim atas nama pegawai, nota, keputusan,
 * dan pembayaran terpisah dari gaji. Khusus cloud.
 */
export function TabReimburse({
  org,
  onPesan,
}: {
  org: OrgKepegawaian;
  onPesan: (pesan: string) => void;
}) {
  const { user } = useAuth();
  const w: Wewenang = {
    username: user?.username ?? "",
    superadmin: Boolean(user?.isSuperadmin),
    ajukan: hasPermission(user, "hr.reimburse.submit"),
    putus: hasPermission(user, "hr.reimburse.decide"),
    bayar: hasPermission(user, "hr.reimburse.pay"),
  };
  const [bulan, setBulan] = useState("");
  const [data, setData] = useState<KlaimBulan | null>(null);
  const [jenis, setJenis] = useState<JenisReimburse[]>([]);
  const [status, setStatus] = useState("");
  const [bayar, setBayar] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [isian, setIsian] = useState(false);
  const [rincian, setRincian] = useState<string | null>(null);
  const [panelBayar, setPanelBayar] = useState(false);

  const muat = useCallback(async (b: string) => {
    try {
      const hasil = await muatKlaimBulan(b);
      setData(hasil);
      setBulan(hasil.bulan);
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat("");
    void muatJenisReimburse()
      .then((h) => setJenis(h.jenis))
      .catch(() => undefined);
  }, [muat]);

  const terlihat = (data?.klaim ?? []).filter(
    (k) =>
      (!status || k.status === status) && (!bayar || k.status_bayar === bayar),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          data-tanpa-konfirmasi
          onSubmit={(e) => e.preventDefault()}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className={LABEL} htmlFor="reimburse-bulan">
              Bulan tanggal biaya
            </label>
            <input
              id="reimburse-bulan"
              type="month"
              value={bulan}
              onChange={(e) => {
                setBulan(e.target.value);
                if (e.target.value) void muat(e.target.value);
              }}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="reimburse-status">
              Status
            </label>
            <select
              id="reimburse-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={INPUT}
            >
              <option value="">Semua status</option>
              <option value="Menunggu">Menunggu</option>
              <option value="Disetujui">Disetujui</option>
              <option value="Ditolak">Ditolak</option>
              <option value="Dibatalkan">Dibatalkan</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="reimburse-bayar">
              Pembayaran
            </label>
            <select
              id="reimburse-bayar"
              value={bayar}
              onChange={(e) => setBayar(e.target.value)}
              className={INPUT}
            >
              <option value="">Semua</option>
              <option value="Belum dibayar">Belum dibayar</option>
              <option value="Dibayar">Dibayar</option>
            </select>
          </div>
        </form>
        <div className="flex flex-wrap gap-2">
          {w.bayar ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setPanelBayar(true)}
            >
              Pembayaran
            </button>
          ) : null}
          {w.ajukan ? (
            <button
              type="button"
              className={TOMBOL_UTAMA}
              onClick={() => setIsian(true)}
            >
              Ajukan klaim
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Reimbursement dibayar terpisah dari slip gaji. Catat jurnalnya secara
        manual di Keuangan dengan akun Beban Reimbursement.
      </p>
      {galat ? (
        <p className="text-sm text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
      {!data && !galat ? (
        <p className="text-sm text-slate-400">Memuat…</p>
      ) : null}
      {data && !data.sesi.lihat_semua ? (
        <p className="text-xs text-slate-400">
          Hanya klaim yang Anda ajukan yang ditampilkan.
        </p>
      ) : null}
      {data ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">Tanggal</th>
                <th className="px-3 py-2">Pegawai</th>
                <th className="px-3 py-2">Jenis</th>
                <th className="px-3 py-2 text-right">Nominal</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Tanda</th>
                <th className="px-3 py-2">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-200">
              {terlihat.map((k) => (
                <tr key={k.id_klaim}>
                  <td className="px-3 py-2">{k.tanggal}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold text-white">{k.nama}</span>
                    {k.unit ? (
                      <span className="block text-xs text-slate-400">
                        {k.unit}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{k.jenis}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <NominalKlaim k={k} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={WARNA_STATUS[k.status]}>{k.status}</span>
                    {k.status === "Disetujui" ? (
                      <span className="block text-xs text-slate-400">
                        {k.status_bayar}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-amber-200">
                    {k.tanda.map((t) => LABEL_TANDA[t]).join("; ") || (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className={TOMBOL}
                      aria-label={`Rincian klaim ${k.nama} ${k.tanggal}`}
                      onClick={() => setRincian(k.id_klaim)}
                    >
                      Rincian
                    </button>
                  </td>
                </tr>
              ))}
              {terlihat.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-400" colSpan={7}>
                    Belum ada klaim di bulan ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {isian && data ? (
        <ModalKlaim
          org={org}
          jenis={jenis.filter((j) => j.is_aktif)}
          hariIni={data.hari_ini}
          onClose={() => setIsian(false)}
          onTersimpan={async (id) => {
            setIsian(false);
            onPesan("Klaim diajukan. Tambahkan nota bila ada.");
            await muat(bulan);
            setRincian(id);
          }}
        />
      ) : null}
      {rincian ? (
        <ModalRincian
          idKlaim={rincian}
          w={w}
          onClose={() => setRincian(null)}
          onBerubah={() => muat(bulan)}
        />
      ) : null}
      {panelBayar && data ? (
        <ModalBayar
          org={org}
          hariIni={data.hari_ini}
          onClose={() => setPanelBayar(false)}
          onBerubah={() => muat(bulan)}
        />
      ) : null}
    </div>
  );
}

function useKirim() {
  const isSubmittingRef = useRef(false);
  const [proses, setProses] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const jalankan = async (kunci: string, aksi: () => Promise<void>) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setProses(kunci);
    setGalat(null);
    try {
      await aksi();
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setProses(null);
    }
  };
  return { proses, galat, setGalat, jalankan };
}

function Galat({ teks }: { teks: string | null }) {
  return teks ? (
    <p className="text-sm text-rose-300" role="alert">
      {teks}
    </p>
  ) : null;
}

function ModalKlaim({
  org,
  jenis,
  hariIni,
  onClose,
  onTersimpan,
}: {
  org: OrgKepegawaian;
  jenis: JenisReimburse[];
  hariIni: string;
  onClose: () => void;
  onTersimpan: (idKlaim: string) => Promise<void>;
}) {
  const [idKaryawan, setIdKaryawan] = useState("");
  const [idJenis, setIdJenis] = useState("");
  const [tanggal, setTanggal] = useState(hariIni);
  const [nominal, setNominal] = useState("");
  const [keperluan, setKeperluan] = useState("");
  const { proses, galat, jalankan } = useKirim();
  const pilihJenis = jenis.find((j) => j.id_jenis === idJenis);

  const kirim = (e: FormEvent) => {
    e.preventDefault();
    void jalankan("simpan", async () => {
      const hasil = await simpanKlaim({
        id_karyawan: idKaryawan,
        id_jenis: idJenis,
        tanggal,
        nominal: nominal === "" ? null : Number(nominal),
        keperluan,
      });
      await onTersimpan(hasil.id_klaim);
    });
  };

  return (
    <Modal title="Ajukan klaim reimbursement" onClose={onClose} hideFooter>
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label className={LABEL} htmlFor="klaim-pegawai">
            Pegawai
          </label>
          <PilihCari
            id="klaim-pegawai"
            required
            value={idKaryawan}
            onChange={(e) => setIdKaryawan(e.target.value)}
            className={INPUT}
          >
            <option value="">Pilih pegawai</option>
            {org.pegawai.map((p) => (
              <option key={p.id_unik} value={p.id_unik}>
                {`${p.nama}${p.kode_karyawan ? ` (${p.kode_karyawan})` : ""}${
                  p.status_aktif === "Aktif" ? "" : " · nonaktif"
                }`}
              </option>
            ))}
          </PilihCari>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="klaim-jenis">
              Jenis
            </label>
            <select
              id="klaim-jenis"
              required
              value={idJenis}
              onChange={(e) => setIdJenis(e.target.value)}
              className={INPUT}
            >
              <option value="">Pilih jenis</option>
              {jenis.map((j) => (
                <option key={j.id_jenis} value={j.id_jenis}>
                  {j.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="klaim-tanggal">
              Tanggal biaya
            </label>
            <input
              id="klaim-tanggal"
              type="date"
              required
              max={hariIni}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL} htmlFor="klaim-nominal">
              Nominal (Rp)
            </label>
            <input
              id="klaim-nominal"
              type="number"
              required
              min={1}
              max={MAKS_NOMINAL_REIMBURSE}
              step={1}
              value={nominal}
              onChange={(e) => setNominal(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        {pilihJenis?.wajib_nota || pilihJenis?.batas_bulanan ? (
          <p className="text-xs text-slate-400">
            {pilihJenis.wajib_nota ? "Jenis ini wajib nota. " : ""}
            {pilihJenis.batas_bulanan
              ? `Batas per bulan ${IDR.format(pilihJenis.batas_bulanan)}; lebih dari itu hanya ditandai.`
              : ""}
          </p>
        ) : null}
        <div>
          <label className={LABEL} htmlFor="klaim-keperluan">
            Keperluan
          </label>
          <textarea
            id="klaim-keperluan"
            required
            rows={3}
            maxLength={MAKS_KEPERLUAN}
            value={keperluan}
            onChange={(e) => setKeperluan(e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className="text-xs text-slate-400">
          Klaim tidak bisa diubah sesudah diajukan. Bila keliru, batalkan lalu
          ajukan ulang.
        </p>
        <Galat teks={galat} />
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button
            type="submit"
            className={TOMBOL_UTAMA}
            disabled={proses !== null}
          >
            {proses ? "Menyimpan…" : "Ajukan"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalRincian({
  idKlaim,
  w,
  onClose,
  onBerubah,
}: {
  idKlaim: string;
  w: Wewenang;
  onClose: () => void;
  onBerubah: () => Promise<void>;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const [data, setData] = useState<RincianKlaim | null>(null);
  const [dibuka, setDibuka] = useState<IsiNota | null>(null);
  const [aksi, setAksi] = useState<AksiKeputusan | null>(null);
  const [nominal, setNominal] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kabar, setKabar] = useState<string | null>(null);
  const { proses, galat, setGalat, jalankan } = useKirim();

  const muat = useCallback(async () => {
    try {
      setData(await muatRincianKlaim(idKlaim));
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, [idKlaim, setGalat]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const segarkan = async (pesan: string) => {
    setKabar(pesan);
    await muat();
    await onBerubah();
  };

  const putus = (e: FormEvent) => {
    e.preventDefault();
    if (!aksi) return;
    void jalankan("putus", async () => {
      const hasil = await putusKlaim({
        id_klaim: idKlaim,
        aksi,
        nominal_disetujui:
          aksi === "Setujui" && nominal !== "" ? Number(nominal) : null,
        alasan,
      });
      setAksi(null);
      setAlasan("");
      await segarkan(`Klaim ${hasil.status.toLowerCase()}.`);
    });
  };

  const unggah = (masukan: HTMLInputElement) => {
    const file = masukan.files?.[0];
    masukan.value = "";
    if (!file) return;
    void jalankan("unggah", async () => {
      const siap = await siapkanBerkas(file, MAKS_BYTE_DOKUMEN);
      if (!siap.ok) throw new Error(siap.pesan);
      await simpanNotaKlaim({
        aksi: "tambah",
        id_klaim: idKlaim,
        nama_berkas: siap.berkas.namaFile,
        mime_type: siap.berkas.mime,
        data_base64: siap.berkas.kontenBase64,
      });
      await segarkan(`${siap.berkas.namaFile} tersimpan.`);
    });
  };

  const hapusNota = async (idBerkas: string, nama: string) => {
    const setuju = await konfirmasi({
      title: `Hapus ${nama}?`,
      description: "Nota ini dihapus permanen dari database.",
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!setuju) return;
    await jalankan(`hapus-${idBerkas}`, async () => {
      await simpanNotaKlaim({ aksi: "hapus", id_berkas: idBerkas });
      setDibuka(null);
      await segarkan(`${nama} dihapus.`);
    });
  };

  const k = data?.klaim;
  const pengaju = k ? k.diajukan_oleh === w.username : false;
  const ubahNota =
    k?.status === "Menunggu" && w.ajukan && (pengaju || w.superadmin);
  const sah = data && k ? bolehPutus(w, data.sesi, k) : false;
  const bisaSetujui = k?.status === "Menunggu" && sah;
  const bisaBatal =
    k &&
    k.status_bayar === "Belum dibayar" &&
    ((k.status === "Menunggu" && (pengaju || sah)) ||
      (k.status === "Disetujui" && sah));

  return (
    <Modal
      title="Rincian klaim"
      onClose={onClose}
      maxWidth="max-w-3xl"
      hideFooter
    >
      {dialogKonfirmasi}
      <div className="space-y-4 text-sm">
        {!data && !galat ? <p className="text-slate-400">Memuat…</p> : null}
        {k && data ? (
          <>
            <dl className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-slate-950 p-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-400">Pegawai</dt>
                <dd className="font-semibold text-white">
                  {k.nama}
                  {k.unit ? ` · ${k.unit}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Jenis dan tanggal</dt>
                <dd className="text-white">
                  {k.jenis} · {k.tanggal}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Nominal</dt>
                <dd className="font-mono text-white">
                  <NominalKlaim k={k} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd className={WARNA_STATUS[k.status]}>
                  {k.status}
                  {k.status === "Disetujui" ? ` · ${k.status_bayar}` : ""}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-400">Keperluan</dt>
                <dd className="whitespace-pre-wrap text-slate-200">
                  {k.keperluan}
                </dd>
              </div>
              <div className="sm:col-span-2 text-xs text-slate-400">
                Diajukan {k.created_at} oleh {k.diajukan_oleh}
              </div>
            </dl>
            {k.tanda.length > 0 ? (
              <p className={PERINGATAN}>
                {k.tanda.map((t) => LABEL_TANDA[t]).join("; ")}
              </p>
            ) : null}

            <section aria-labelledby="judul-nota" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="judul-nota" className="font-semibold text-white">
                  Nota ({data.nota.length}/{MAKS_BERKAS_DOKUMEN})
                </h3>
                {ubahNota && data.nota.length < MAKS_BERKAS_DOKUMEN ? (
                  <label
                    className={`${TOMBOL} relative inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-sky-500 ${proses !== null ? "pointer-events-none opacity-60" : ""}`}
                  >
                    {proses === "unggah" ? "Mengunggah…" : "Unggah nota"}
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
              {ubahNota ? (
                <p className="text-xs text-slate-400">
                  Foto dipadatkan otomatis, tiap berkas maksimal{" "}
                  {kb(MAKS_BYTE_DOKUMEN)} KB.
                </p>
              ) : null}
              <ul className="space-y-1">
                {data.nota.map((n) => (
                  <li
                    key={n.id_berkas}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300"
                  >
                    <span className="break-all">
                      {n.nama_berkas} · {kb(n.ukuran_byte)} KB
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className={TOMBOL}
                        disabled={proses !== null}
                        onClick={() =>
                          void jalankan(n.id_berkas, async () => {
                            setDibuka(await ambilNotaKlaim(n.id_berkas));
                          })
                        }
                      >
                        {proses === n.id_berkas ? "Memuat…" : "Lihat"}
                      </button>
                      {ubahNota ? (
                        <button
                          type="button"
                          className={TOMBOL}
                          disabled={proses !== null}
                          onClick={() =>
                            void hapusNota(n.id_berkas, n.nama_berkas)
                          }
                        >
                          Hapus
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
                {data.nota.length === 0 ? (
                  <li className="text-slate-400">Belum ada nota.</li>
                ) : null}
              </ul>
              {dibuka ? (
                <div className="space-y-2 rounded-xl border border-white/10 p-2">
                  {dibuka.mime_type === "application/pdf" ? (
                    <p className="text-xs text-slate-400">
                      Pratinjau PDF tidak tersedia di sini. Simpan ke perangkat
                      untuk membukanya.
                    </p>
                  ) : (
                    // biome-ignore lint/performance/noImgElement: sumbernya data URI dari cloud, bukan aset statis yang bisa dioptimalkan
                    <img
                      alt={`Nota ${dibuka.nama_berkas}`}
                      className="max-h-[50vh] w-full rounded-lg object-contain"
                      src={`data:${dibuka.mime_type};base64,${dibuka.data_base64}`}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() =>
                        void saveFileWithPicker(
                          `data:${dibuka.mime_type};base64,${dibuka.data_base64}`,
                          dibuka.nama_berkas,
                        )
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
            </section>

            <section aria-labelledby="judul-keputusan" className="space-y-2">
              <h3 id="judul-keputusan" className="font-semibold text-white">
                Riwayat keputusan
              </h3>
              <ul className="space-y-1">
                {data.keputusan.map((p) => (
                  <li
                    key={p.id_keputusan}
                    className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
                  >
                    <span className="font-semibold text-white">{p.aksi}</span>
                    {p.nominal_disetujui !== null
                      ? ` · ${IDR.format(p.nominal_disetujui)}`
                      : ""}
                    <span className="text-slate-400">
                      {" "}
                      · {p.created_at} · {p.diputus_oleh}
                    </span>
                    {p.alasan ? (
                      <span className="block text-xs text-slate-300">
                        {p.alasan}
                      </span>
                    ) : null}
                  </li>
                ))}
                {data.keputusan.length === 0 ? (
                  <li className="text-slate-400">Belum diputus.</li>
                ) : null}
              </ul>
            </section>

            {data.bayar.length > 0 ? (
              <section
                aria-labelledby="judul-bayar-klaim"
                className="space-y-2"
              >
                <h3 id="judul-bayar-klaim" className="font-semibold text-white">
                  Pembayaran
                </h3>
                <ul className="space-y-1">
                  {data.bayar.map((b) => (
                    <li key={b.id_bayar} className="text-slate-300">
                      {b.jenis === "Bayar" ? "Dibayar" : "Pembatalan"}{" "}
                      {b.tanggal} · {IDR.format(b.total)} · {b.dicatat_oleh}
                      {b.dibatalkan ? " · dibatalkan" : ""}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {k.status === "Disetujui" && k.status_bayar === "Dibayar" ? (
              <p className="text-xs text-slate-400">
                Klaim yang sudah dibayar baru bisa dibatalkan sesudah
                pembayarannya dibatalkan.
              </p>
            ) : null}

            {aksi ? (
              <form
                className="space-y-3 rounded-xl border border-white/10 p-3"
                onSubmit={putus}
              >
                {aksi === "Setujui" ? (
                  <div>
                    <label className={LABEL} htmlFor="putus-nominal">
                      Nominal disetujui (kosong = {IDR.format(k.nominal)})
                    </label>
                    <input
                      id="putus-nominal"
                      type="number"
                      min={1}
                      max={k.nominal}
                      step={1}
                      value={nominal}
                      onChange={(e) => setNominal(e.target.value)}
                      className={INPUT}
                    />
                  </div>
                ) : null}
                <div>
                  <label className={LABEL} htmlFor="putus-alasan">
                    {aksi === "Setujui"
                      ? "Alasan (wajib bila nominal dikurangi)"
                      : "Alasan"}
                  </label>
                  <textarea
                    id="putus-alasan"
                    rows={2}
                    required={aksi !== "Setujui"}
                    maxLength={MAKS_ALASAN_REIMBURSE}
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    className={`${INPUT} py-2`}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setAksi(null)}
                  >
                    Kembali
                  </button>
                  <button
                    type="submit"
                    className={TOMBOL_UTAMA}
                    disabled={proses !== null}
                  >
                    {proses === "putus" ? "Menyimpan…" : aksi}
                  </button>
                </div>
              </form>
            ) : bisaSetujui || bisaBatal ? (
              <div className="flex flex-wrap justify-end gap-2">
                {bisaBatal ? (
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setAksi("Batal")}
                  >
                    Batalkan klaim
                  </button>
                ) : null}
                {bisaSetujui ? (
                  <>
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() => setAksi("Tolak")}
                    >
                      Tolak
                    </button>
                    <button
                      type="button"
                      className={TOMBOL_UTAMA}
                      onClick={() => {
                        setNominal("");
                        setAksi("Setujui");
                      }}
                    >
                      Setujui
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        {kabar ? (
          <output className="block text-emerald-300">{kabar}</output>
        ) : null}
        <Galat teks={galat} />
      </div>
    </Modal>
  );
}

function ModalBayar({
  org,
  hariIni,
  onClose,
  onBerubah,
}: {
  org: OrgKepegawaian;
  hariIni: string;
  onClose: () => void;
  onBerubah: () => Promise<void>;
}) {
  const [idKaryawan, setIdKaryawan] = useState("");
  const [data, setData] = useState<KlaimPegawai | null>(null);
  const [pilih, setPilih] = useState<string[]>([]);
  const [tanggal, setTanggal] = useState(hariIni);
  const [keterangan, setKeterangan] = useState("");
  const [batal, setBatal] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [kabar, setKabar] = useState<string | null>(null);
  const { proses, galat, setGalat, jalankan } = useKirim();

  const muat = useCallback(
    async (id: string) => {
      if (!id) {
        setData(null);
        return;
      }
      try {
        setData(await muatKlaimPegawai(id));
        setPilih([]);
      } catch (error) {
        setGalat(pesanGalat(error));
      }
    },
    [setGalat],
  );

  const siapBayar =
    data?.klaim.filter(
      (k) => k.status === "Disetujui" && k.status_bayar === "Belum dibayar",
    ) ?? [];
  const total = siapBayar
    .filter((k) => pilih.includes(k.id_klaim))
    .reduce((s, k) => s + (k.nominal_disetujui ?? k.nominal), 0);
  const aktif = data?.bayar.filter((b) => b.jenis === "Bayar") ?? [];

  const segarkan = async (pesan: string) => {
    setKabar(pesan);
    await muat(idKaryawan);
    await onBerubah();
  };

  const kirimBayar = (e: FormEvent) => {
    e.preventDefault();
    void jalankan("bayar", async () => {
      const hasil = await bayarKlaim({
        id_karyawan: idKaryawan,
        id_klaim: pilih,
        tanggal,
        keterangan,
      });
      setKeterangan("");
      await segarkan(`Pembayaran ${IDR.format(hasil.total)} dicatat.`);
    });
  };

  const kirimBatal = (e: FormEvent) => {
    e.preventDefault();
    if (!batal) return;
    void jalankan("batal", async () => {
      await batalBayarKlaim({ id_bayar: batal, alasan });
      setBatal(null);
      setAlasan("");
      await segarkan("Pembayaran dibatalkan.");
    });
  };

  return (
    <Modal
      title="Pembayaran reimbursement"
      onClose={onClose}
      maxWidth="max-w-3xl"
      hideFooter
    >
      <div className="space-y-4 text-sm">
        <form data-tanpa-konfirmasi onSubmit={(e) => e.preventDefault()}>
          <label className={LABEL} htmlFor="bayar-pegawai">
            Pegawai
          </label>
          <PilihCari
            id="bayar-pegawai"
            value={idKaryawan}
            onChange={(e) => {
              setIdKaryawan(e.target.value);
              setKabar(null);
              void muat(e.target.value);
            }}
            className={INPUT}
          >
            <option value="">Pilih pegawai</option>
            {org.pegawai.map((p) => (
              <option key={p.id_unik} value={p.id_unik}>
                {`${p.nama}${p.kode_karyawan ? ` (${p.kode_karyawan})` : ""}`}
              </option>
            ))}
          </PilihCari>
        </form>

        {data ? (
          <>
            <form className="space-y-3" onSubmit={kirimBayar}>
              <fieldset className="space-y-1">
                <legend className="font-semibold text-white">
                  Klaim disetujui yang belum dibayar
                </legend>
                {siapBayar.map((k) => (
                  <label
                    key={k.id_klaim}
                    htmlFor={`bayar-${k.id_klaim}`}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-slate-200"
                  >
                    <input
                      id={`bayar-${k.id_klaim}`}
                      type="checkbox"
                      className="size-4"
                      checked={pilih.includes(k.id_klaim)}
                      onChange={(e) =>
                        setPilih((p) =>
                          e.target.checked
                            ? [...p, k.id_klaim]
                            : p.filter((x) => x !== k.id_klaim),
                        )
                      }
                    />
                    {k.tanggal} · {k.jenis} ·{" "}
                    {IDR.format(k.nominal_disetujui ?? k.nominal)}
                  </label>
                ))}
                {siapBayar.length === 0 ? (
                  <p className="text-slate-400">
                    Tidak ada klaim yang menunggu dibayar.
                  </p>
                ) : null}
              </fieldset>
              {siapBayar.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className={LABEL} htmlFor="bayar-tanggal">
                        Tanggal bayar
                      </label>
                      <input
                        id="bayar-tanggal"
                        type="date"
                        required
                        max={hariIni}
                        value={tanggal}
                        onChange={(e) => setTanggal(e.target.value)}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="bayar-ket">
                        Keterangan (opsional)
                      </label>
                      <input
                        id="bayar-ket"
                        maxLength={MAKS_KETERANGAN_BAYAR}
                        value={keterangan}
                        onChange={(e) => setKeterangan(e.target.value)}
                        className={INPUT}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <span className="text-slate-300">
                      Total {IDR.format(total)}
                    </span>
                    <button
                      type="submit"
                      className={TOMBOL_UTAMA}
                      disabled={proses !== null || pilih.length === 0}
                    >
                      {proses === "bayar" ? "Menyimpan…" : "Catat pembayaran"}
                    </button>
                  </div>
                </>
              ) : null}
            </form>

            <section
              aria-labelledby="judul-riwayat-bayar"
              className="space-y-2"
            >
              <h3 id="judul-riwayat-bayar" className="font-semibold text-white">
                Riwayat pembayaran
              </h3>
              <ul className="space-y-1">
                {aktif.map((b) => (
                  <li
                    key={b.id_bayar}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
                  >
                    <span className="text-slate-200">
                      {b.tanggal} · {IDR.format(b.total)} · {b.klaim.length}{" "}
                      klaim · {b.dicatat_oleh}
                      {b.keterangan ? ` · ${b.keterangan}` : ""}
                      {b.dibatalkan ? (
                        <span className="text-slate-400"> · dibatalkan</span>
                      ) : null}
                    </span>
                    {!b.dibatalkan ? (
                      <button
                        type="button"
                        className={TOMBOL}
                        onClick={() => {
                          setAlasan("");
                          setBatal(b.id_bayar);
                        }}
                      >
                        Batalkan
                      </button>
                    ) : null}
                  </li>
                ))}
                {aktif.length === 0 ? (
                  <li className="text-slate-400">Belum ada pembayaran.</li>
                ) : null}
              </ul>
              {batal ? (
                <form
                  className="space-y-2 rounded-xl border border-white/10 p-3"
                  onSubmit={kirimBatal}
                >
                  <label className={LABEL} htmlFor="batal-bayar-alasan">
                    Alasan pembatalan pembayaran
                  </label>
                  <textarea
                    id="batal-bayar-alasan"
                    required
                    rows={2}
                    maxLength={MAKS_ALASAN_REIMBURSE}
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    className={`${INPUT} py-2`}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() => setBatal(null)}
                    >
                      Kembali
                    </button>
                    <button
                      type="submit"
                      className={TOMBOL_UTAMA}
                      disabled={proses !== null}
                    >
                      {proses === "batal"
                        ? "Menyimpan…"
                        : "Batalkan pembayaran"}
                    </button>
                  </div>
                </form>
              ) : null}
            </section>
          </>
        ) : null}
        {kabar ? (
          <output className="block text-emerald-300">{kabar}</output>
        ) : null}
        <Galat teks={galat} />
      </div>
    </Modal>
  );
}
