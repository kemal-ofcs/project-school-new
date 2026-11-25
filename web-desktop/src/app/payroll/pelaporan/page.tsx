"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { type FormEvent, type ReactNode, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { hariIniWib, INPUT, LABEL } from "@/components/inventory/gaya";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Icon } from "@/components/ui/Icon";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabBar } from "@/components/ui/TabBar";
import { canAccessArea } from "@/lib/auth/access";
import { saveFileWithPicker } from "@/lib/client/download";
import {
  lembarRekapA1,
  lembarRekapBpjs,
  lembarRekapPph,
} from "@/lib/client/lapor-pajak-excel";
import { MIME_XLSX } from "@/lib/client/transfer-excel";
import { createXlsxWorkbook } from "@/lib/client/xlsx";
import { useAuth } from "@/lib/context/AuthContext";
import {
  muatLaporanA1,
  muatLaporanBpjs,
  muatLaporanPph,
} from "@/lib/gateways/payroll";
import {
  bolehLapor,
  type DataPemotong,
  type HasilLaporan,
  LABEL_TANDA_LAPOR,
  type RekapA1,
  type RekapBpjs,
  type RekapPph,
  type RunBelumDibayar,
  type TandaLapor,
} from "@/lib/validations/lapor-pajak";

type Tab = "pph" | "bpjs" | "a1";
const TAB: { kunci: Tab; label: string }[] = [
  { kunci: "pph", label: "PPh 21" },
  { kunci: "bpjs", label: "BPJS" },
  { kunci: "a1", label: "A1 tahunan" },
];

type Hasil =
  | { tab: "pph"; data: HasilLaporan<RekapPph> }
  | { tab: "bpjs"; data: HasilLaporan<RekapBpjs> }
  | { tab: "a1"; data: HasilLaporan<RekapA1> };

const IDR = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const rp = (v: number | null) => (v === null ? "-" : IDR.format(v));
const TOMBOL =
  "min-h-10 rounded-lg border border-slate-700 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50";
const TOMBOL_UTAMA =
  "min-h-10 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50";
const PERINGATAN =
  "rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-sm text-amber-100";
const TH = "px-3 py-2";
const TD = "px-3 py-2 align-top";
const TD_ANGKA = "px-3 py-2 text-right font-mono align-top";

function Tanda({ daftar }: { daftar: readonly TandaLapor[] }) {
  if (daftar.length === 0) return <span className="text-slate-500">-</span>;
  return (
    <ul className="space-y-0.5 text-xs text-amber-200">
      {daftar.map((t) => (
        <li key={t}>{LABEL_TANDA_LAPOR[t]}</li>
      ))}
    </ul>
  );
}

function pesanGalat(error: unknown) {
  return error instanceof Error ? error.message : "Permintaan gagal.";
}

/**
 * Rekap PPh 21, BPJS, dan A1 dari slip run PAID (§26.5 nomor 2). Rekap saja;
 * melapor dan menyetor tetap di portal DJP/BPJS.
 */
