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
import { formatTanggalOperasional } from "@/lib/attendance/time-policy";
import {
  batalkanKeluar,
  berlakukanKeluar,
  muatDaftarKeluar,
  muatRincianKeluar,
  type OrgKepegawaian,
  simpanAlasanKeluar,
  simpanKeluar,
} from "@/lib/gateways/hris";
import { syncNow } from "@/lib/gateways/sync-status";
import { formatRupiah } from "@/lib/validations/accounting";
import { tanggalValid } from "@/lib/validations/hari-kerja";
import {
  type AlasanDraft,
  type AlasanKeluar,
  type ChecklistKeluar,
  type DaftarKeluar,
  type IsianRincian,
  type KeluarBaris,
  type KeluarDraft,
  kelompokStatus,
  MAKS_NAMA_ALASAN,
  MAKS_PENGALI,
  MAKS_TEKS_KELUAR,
  MAKS_UPAH,
  masukanPesangon,
  type RincianKeluar,
  type RincianTersimpan,
  ringkasanPesangon,
  type StatusKeluar,
  type Usulan,
  usulanPesangon,
} from "@/lib/validations/hr-keluar";
import { appliesToSubject } from "@/lib/validations/payroll-policy";
import {
  DialogCetakSurat,
  type PermintaanSurat,
  permintaanSuratKeluar,
} from "./DialogCetakSurat";
import {
  INPUT,
  LABEL,
  PERINGATAN,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
} from "./gaya";

/** Isian awal dari tab SP saat SP3 berlaku (§22.2.1). */
export interface AwalKeluar {
  id_karyawan: string;
  id_sp: string;
}

type Izin = "hr.offboard.manage" | "hr.offboard.decide";

const tgl = (t: string) => (t ? formatTanggalOperasional(t) : "-");
const HARI = [
  "",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];
const URUTAN_STATUS: StatusKeluar[] = [
  "Jatuh tempo",
  "Dijadwalkan",
  "Berlaku",
  "Dibatalkan",
];
const WARNA_STATUS: Record<StatusKeluar, string> = {
  "Jatuh tempo": "border-amber-300/40 text-amber-200",
  Dijadwalkan: "border-sky-300/40 text-sky-200",
  Berlaku: "border-rose-300/40 text-rose-300",
  Dibatalkan: "border-white/10 text-slate-400",
};
const BLOKIR =
  "rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100";

/** Ubah hanya selama belum berlaku dan belum dibatalkan. */
const terbuka = (s: StatusKeluar) => s === "Dijadwalkan" || s === "Jatuh tempo";

/**
 * Tab Keluar di /kepegawaian (HRIS Fase 4b, §22.5 layar 2): daftar per status,
 * catat dan ubah proses, rincian dengan checklist (blokir merah, tanda kuning),
 * Berlakukan, dan Batalkan. Data cloud-only; izin di sini hanya menyembunyikan
 * tombol, backend menilai ulang dari sesi. Pesangon, alasan dan pengali, dan
 * cetak surat keluar dari 4c.
 */
export function TabKeluar({
  org,
  awal,
  boleh,
  onAwalTerpakai,
  onPesan,
}: {
  org: OrgKepegawaian;
  awal: AwalKeluar | null;
  boleh: (izin: Izin) => boolean;
  onAwalTerpakai: () => void;
  onPesan: (pesan: string) => void;
}) {
  const [data, setData] = useState<DaftarKeluar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [saring, setSaring] = useState<StatusKeluar | "">("");
  const [form, setForm] = useState<{
    baris: KeluarBaris | null;
    awal: AwalKeluar | null;
    rincian: RincianTersimpan[];
  } | null>(null);
  const [rincian, setRincian] = useState<string | null>(null);
  const [cetak, setCetak] = useState<PermintaanSurat | null>(null);
  const [aturAlasan, setAturAlasan] = useState(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatDaftarKeluar());
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  useEffect(() => {
    if (!awal) return;
    setForm({ baris: null, awal, rincian: [] });
    onAwalTerpakai();
  }, [awal, onAwalTerpakai]);

  if (galat && !data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300" role="alert">
          {galat}
        </p>
        <button type="button" className={TOMBOL} onClick={() => void muat()}>
          Coba lagi
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Memuat…</p>;

  const daftar = data.keluar
    .filter((k) => saring === "" || k.status === saring)
    .sort(
      (a, b) =>
        URUTAN_STATUS.indexOf(a.status) - URUTAN_STATUS.indexOf(b.status),
    );
  const selesai = async (pesan: string) => {
    setForm(null);
    setRincian(null);
    onPesan(pesan);
    await muat();
  };

  return (
    <div className="space-y-4">
      {galat ? (
        <p className="text-sm text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
      <p className="text-sm text-slate-400">
        Selama belum diberlakukan, pegawai tetap aktif: masih scan, ikut Alfa,
        dan ikut gaji. Berlakukan terbuka mulai hari terakhir bekerja.
      </p>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <label htmlFor="saring-keluar" className={LABEL}>
            Status
          </label>
          <select
            id="saring-keluar"
            value={saring}
            onChange={(e) => setSaring(e.target.value as StatusKeluar | "")}
            className={INPUT}
          >
            <option value="">Semua</option>
            {URUTAN_STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {boleh("hr.offboard.decide") ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => setAturAlasan(true)}
            >
              Alasan dan pengali
            </button>
          ) : null}
          {boleh("hr.offboard.manage") ? (
            <button
              type="button"
              className={TOMBOL_UTAMA}
              onClick={() => setForm({ baris: null, awal: null, rincian: [] })}
            >
              Catat proses keluar
            </button>
          ) : null}
        </div>
      </div>
      <ul className="space-y-2">
        {daftar.map((k) => (
          <li
            key={k.id_keluar}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <span className="font-semibold text-white">{k.nama}</span>
              <span className="text-slate-400">
                {k.unit ? ` · ${k.unit}` : ""} · {k.alasan_nama}
              </span>
              <span className="block text-slate-300">
                Hari terakhir {tgl(k.tanggal_terakhir)}
                {k.status_kepegawaian ? ` · ${k.status_kepegawaian}` : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${WARNA_STATUS[k.status]}`}
              >
                {k.status}
              </span>
              <button
                type="button"
                className={TOMBOL}
                onClick={() => setRincian(k.id_keluar)}
              >
                Rincian
              </button>
            </div>
          </li>
        ))}
        {daftar.length === 0 ? (
          <li className="text-sm text-slate-400">Belum ada proses keluar.</li>
        ) : null}
      </ul>

      {form ? (
        <FormKeluar
          org={org}
          alasan={data.alasan}
          hariIni={data.hari_ini}
          baris={form.baris}
          awal={form.awal}
          rincianAwal={form.rincian}
          onClose={() => setForm(null)}
          onSelesai={selesai}
        />
      ) : null}
      {rincian ? (
        <RincianKeluarModal
          idKeluar={rincian}
          boleh={boleh}
          onClose={() => setRincian(null)}
          onUbah={(baris, isi) => {
            setRincian(null);
            setForm({ baris, awal: null, rincian: isi });
          }}
          onCetak={(permintaan) => {
            // Dialog cetak dibuka sesudah modal rincian ditutup: Escape di
            // `Modal` menutup setiap modal yang terbuka.
            setRincian(null);
            setCetak(permintaan);
          }}
          onSelesai={selesai}
        />
      ) : null}
      {cetak ? (
        <DialogCetakSurat permintaan={cetak} onClose={() => setCetak(null)} />
      ) : null}
      {aturAlasan ? (
        <AlasanKeluarModal
          alasan={data.alasan}
          onClose={() => setAturAlasan(false)}
          onTersimpan={(daftarBaru) => {
            setData((lama) => (lama ? { ...lama, alasan: daftarBaru } : lama));
            onPesan("Alasan keluar disimpan.");
          }}
        />
      ) : null}
    </div>
  );
}

function FormKeluar({
  org,
  alasan,
  hariIni,
  baris,
  awal,
  rincianAwal,
  onClose,
  onSelesai,
}: {
  org: OrgKepegawaian;
  alasan: AlasanKeluar[];
  hariIni: string;
  baris: KeluarBaris | null;
  awal: AwalKeluar | null;
  /** Rincian tersimpan saat mengubah: nominal yang beda dari usulan dipertahankan. */
  rincianAwal: RincianTersimpan[];
  onClose: () => void;
  onSelesai: (pesan: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<KeluarDraft>(() => ({
    id_keluar: baris?.id_keluar ?? "",
    id_karyawan: baris?.id_karyawan ?? awal?.id_karyawan ?? "",
    // SP3 berlaku mengusulkan PHK Pelanggaran (§22.2.1).
    id_alasan: baris?.id_alasan ?? (awal ? "klr-pelanggaran" : ""),
    id_sp: baris?.id_sp ?? awal?.id_sp ?? "",
    tanggal_pemberitahuan: baris?.tanggal_pemberitahuan ?? "",
    tanggal_terakhir: baris?.tanggal_terakhir ?? hariIni,
    keterangan: baris?.keterangan ?? "",
    kartu_ditarik: baris?.kartu_ditarik ?? false,
    catatan_checklist: baris?.catatan_checklist ?? "",
    // `null` = ikut usulan; upah yang dulu diubah tetap diubah.
    upah_pokok:
      baris && baris.upah_pokok !== baris.usulan_upah_pokok
        ? baris.upah_pokok
        : null,
    alasan_upah: baris?.alasan_upah ?? "",
    tunjangan_tetap: baris?.tunjangan_tetap ?? 0,
  }));
  // Hanya nominal yang beda dari usulan; sisanya mengikuti usulan terbaru.
  const [isian, setIsian] = useState<IsianRincian[]>(() =>
    rincianAwal
      .filter((r) => r.nominal !== r.usulan)
      .map((r) => ({
        komponen: r.komponen,
        nominal: r.nominal,
        alasan_ubah: r.alasan_ubah,
      })),
  );
  const [pratinjau, setPratinjau] = useState<RincianKeluar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);
  const ubah = (kunci: keyof KeluarDraft, nilai: string | boolean) =>
    setDraft((d) => ({ ...d, [kunci]: nilai }));
  const pegawai = org.pegawai.filter(
    (p) =>
      p.id_unik === draft.id_karyawan || (p.status_aktif === "Aktif" && !baris),
  );
  const pilihanAlasan = alasan.filter(
    (a) => a.is_aktif || a.id_alasan === draft.id_alasan,
  );

  // Checklist dan bahan usulan dimuat ulang setiap pegawai atau hari terakhir
  // berubah; usulan dihitung di layar dengan aturan yang sama dengan backend.
  const idKaryawan = draft.id_karyawan;
  const tanggalTerakhir = draft.tanggal_terakhir ?? "";
  useEffect(() => {
    setPratinjau(null);
    if (!idKaryawan || !tanggalValid(tanggalTerakhir)) return;
    let berlaku = true;
    muatRincianKeluar({ idKaryawan, tanggalTerakhir })
      .then((hasil) => {
        if (berlaku) setPratinjau(hasil);
      })
      .catch((error: unknown) => {
        if (berlaku) setGalat(pesanGalat(error));
      });
    return () => {
      berlaku = false;
    };
  }, [idKaryawan, tanggalTerakhir]);

  const alasanIni = alasan.find((a) => a.id_alasan === draft.id_alasan);
  const usulanUpah = pratinjau?.pesangon.usulan_upah_pokok ?? 0;
  const upahPokok = draft.upah_pokok ?? usulanUpah;
  const usulan: Usulan[] =
    pratinjau && alasanIni
      ? usulanPesangon(
          masukanPesangon(
            pratinjau.pesangon,
            pratinjau.pegawai,
            alasanIni,
            pratinjau.checklist.sisa_cuti,
            tanggalTerakhir,
            upahPokok + (draft.tunjangan_tetap ?? 0),
          ),
        )
      : [];

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      // Komponen yang tidak lagi diusulkan (alasan atau status berubah) dibuang.
      await simpanKeluar({
        ...draft,
        alasan_upah: upahPokok !== usulanUpah ? draft.alasan_upah : "",
        rincian: isian
          .filter((i) =>
            usulan.some(
              (u) => u.komponen === i.komponen && u.usulan !== i.nominal,
            ),
          )
          .map((i) => ({ ...i, alasan_ubah: i.alasan_ubah ?? "" })),
      });
      await onSelesai(
        baris ? "Proses keluar diperbarui." : "Proses keluar dicatat.",
      );
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title={baris ? `Ubah proses keluar ${baris.nama}` : "Catat proses keluar"}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-2xl"
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label htmlFor="keluar-pegawai" className={LABEL}>
            Pegawai
          </label>
          <PilihCari
            id="keluar-pegawai"
            required
            disabled={Boolean(baris)}
            value={draft.id_karyawan}
            onChange={(e) => {
              ubah("id_karyawan", e.target.value);
              setPratinjau(null);
            }}
            className={INPUT}
          >
            <option value="">Pilih pegawai</option>
            {pegawai.map((p) => (
              <option key={p.id_unik} value={p.id_unik}>
                {p.nama}
                {p.unit ? ` · ${p.unit}` : ""}
              </option>
            ))}
          </PilihCari>
        </div>
        <div>
          <label htmlFor="keluar-alasan" className={LABEL}>
            Alasan keluar
          </label>
          <select
            id="keluar-alasan"
            required
            value={draft.id_alasan}
            onChange={(e) => ubah("id_alasan", e.target.value)}
            className={INPUT}
          >
            <option value="">Pilih alasan</option>
            {pilihanAlasan.map((a) => (
              <option key={a.id_alasan} value={a.id_alasan}>
                {a.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="keluar-terakhir" className={LABEL}>
              Hari terakhir bekerja
            </label>
            <input
              id="keluar-terakhir"
              type="date"
              required
              value={draft.tanggal_terakhir}
              onChange={(e) => {
                ubah("tanggal_terakhir", e.target.value);
                setPratinjau(null);
              }}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="keluar-pemberitahuan" className={LABEL}>
              Tanggal pemberitahuan (opsional)
            </label>
            <input
              id="keluar-pemberitahuan"
              type="date"
              max={draft.tanggal_terakhir}
              value={draft.tanggal_pemberitahuan}
              onChange={(e) => ubah("tanggal_pemberitahuan", e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <div>
          <label htmlFor="keluar-keterangan" className={LABEL}>
            Keterangan (opsional)
          </label>
          <textarea
            id="keluar-keterangan"
            maxLength={MAKS_TEKS_KELUAR}
            rows={2}
            value={draft.keterangan}
            onChange={(e) => ubah("keterangan", e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={draft.kartu_ditarik}
            onChange={(e) => ubah("kartu_ditarik", e.target.checked)}
          />
          Kartu ID sudah ditarik
        </label>
        <div>
          <label htmlFor="keluar-catatan" className={LABEL}>
            Catatan checklist (opsional)
          </label>
          <textarea
            id="keluar-catatan"
            maxLength={MAKS_TEKS_KELUAR}
            rows={2}
            value={draft.catatan_checklist}
            onChange={(e) => ubah("catatan_checklist", e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        {pratinjau && alasanIni ? (
          <BagianPesangon
            pratinjau={pratinjau}
            draft={draft}
            usulan={usulan}
            isian={isian}
            onDraft={(kunci, nilai) =>
              setDraft((d) => ({ ...d, [kunci]: nilai }))
            }
            onIsian={setIsian}
          />
        ) : idKaryawan && draft.id_alasan && !pratinjau ? (
          <p className="text-sm text-slate-400">Menghitung usulan pesangon…</p>
        ) : null}
        {pratinjau ? (
          <DaftarChecklist
            checklist={pratinjau.checklist}
            tanggalTerakhir={tanggalTerakhir}
          />
        ) : null}
        {galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
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

function RincianKeluarModal({
  idKeluar,
  boleh,
  onClose,
  onUbah,
  onCetak,
  onSelesai,
}: {
  idKeluar: string;
  boleh: (izin: Izin) => boolean;
  onClose: () => void;
  onUbah: (baris: KeluarBaris, rincian: RincianTersimpan[]) => void;
  onCetak: (permintaan: PermintaanSurat) => void;
  onSelesai: (pesan: string) => Promise<void>;
}) {
  const [data, setData] = useState<RincianKeluar | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [aksi, setAksi] = useState<"berlakukan" | "batalkan" | null>(null);
  const [alasan, setAlasan] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatRincianKeluar({ idKeluar }));
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, [idKeluar]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (kerja: () => Promise<unknown>, pesan: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      await kerja();
      // `master_data` berubah di cloud; tarik ke perangkat ini sekarang.
      try {
        await syncNow();
      } catch {
        // Offline-first: sinkron berikutnya menyusul.
      }
      await onSelesai(pesan);
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const k = data?.keluar;
  return (
    <Modal
      title={k ? `Keluar: ${k.nama}` : "Rincian proses keluar"}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-3xl"
    >
      {!data || !k ? (
        galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : (
          <p className="text-sm text-slate-400">Memuat…</p>
        )
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Isian label="Status" nilai={k.status} />
            <Isian label="Alasan" nilai={k.alasan_nama} />
            <Isian label="Hari terakhir" nilai={tgl(k.tanggal_terakhir)} />
            <Isian label="Pemberitahuan" nilai={tgl(k.tanggal_pemberitahuan)} />
            <Isian
              label="Status kepegawaian"
              nilai={k.status_kepegawaian || "-"}
            />
            <Isian label="Mulai bekerja" nilai={tgl(k.masa_kerja_mulai)} />
            <Isian
              label="Kartu ID"
              nilai={k.kartu_ditarik ? "Sudah ditarik" : "Belum ditarik"}
            />
            <Isian label="Dicatat" nilai={k.dicatat_oleh} />
            {k.berlaku_pada ? (
              <Isian
                label="Diberlakukan"
                nilai={`${k.berlaku_oleh} · ${k.berlaku_pada}`}
              />
            ) : null}
            {k.dibatalkan_pada ? (
              <Isian
                label="Dibatalkan"
                nilai={`${k.dibatalkan_oleh} · ${k.alasan_batal}`}
              />
            ) : null}
          </dl>
          {k.keterangan ? (
            <p className="text-sm text-slate-300">{k.keterangan}</p>
          ) : null}
          {k.catatan_checklist ? (
            <p className="text-sm text-slate-300">
              Catatan checklist: {k.catatan_checklist}
            </p>
          ) : null}
          <RincianPesangon k={k} data={data} />
          {k.status === "Berlaku" ? (
            <div className="flex flex-wrap gap-2">
              {kelompokStatus(k.status_kepegawaian) === "tetap" ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() =>
                    onCetak(
                      permintaanSuratKeluar(
                        k,
                        "berhenti",
                        boleh("hr.offboard.manage"),
                      ),
                    )
                  }
                >
                  Cetak SK Pemberhentian
                </button>
              ) : null}
              {kelompokStatus(k.status_kepegawaian) !== "negeri" ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() =>
                    onCetak(
                      permintaanSuratKeluar(
                        k,
                        "pengalaman",
                        boleh("hr.offboard.manage"),
                      ),
                    )
                  }
                >
                  Cetak surat keterangan kerja
                </button>
              ) : null}
            </div>
          ) : null}
          {k.status !== "Dibatalkan" ? (
            <DaftarChecklist
              checklist={data.checklist}
              tanggalTerakhir={k.tanggal_terakhir}
            />
          ) : null}
          {galat ? (
            <p className="text-sm text-rose-300" role="alert">
              {galat}
            </p>
          ) : null}

          {aksi === "berlakukan" ? (
            <div className={PERINGATAN}>
              <p>
                Sejak diberlakukan, scan {k.nama} ditolak di semua perangkat,
                statusnya Nonaktif dengan tanggal selesai{" "}
                {tgl(k.tanggal_terakhir)}
                {data.checklist.akun.length > 0
                  ? `, dan ${data.checklist.akun.length} akun tertautnya dinonaktifkan serta keluar dari sesi Web`
                  : ""}
                . Data guru, kontrak, dan tugas tambahan tidak diubah.
              </p>
              {data.checklist.alfa_sesudah > 0 ? (
                <p className="mt-2">
                  Ada {data.checklist.alfa_sesudah} Alfa sistem sesudah hari
                  terakhir. Alfa itu tidak dihapus otomatis.
                </p>
              ) : null}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setAksi(null)}
                >
                  Kembali
                </button>
                <button
                  type="button"
                  className={TOMBOL_UTAMA}
                  disabled={menyimpan}
                  onClick={() =>
                    void jalankan(
                      () => berlakukanKeluar(k.id_keluar),
                      `Proses keluar ${k.nama} berlaku.`,
                    )
                  }
                >
                  Ya, berlakukan
                </button>
              </div>
            </div>
          ) : aksi === "batalkan" ? (
            <form
              className="space-y-3"
              data-tanpa-konfirmasi
              onSubmit={(e) => {
                e.preventDefault();
                void jalankan(
                  () => batalkanKeluar(k.id_keluar, alasan),
                  "Proses keluar dibatalkan.",
                );
              }}
            >
              <div>
                <label htmlFor="alasan-batal-keluar" className={LABEL}>
                  Alasan pembatalan
                </label>
                <textarea
                  id="alasan-batal-keluar"
                  required
                  maxLength={MAKS_TEKS_KELUAR}
                  rows={3}
                  value={alasan}
                  onChange={(e) => setAlasan(e.target.value)}
                  className={`${INPUT} py-2`}
                />
              </div>
              <p className={PERINGATAN}>
                {k.status === "Berlaku"
                  ? "Pegawai aktif kembali, tetapi akun operatornya tetap nonaktif sampai diaktifkan Superadmin di menu Operator."
                  : "Pembatalan tidak bisa ditarik kembali; datanya tetap tercatat sebagai dibatalkan."}
              </p>
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
                  disabled={menyimpan}
                >
                  Batalkan proses
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3">
              {boleh("hr.offboard.manage") && terbuka(k.status) ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => onUbah(k, data.rincian)}
                >
                  Ubah
                </button>
              ) : null}
              {boleh("hr.offboard.decide") && k.status !== "Dibatalkan" ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setAksi("batalkan")}
                >
                  Batalkan
                </button>
              ) : null}
              {boleh("hr.offboard.decide") && k.status === "Jatuh tempo" ? (
                <button
                  type="button"
                  className={TOMBOL_UTAMA}
                  disabled={data.checklist.blokir > 0}
                  title={
                    data.checklist.blokir > 0
                      ? "Selesaikan butir merah di checklist dulu."
                      : undefined
                  }
                  onClick={() => setAksi("berlakukan")}
                >
                  Berlakukan
                </button>
              ) : null}
            </div>
          )}
          {k.status === "Dijadwalkan" && boleh("hr.offboard.decide") ? (
            <p className="text-xs text-slate-400">
              Berlakukan terbuka mulai {tgl(k.tanggal_terakhir)}.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Isian({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-100">{nilai || "-"}</dd>
    </div>
  );
}

/** Checklist §22.2.2: blokir merah, tanda kuning, sisanya ringkas. */
function DaftarChecklist({
  checklist: c,
  tanggalTerakhir,
}: {
  checklist: ChecklistKeluar;
  tanggalTerakhir: string;
}) {
  const sesudah = `sesudah ${tgl(tanggalTerakhir)}`;
  // Tiap butir: [id baris, teks].
  const semuaTanda: { judul: string; isi: [string, string][] }[] = [
    {
      judul: `Tugas tambahan masih berjalan ${sesudah}. Akhiri di tab Tugas Tambahan.`,
      isi: c.tugas.map((t) => [
        t.id_tugas,
        `${t.nama_jenis} · ${t.tahun_ajaran}`,
      ]),
    },
    {
      judul:
        "Barang dipinjam belum kembali. Pengembalian tetap bisa dicatat sesudah keluar.",
      isi: c.barang.map((b) => [
        b.id_mutasi,
        `${b.nama_barang} · ${b.jumlah} ${b.satuan} sejak ${tgl(b.tanggal)}`,
      ]),
    },
    {
      judul: `Sisa kasbon ${formatRupiah(c.sisa_kasbon)}. Lunasi lewat Pelunasan Tunai di menu Kasbon.`,
      isi:
        c.sisa_kasbon > 0
          ? c.kasbon.map((k) => [k.id_pinjaman, formatRupiah(k.sisa)])
          : [],
    },
    {
      judul:
        "Rapel menunggu. Dibayar di proses gaji periode yang memuat hari terakhir.",
      isi: c.rapel.map((r) => [
        r.id_rapel,
        `${tgl(r.period_start)}–${tgl(r.period_end)} · ${formatRupiah(r.jumlah)}`,
      ]),
    },
    {
      judul: `Pengajuan cuti/izin berjalan ${sesudah}.`,
      isi: c.pengajuan.map((p) => [
        p.id_pengajuan,
        `${p.nama_jenis} · ${tgl(p.tanggal_mulai)}–${tgl(p.tanggal_selesai)}`,
      ]),
    },
    {
      judul: `Masih menjadi guru pengganti ${sesudah}.`,
      isi: c.jp_pengganti.map((j) => [
        j.id_penanganan,
        `${tgl(j.tanggal)} jam ${j.jam_ke} · menggantikan ${j.nama_guru}`,
      ]),
    },
    {
      judul:
        "Gaji masa terakhir sudah diproses, jadi PPh 21 masa terakhir belum direkonsiliasi. Tolak proses gaji itu lalu buat ulang sesudah Berlakukan.",
      isi: c.run_masa_terakhir.map((r) => [
        r.id,
        `${tgl(r.period_start)}–${tgl(r.period_end)} · ${r.status}`,
      ]),
    },
  ];
  const tanda = semuaTanda.filter((t) => t.isi.length > 0);
  const cuti = c.sisa_cuti;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">Checklist</h3>
      {c.jadwal.length > 0 ? (
        <div className={BLOKIR}>
          <p className="font-semibold">
            Jadwal mengajar aktif {sesudah}. Alihkan ke guru lain di Jadwal.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {c.jadwal.map((j) => (
              <li key={j.id_jadwal}>
                {HARI[Number(j.hari)] ?? j.hari} jam {j.jam_ke} ·{" "}
                {j.nama_rombel} · {j.nama_mapel} ({j.nama_tahun} {j.semester})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.wali.length > 0 ? (
        <div className={BLOKIR}>
          <p className="font-semibold">
            Masih wali kelas {sesudah}. Ganti wali kelasnya di Rombel.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {c.wali.map((w) => (
              <li key={w.id_rombel}>
                {w.nama_rombel} ({w.nama_tahun} {w.semester})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tanda.map((t) => (
        <div key={t.judul} className={PERINGATAN}>
          <p className="font-semibold">{t.judul}</p>
          <ul className="mt-1 list-disc pl-5">
            {t.isi.map(([kunci, isi]) => (
              <li key={kunci}>{isi}</li>
            ))}
          </ul>
        </div>
      ))}
      {cuti && cuti.sisa > 0 && !cuti.sebelum_berhak ? (
        <p className={PERINGATAN}>
          Sisa cuti {cuti.sisa} hari pada periode {tgl(cuti.mulai)}–
          {tgl(cuti.selesai)}.
        </p>
      ) : null}
      <p className="text-sm text-slate-300">
        {c.akun.length > 0
          ? `Akun operator tertaut (${c.akun.map((a) => a.username).join(", ")}) dinonaktifkan otomatis saat Berlakukan.`
          : "Tidak ada akun operator yang tertaut."}
      </p>
      {c.blokir === 0 && tanda.length === 0 ? (
        <p className="text-sm text-emerald-300">
          Tidak ada butir yang perlu dibereskan.
        </p>
      ) : null}
    </div>
  );
}

/** Isian rupiah: bilangan bulat ≥ 0; kosong atau rusak = 0. */
function rupiahMasukan(teks: string): number {
  const n = Math.trunc(Number(teks));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Upah, tunjangan tetap, dan rincian pesangon di form keluar (§22.2.3). Usulan
 * dihitung `usulanPesangon` dari bahan cloud; backend menghitung ulang saat
 * simpan dengan aturan yang sama.
 */
function BagianPesangon({
  pratinjau,
  draft,
  usulan,
  isian,
  onDraft,
  onIsian,
}: {
  pratinjau: RincianKeluar;
  draft: KeluarDraft;
  usulan: Usulan[];
  isian: IsianRincian[];
  onDraft: (
    kunci: "upah_pokok" | "alasan_upah" | "tunjangan_tetap",
    nilai: string | number | null,
  ) => void;
  onIsian: (ubah: (lama: IsianRincian[]) => IsianRincian[]) => void;
}) {
  const b = pratinjau.pesangon;
  const usulanUpah = b.usulan_upah_pokok;
  const upahPokok = draft.upah_pokok ?? usulanUpah;
  const acuan = b.tunjangan.filter((t) =>
    appliesToSubject(t.applies_to, {
      id_karyawan: pratinjau.pegawai.id_unik,
      jenis_personil: pratinjau.pegawai.jenis_personil,
      status_kepegawaian: b.status,
      divisi: pratinjau.pegawai.divisi,
      tugas: b.tugas,
      total_teaching_jp: 0,
      total_hadir: 0,
    }),
  );
  const isiDari = (u: Usulan) => isian.find((i) => i.komponen === u.komponen);
  const nominalDari = (u: Usulan) => isiDari(u)?.nominal ?? u.usulan;
  const ubahNominal = (u: Usulan, teks: string) => {
    const nominal = rupiahMasukan(teks);
    onIsian((lama) => {
      const lain = lama.filter((i) => i.komponen !== u.komponen);
      if (nominal === u.usulan) return lain;
      const sebelum = lama.find((i) => i.komponen === u.komponen);
      return [
        ...lain,
        {
          komponen: u.komponen,
          nominal,
          alasan_ubah: sebelum?.alasan_ubah ?? null,
        },
      ];
    });
  };
  const ubahAlasan = (u: Usulan, teks: string) =>
    onIsian((lama) =>
      lama.map((i) =>
        i.komponen === u.komponen ? { ...i, alasan_ubah: teks } : i,
      ),
    );
  const ringkasan = ringkasanPesangon(
    usulan.map(nominalDari),
    pratinjau.checklist.sisa_kasbon,
  );

  return (
    <fieldset className="space-y-3 rounded-xl border border-white/10 p-3">
      <legend className="px-1 text-sm font-semibold text-white">
        Pesangon
      </legend>
      <p className="text-xs text-slate-400">
        Status kepegawaian pada hari terakhir: {b.status || "tanpa status"}.
        Angka di bawah adalah usulan aturan; nominal yang diubah wajib diberi
        alasan. Rincian beku sejak proses diberlakukan dan tidak ikut dicetak.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="keluar-upah" className={LABEL}>
            Upah pokok sebulan (Rp)
          </label>
          <input
            id="keluar-upah"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAKS_UPAH}
            step={1}
            required
            value={upahPokok}
            onChange={(e) => {
              const n = rupiahMasukan(e.target.value);
              onDraft("upah_pokok", n === usulanUpah ? null : n);
            }}
            className={INPUT}
            aria-describedby="keluar-upah-catatan"
          />
          <p id="keluar-upah-catatan" className="mt-1 text-xs text-slate-400">
            {b.bulan_slip > 0
              ? `Usulan ${formatRupiah(usulanUpah)}: rata-rata gaji pokok jam + honor JP dari slip yang sudah dibayar, ${b.bulan_slip} bulan dalam 12 bulan terakhir.`
              : "Belum ada slip yang dibayar dalam 12 bulan terakhir, jadi upahnya diisi tangan dengan alasan."}
          </p>
        </div>
        <div>
          <label htmlFor="keluar-tunjangan" className={LABEL}>
            Tunjangan tetap sebulan (Rp)
          </label>
          <input
            id="keluar-tunjangan"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAKS_UPAH}
            step={1}
            value={draft.tunjangan_tetap ?? 0}
            onChange={(e) =>
              onDraft("tunjangan_tetap", rupiahMasukan(e.target.value))
            }
            className={INPUT}
            aria-describedby="keluar-tunjangan-acuan"
          />
          <p
            id="keluar-tunjangan-acuan"
            className="mt-1 text-xs text-slate-400"
          >
            {acuan.length > 0
              ? `Acuan dari komponen gaji: ${acuan.map((t) => `${t.name} ${formatRupiah(t.nilai)}`).join(", ")}. Tidak dijumlahkan otomatis.`
              : "Tidak ada tunjangan nominal tetap di komponen gaji yang berlaku untuk pegawai ini."}
          </p>
        </div>
      </div>
      {upahPokok !== usulanUpah ? (
        <div>
          <label htmlFor="keluar-alasan-upah" className={LABEL}>
            Alasan upah berbeda dari usulan
          </label>
          <input
            id="keluar-alasan-upah"
            required
            maxLength={MAKS_TEKS_KELUAR}
            value={draft.alasan_upah ?? ""}
            onChange={(e) => onDraft("alasan_upah", e.target.value)}
            className={INPUT}
          />
        </div>
      ) : null}
      {usulan.length === 0 ? (
        <p className="text-sm text-slate-300">
          PNS dan PPPK tidak mendapat rincian pesangon dari yayasan; haknya
          dibayar instansinya.
        </p>
      ) : (
        <ul className="space-y-2">
          {usulan.map((u) => {
            const nominal = nominalDari(u);
            const id = `keluar-nominal-${KOMPONEN_ID[u.komponen]}`;
            return (
              <li
                key={u.komponen}
                className="grid gap-2 rounded-xl border border-white/10 bg-slate-950 p-2 sm:grid-cols-[1fr_12rem]"
              >
                <div className="min-w-0 text-sm">
                  <label htmlFor={id} className="font-semibold text-white">
                    {u.komponen}
                  </label>
                  <p className="text-xs text-slate-400">
                    {u.dasar ?? "Diisi bila ada"} · usulan{" "}
                    {formatRupiah(u.usulan)}
                  </p>
                </div>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={nominal}
                  onChange={(e) => ubahNominal(u, e.target.value)}
                  className={INPUT}
                />
                {nominal !== u.usulan ? (
                  <div className="sm:col-span-2">
                    <label htmlFor={`${id}-alasan`} className={LABEL}>
                      Alasan nominal {u.komponen} berbeda dari usulan
                    </label>
                    <input
                      id={`${id}-alasan`}
                      required
                      maxLength={MAKS_TEKS_KELUAR}
                      value={isiDari(u)?.alasan_ubah ?? ""}
                      onChange={(e) => ubahAlasan(u, e.target.value)}
                      className={INPUT}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Ringkasan
        total={ringkasan.total}
        sisaKasbon={ringkasan.sisa_kasbon}
        diterima={ringkasan.perkiraan_diterima}
      />
    </fieldset>
  );
}

/** Id elemen per komponen (nama komponen memuat spasi). */
const KOMPONEN_ID: Record<IsianRincian["komponen"], string> = {
  UP: "up",
  UPMK: "upmk",
  "UPH Cuti": "uph-cuti",
  "UPH Lainnya": "uph-lain",
  "Kompensasi PKWT": "kompensasi",
  "Uang Pisah": "uang-pisah",
  Lainnya: "lainnya",
};

function Ringkasan({
  total,
  sisaKasbon,
  diterima,
}: {
  total: number;
  sisaKasbon: number;
  diterima: number;
}) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-3">
      <Isian label="Total rincian" nilai={formatRupiah(total)} />
      <Isian label="Dikurangi sisa kasbon" nilai={formatRupiah(sisaKasbon)} />
      <Isian
        label={diterima < 0 ? "Kasbon belum tertutup" : "Perkiraan diterima"}
        nilai={formatRupiah(Math.abs(diterima))}
      />
    </dl>
  );
}

/** Rincian pesangon tersimpan di modal rincian (beku sejak berlaku). */
function RincianPesangon({ k, data }: { k: KeluarBaris; data: RincianKeluar }) {
  if (data.rincian.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        {kelompokStatus(k.status_kepegawaian) === "negeri"
          ? "PNS dan PPPK: tanpa rincian pesangon dari yayasan."
          : terbuka(k.status)
            ? "Rincian pesangon belum dihitung. Buka Ubah lalu simpan untuk mengisi upah dan rinciannya."
            : "Proses ini tidak punya rincian pesangon."}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">Pesangon</h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Isian label="Upah pokok" nilai={formatRupiah(k.upah_pokok)} />
        <Isian
          label="Tunjangan tetap"
          nilai={formatRupiah(k.tunjangan_tetap)}
        />
        {k.upah_pokok !== k.usulan_upah_pokok ? (
          <Isian
            label={`Usulan upah ${formatRupiah(k.usulan_upah_pokok)}, diubah karena`}
            nilai={k.alasan_upah}
          />
        ) : null}
      </dl>
      <ul className="space-y-1 text-sm">
        {data.rincian.map((r) => (
          <li
            key={r.komponen}
            className="flex flex-wrap justify-between gap-2 border-b border-white/5 pb-1"
          >
            <span className="min-w-0 text-slate-200">
              {r.komponen}
              {r.dasar ? (
                <span className="block text-xs text-slate-400">{r.dasar}</span>
              ) : null}
              {r.nominal !== r.usulan ? (
                <span className="block text-xs text-amber-200">
                  Usulan {formatRupiah(r.usulan)}; {r.alasan_ubah}
                </span>
              ) : null}
            </span>
            <span className="font-semibold text-white">
              {formatRupiah(r.nominal)}
            </span>
          </li>
        ))}
      </ul>
      <Ringkasan
        total={data.ringkasan.total}
        sisaKasbon={data.ringkasan.sisa_kasbon}
        diterima={data.ringkasan.perkiraan_diterima}
      />
    </div>
  );
}

const ALASAN_BARU: AlasanDraft = {
  id_alasan: "",
  nama: "",
  pengali_up: 0,
  pengali_upmk: 0,
  uph: true,
  kompensasi_pkwt: false,
  uang_pisah: false,
  is_aktif: true,
  dasar_hukum: "",
};

/**
 * Alasan keluar dan pengalinya (`hr.offboard.decide`, Q-84). Proses yang
 * sudah berlaku tidak tersentuh; yang belum berlaku memakai angka baru saat
 * disimpan berikutnya.
 */
function AlasanKeluarModal({
  alasan,
  onClose,
  onTersimpan,
}: {
  alasan: AlasanKeluar[];
  onClose: () => void;
  onTersimpan: (alasan: AlasanKeluar[]) => void;
}) {
  const [daftar, setDaftar] = useState(alasan);
  const [isi, setIsi] = useState<AlasanDraft | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);
  const ubah = (kunci: keyof AlasanDraft, nilai: string | number | boolean) =>
    setIsi((lama) => (lama ? { ...lama, [kunci]: nilai } : lama));

  const simpan = async (event: FormEvent) => {
    event.preventDefault();
    if (!isi || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      const hasil = await simpanAlasanKeluar(isi);
      setDaftar(hasil.alasan);
      onTersimpan(hasil.alasan);
      setIsi(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title="Alasan keluar dan pengali"
      onClose={onClose}
      hideFooter
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <p className={PERINGATAN}>
          Pengali dalam persen dari kelipatan UP dan UPMK. Angka bawaan wajib
          dicek ulang yayasan atau konsultan. Proses yang sudah berlaku tidak
          berubah; proses yang belum berlaku memakai angka baru saat disimpan
          lagi.
        </p>
        {isi ? (
          <form className="space-y-3" onSubmit={simpan}>
            <div>
              <label htmlFor="alasan-nama" className={LABEL}>
                Nama alasan
              </label>
              <input
                id="alasan-nama"
                required
                maxLength={MAKS_NAMA_ALASAN}
                value={isi.nama}
                onChange={(e) => ubah("nama", e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="alasan-up" className={LABEL}>
                  Pengali UP (%)
                </label>
                <input
                  id="alasan-up"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAKS_PENGALI}
                  step={1}
                  required
                  value={isi.pengali_up}
                  onChange={(e) =>
                    ubah("pengali_up", rupiahMasukan(e.target.value))
                  }
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="alasan-upmk" className={LABEL}>
                  Pengali UPMK (%)
                </label>
                <input
                  id="alasan-upmk"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAKS_PENGALI}
                  step={1}
                  required
                  value={isi.pengali_upmk}
                  onChange={(e) =>
                    ubah("pengali_upmk", rupiahMasukan(e.target.value))
                  }
                  className={INPUT}
                />
              </div>
            </div>
            {(
              [
                ["uph", "Uang penggantian hak (sisa cuti dan lainnya)"],
                ["kompensasi_pkwt", "Kompensasi kontrak untuk GTT dan PTT"],
                ["uang_pisah", "Uang pisah untuk GTY dan PTY"],
                [
                  "is_aktif",
                  "Aktif (bisa dipilih saat mencatat proses keluar)",
                ],
              ] as const
            ).map(([kunci, label]) => (
              <label
                key={kunci}
                className="flex items-center gap-2 text-sm text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={isi[kunci]}
                  onChange={(e) => ubah(kunci, e.target.checked)}
                />
                {label}
              </label>
            ))}
            <div>
              <label htmlFor="alasan-dasar" className={LABEL}>
                Dasar hukum (opsional)
              </label>
              <textarea
                id="alasan-dasar"
                maxLength={MAKS_TEKS_KELUAR}
                rows={2}
                value={isi.dasar_hukum ?? ""}
                onChange={(e) => ubah("dasar_hukum", e.target.value)}
                className={`${INPUT} py-2`}
              />
            </div>
            {galat ? (
              <p className="text-sm text-rose-300" role="alert">
                {galat}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={TOMBOL}
                onClick={() => setIsi(null)}
              >
                Kembali
              </button>
              <button
                type="submit"
                className={TOMBOL_UTAMA}
                disabled={menyimpan}
              >
                Simpan alasan
              </button>
            </div>
          </form>
        ) : (
          <>
            <ul className="space-y-2">
              {daftar.map((a) => (
                <li
                  key={a.id_alasan}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-white">{a.nama}</span>
                    {a.is_aktif ? null : (
                      <span className="text-slate-400"> · nonaktif</span>
                    )}
                    <span className="block text-xs text-slate-400">
                      UP {a.pengali_up}% · UPMK {a.pengali_upmk}%
                      {a.uph ? " · UPH" : ""}
                      {a.kompensasi_pkwt ? " · kompensasi kontrak" : ""}
                      {a.uang_pisah ? " · uang pisah" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() =>
                      setIsi({
                        id_alasan: a.id_alasan,
                        nama: a.nama,
                        pengali_up: a.pengali_up,
                        pengali_upmk: a.pengali_upmk,
                        uph: a.uph,
                        kompensasi_pkwt: a.kompensasi_pkwt,
                        uang_pisah: a.uang_pisah,
                        is_aktif: a.is_aktif,
                        dasar_hukum: a.dasar_hukum,
                      })
                    }
                  >
                    Ubah
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className={TOMBOL} onClick={onClose}>
                Tutup
              </button>
              <button
                type="button"
                className={TOMBOL_UTAMA}
                onClick={() => setIsi({ ...ALASAN_BARU })}
              >
                Tambah alasan
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