export default function PelaporanPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("pph");
  const [masa, setMasa] = useState(() => hariIniWib().slice(0, 7));
  const [tahun, setTahun] = useState(() => hariIniWib().slice(0, 4));
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState(false);
  const isSubmittingRef = useRef(false);

  if (!isLoading && isAuthenticated && !canAccessArea(user, "payroll")) {
    redirect("/forbidden");
  }
  if (!isLoading && isAuthenticated && !bolehLapor(user)) {
    redirect("/payroll");
  }

  const muat = async (event?: FormEvent) => {
    event?.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setProses(true);
    setGalat(null);
    try {
      if (tab === "pph") {
        setHasil({ tab, data: await muatLaporanPph(masa) });
      } else if (tab === "bpjs") {
        setHasil({ tab, data: await muatLaporanBpjs(masa) });
      } else {
        setHasil({ tab, data: await muatLaporanA1(tahun) });
      }
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setProses(false);
    }
  };

  const ekspor = async () => {
    if (!hasil) return;
    try {
      const lembar =
        hasil.tab === "pph"
          ? lembarRekapPph(hasil.data)
          : hasil.tab === "bpjs"
            ? lembarRekapBpjs(hasil.data)
            : lembarRekapA1(hasil.data);
      const periode =
        hasil.tab === "a1" ? hasil.data.rekap.tahun : hasil.data.rekap.masa;
      await saveFileWithPicker(
        new Blob([createXlsxWorkbook(lembar) as unknown as BlobPart], {
          type: MIME_XLSX,
        }),
        `rekap-${hasil.tab}-${periode}.xlsx`,
        {
          description: "Spreadsheet Excel (.xlsx)",
          accept: { [MIME_XLSX]: [".xlsx"] },
        },
      );
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  };

  const tampil = hasil?.tab === tab ? hasil : null;

  return (
    <AppShell contentClassName="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <PageHeader
        eyebrow="Penggajian"
        title="Pelaporan PPh 21 dan BPJS"
        description="Rekap dari slip gaji yang sudah dibayar. Angka sama dengan yang dipotong slip; melapor dan menyetor tetap dilakukan di portal DJP dan BPJS."
        actions={
          <Link
            href="/payroll"
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 transition flex items-center gap-2 border border-slate-700"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            Penggajian
          </Link>
        }
      />
      {galat ? (
        <FeedbackBanner tone="error" onDismiss={() => setGalat(null)}>
          {galat}
        </FeedbackBanner>
      ) : null}
      <TabBar
        ariaLabel="Jenis laporan"
        idPrefix="lapor"
        panelId="panel-lapor"
        value={tab}
        onChange={setTab}
        tabs={TAB.map(({ kunci, label }) => ({ id: kunci, label }))}
      />
      <div
        id="panel-lapor"
        role="tabpanel"
        aria-labelledby={`tab-lapor-${tab}`}
        className="space-y-4"
      >
        <form
          data-tanpa-konfirmasi
          onSubmit={(e) => void muat(e)}
          className="flex flex-wrap items-end gap-3"
        >
          {tab === "a1" ? (
            <div>
              <label className={LABEL} htmlFor="lapor-tahun">
                Tahun
              </label>
              <input
                id="lapor-tahun"
                type="number"
                min={2000}
                max={2100}
                required
                value={tahun}
                onChange={(e) => setTahun(e.target.value)}
                className={`${INPUT} w-32`}
              />
            </div>
          ) : (
            <div>
              <label className={LABEL} htmlFor="lapor-masa">
                Masa (bulan)
              </label>
              <input
                id="lapor-masa"
                type="month"
                required
                value={masa}
                onChange={(e) => setMasa(e.target.value)}
                className={`${INPUT} w-48`}
              />
            </div>
          )}
          <button type="submit" className={TOMBOL_UTAMA} disabled={proses}>
            {proses ? "Memuat…" : "Tampilkan"}
          </button>
          {tampil ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() => void ekspor()}
            >
              Ekspor Excel
            </button>
          ) : null}
        </form>

        {tampil ? (
          <Peringatan
            pemotong={tampil.data.pemotong}
            belum={tampil.data.rekap.run_belum_dibayar}
            bpjs={tampil.tab === "bpjs"}
          />
        ) : null}
        {tampil?.tab === "pph" ? <TabelPph rekap={tampil.data.rekap} /> : null}
        {tampil?.tab === "bpjs" ? (
          <TabelBpjs rekap={tampil.data.rekap} />
        ) : null}
        {tampil?.tab === "a1" ? <TabelA1 rekap={tampil.data.rekap} /> : null}
        {!tampil && !proses ? (
          <p className="text-sm text-slate-400">
            Pilih periode lalu tekan Tampilkan.
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}

function Peringatan({
  pemotong,
  belum,
  bpjs,
}: {
  pemotong: DataPemotong;
  belum: readonly RunBelumDibayar[];
  bpjs: boolean;
}) {
  const kurang = bpjs
    ? !pemotong.no_bpjs_ketenagakerjaan && !pemotong.no_bpjs_kesehatan
    : !pemotong.npwp;
  return (
    <>
      {belum.length > 0 ? (
        <p className={PERINGATAN}>
          {belum.length} proses gaji di periode ini belum dibayar dan tidak
          dihitung: {belum.map((r) => `${r.id} (${r.status})`).join(", ")}.
        </p>
      ) : null}
      {kurang ? (
        <p className={PERINGATAN}>
          {bpjs
            ? "Nomor pendaftaran BPJS sekolah belum diisi."
            : "NPWP pemotong belum diisi."}{" "}
          Superadmin mengisinya di Pengaturan, tab Gaji & Pajak.
        </p>
      ) : null}
    </>
  );
}

function Ringkasan({ isi }: { isi: [string, string | number][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm sm:grid-cols-4">
      {isi.map(([label, nilai]) => (
        <div key={label}>
          <dt className="text-xs text-slate-400">{label}</dt>
          <dd className="font-semibold text-white">{nilai}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tabel({
  judul,
  lebar,
  children,
}: {
  judul: string[];
  lebar: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className={`w-full ${lebar} text-left text-sm`}>
        <thead className="bg-slate-900 text-xs uppercase text-slate-400">
          <tr>
            {judul.map((j) => (
              <th key={j} className={TH}>
                {j}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {children}
        </tbody>
      </table>
    </div>
  );
}

function Nama({ nama, kode }: { nama: string; kode: string }) {
  return (
    <td className={TD}>
      <span className="font-semibold text-white">{nama}</span>
      {kode ? (
        <span className="block text-xs text-slate-400">{kode}</span>
      ) : null}
    </td>
  );
}

function Kosong({ kolom }: { kolom: number }) {
  return (
    <tr>
      <td className="px-3 py-3 text-slate-400" colSpan={kolom}>
        Tidak ada slip gaji yang sudah dibayar di periode ini.
      </td>
    </tr>
  );
}

function TabelPph({ rekap }: { rekap: RekapPph }) {
  return (
    <div className="space-y-4">
      <Ringkasan
        isi={[
          ["Pegawai", rekap.baris.length],
          ["Proses gaji", rekap.jumlah_run],
          ["Total bruto", rp(rekap.total_bruto)],
          ["Total PPh 21", rp(rekap.total_pph)],
        ]}
      />
      <Tabel
        lebar="min-w-[960px]"
        judul={[
          "Nama",
          "NIK / NPWP",
          "PTKP",
          "Status",
          "Metode",
          "Bruto",
          "PPh 21",
          "Run",
          "Tanda",
        ]}
      >
        {rekap.baris.map((b) => (
          <tr key={b.id_karyawan}>
            <Nama nama={b.nama_karyawan} kode={b.kode_karyawan} />
            <td className={TD}>
              {b.nik || "-"}
              <span className="block text-xs text-slate-400">
                {b.npwp || "-"}
              </span>
            </td>
            <td className={TD}>{b.ptkp_status || "-"}</td>
            <td className={TD}>
              {b.status === "tetap" ? "Tetap" : "Tidak tetap"}
            </td>
            <td className={TD}>
              {b.metode ?? "-"}
              {b.kategori ? (
                <span className="block text-xs text-slate-400">
                  TER {b.kategori}
                </span>
              ) : null}
            </td>
            <td className={TD_ANGKA}>{rp(b.bruto)}</td>
            <td className={TD_ANGKA}>{rp(b.pph)}</td>
            <td className={TD_ANGKA}>{b.jumlah_run}</td>
            <td className={TD}>
              <Tanda daftar={b.tanda} />
            </td>
          </tr>
        ))}
        {rekap.baris.length === 0 ? <Kosong kolom={9} /> : null}
      </Tabel>
    </div>
  );
}

function TabelBpjs({ rekap }: { rekap: RekapBpjs }) {
  return (
    <div className="space-y-4">
      <Ringkasan
        isi={[
          ["Pegawai", rekap.baris.length],
          ["Total dasar upah", rp(rekap.total_dasar)],
          ["Iuran pekerja", rp(rekap.total_pekerja)],
          ["Iuran sekolah", rp(rekap.total_perusahaan)],
        ]}
      />
      <Tabel
        lebar="min-w-[960px]"
        judul={[
          "Nama",
          "No. BPJS TK / Kesehatan",
          "Dasar upah",
          ...rekap.kode.map((k) => k.code),
          "Pekerja",
          "Sekolah",
          "Tanda",
        ]}
      >
        {rekap.baris.map((b) => (
          <tr key={b.id_karyawan}>
            <Nama nama={b.nama_karyawan} kode={b.kode_karyawan} />
            <td className={TD}>
              {b.no_bpjs_ketenagakerjaan || "-"}
              <span className="block text-xs text-slate-400">
                {b.no_bpjs_kesehatan || "-"}
              </span>
            </td>
            <td className={TD_ANGKA}>{rp(b.dasar)}</td>
            {rekap.kode.map((k) => (
              <td key={k.code} className={TD_ANGKA}>
                {rp(b.iuran[k.code] ?? 0)}
              </td>
            ))}
            <td className={TD_ANGKA}>{rp(b.pekerja)}</td>
            <td className={TD_ANGKA}>{rp(b.perusahaan)}</td>
            <td className={TD}>
              <Tanda daftar={b.tanda} />
            </td>
          </tr>
        ))}
        {rekap.baris.length === 0 ? (
          <Kosong kolom={6 + rekap.kode.length} />
        ) : null}
      </Tabel>
    </div>
  );
}

function TabelA1({ rekap }: { rekap: RekapA1 }) {
  return (
    <div className="space-y-4">
      <Ringkasan
        isi={[
          ["Pegawai", rekap.baris.length],
          ["Pegawai tetap (A1)", rekap.jumlah_a1],
          ["Total bruto", rp(rekap.total_bruto)],
          ["Total PPh 21 dipotong", rp(rekap.total_pph)],
        ]}
      />
      <p className="text-sm text-slate-400">
        Bahan bukti potong A1, bukan formulir resmi. Pegawai tidak tetap hanya
        direkap jumlahnya.
      </p>
      <Tabel
        lebar="min-w-[1080px]"
        judul={[
          "Nama",
          "NIK / NPWP",
          "PTKP",
          "Masa",
          "Bruto",
          "PPh dipotong",
          "Bruto setahun",
          "PKP",
          "PPh setahun",
          "Tanda",
        ]}
      >
        {rekap.baris.map((b) => (
          <tr key={b.id_karyawan}>
            <Nama nama={b.nama_karyawan} kode={b.kode_karyawan} />
            <td className={TD}>
              {b.nik || "-"}
              <span className="block text-xs text-slate-400">
                {b.npwp || "-"}
              </span>
            </td>
            <td className={TD}>
              {b.ptkp_status || "-"}
              {!b.a1 ? (
                <span className="block text-xs text-slate-400">
                  Tidak tetap
                </span>
              ) : null}
            </td>
            <td className={TD}>
              {b.masa_awal} s.d. {b.masa_akhir}
              <span className="block text-xs text-slate-400">
                {b.jumlah_masa} masa
              </span>
            </td>
            <td className={TD_ANGKA}>{rp(b.bruto)}</td>
            <td className={TD_ANGKA}>{rp(b.pph_dipotong)}</td>
            <td className={TD_ANGKA}>{b.a1 ? rp(b.bruto_tahun) : "-"}</td>
            <td className={TD_ANGKA}>{b.a1 ? rp(b.pkp) : "-"}</td>
            <td className={TD_ANGKA}>{b.a1 ? rp(b.pph_setahun) : "-"}</td>
            <td className={TD}>
              <Tanda daftar={b.tanda} />
            </td>
          </tr>
        ))}
        {rekap.baris.length === 0 ? <Kosong kolom={10} /> : null}
      </Tabel>
    </div>
  );
}
