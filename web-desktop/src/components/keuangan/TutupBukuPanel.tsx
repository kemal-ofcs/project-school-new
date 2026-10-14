"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  hariIniWib,
  INPUT,
  LABEL,
  pesanGalat,
  TOMBOL_BAHAYA,
  TOMBOL_KEDUA,
  TOMBOL_UTAMA,
} from "@/components/inventory/gaya";
import { Modal } from "@/components/ui/Modal";
import {
  bukaKembaliBuku,
  getStatusTutupBuku,
  type StatusTutupBuku,
  type TutupBukuItem,
  tutupBuku,
} from "@/lib/gateways/accounting";
import { subscribeSyncCompleted } from "@/lib/gateways/sync-status";
import {
  MAKS_ALASAN_BUKA,
  tanggalTampil,
  waktuTampil,
} from "@/lib/validations/tutup-buku";

/**
 * Tab Tutup Buku halaman Keuangan (Tahap 1): batas yang berlaku, menutup,
 * membuka kembali periode terakhir, dan riwayatnya. Dipakai Web/Desktop dan
 * Mobile (disalin lewat `filesToCopy`).
 */

const GALAT_KOTAK =
  "p-3 rounded-lg border border-rose-500/30 bg-rose-500/20 text-sm text-rose-100";

/** Tanggal `YYYY-MM-DD` digeser sejumlah hari, dihitung di UTC. */
function geser(tanggal: string, hari: number): string {
  const [tahun, bulan, tgl] = tanggal.split("-").map(Number);
  return new Date(Date.UTC(tahun ?? 2000, (bulan ?? 1) - 1, (tgl ?? 1) + hari))
    .toISOString()
    .slice(0, 10);
}

/**
 * Bawaan isian: hari terakhir bulan lalu, tanggal tutup buku yang paling
 * lazim, tetapi tidak sebelum hari sesudah batas dan tidak sesudah kemarin.
 */
function tanggalBawaan(hariIni: string, batas: string | null): string {
  const akhirBulanLalu = geser(`${hariIni.slice(0, 8)}01`, -1);
  const paling = batas ? geser(batas, 1) : akhirBulanLalu;
  const kemarin = geser(hariIni, -1);
  const pilihan = akhirBulanLalu > paling ? akhirBulanLalu : paling;
  return pilihan > kemarin ? kemarin : pilihan;
}

function kodePendek(kode: string): string {
  return kode.length > 8 ? kode.slice(0, 8).toUpperCase() : kode;
}

export function TutupBukuPanel({
  bolehTutup,
  onInfo,
}: {
  bolehTutup: boolean;
  onInfo: (pesan: string) => void;
}) {
  const [data, setData] = useState<StatusTutupBuku | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"tutup" | "buka" | null>(null);

  const muat = useCallback(async () => {
    setGalatMuat(null);
    try {
      setData(await getStatusTutupBuku());
    } catch (error) {
      setGalatMuat(pesanGalat(error, "Status tutup buku tidak bisa dimuat."));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);
  useEffect(() => subscribeSyncCompleted(() => void muat()), [muat]);

  if (galatMuat) {
    return (
      <div className={`${GALAT_KOTAK} space-y-3`}>
        <p>{galatMuat}</p>
        <button
          type="button"
          className={TOMBOL_KEDUA}
          onClick={() => void muat()}
        >
          Coba muat lagi
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <p className="p-6 text-center text-sm text-slate-400">
        Memuat status tutup buku...
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-3">
        <p className="text-base font-semibold text-slate-100">
          {data.batas
            ? `Buku terkunci sampai ${tanggalTampil(data.batas)}`
            : "Buku belum pernah ditutup"}
        </p>
        <p className="text-sm text-slate-400">
          {data.batas
            ? "Pencatatan bertanggal sampai tanggal itu ditolak: jurnal, kuitansi, tagihan, kasbon, dan pembayaran gaji."
            : "Setelah ditutup, pencatatan bertanggal sampai tanggal tutup buku ditolak."}
        </p>
        {bolehTutup ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={TOMBOL_UTAMA}
              onClick={() => setDialog("tutup")}
            >
              Tutup buku
            </button>
            {data.batas ? (
              <button
                type="button"
                className={TOMBOL_KEDUA}
                onClick={() => setDialog("buka")}
              >
                Buka kembali periode terakhir
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Menutup dan membuka kembali buku hanya bisa dilakukan pemegang izin
            Tutup Buku.
          </p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-200">Riwayat</h2>
        {data.riwayat.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400 rounded-xl border border-dashed border-slate-700">
            Belum ada tutup buku.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
            {data.riwayat.map((item) => (
              <BarisRiwayat key={item.id_tutup} item={item} />
            ))}
          </ul>
        )}
      </section>

      {dialog === "tutup" ? (
        <DialogTutup
          batas={data.batas}
          onClose={() => setDialog(null)}
          onSelesai={async (sampai) => {
            setDialog(null);
            onInfo(`Buku ditutup sampai ${tanggalTampil(sampai)}.`);
            await muat();
          }}
        />
      ) : null}
      {dialog === "buka" && data.batas ? (
        <DialogBuka
          batas={data.batas}
          onClose={() => setDialog(null)}
          onSelesai={async () => {
            setDialog(null);
            onInfo(
              `Periode sampai ${tanggalTampil(data.batas ?? "")} dibuka kembali.`,
            );
            await muat();
          }}
        />
      ) : null}
    </div>
  );
}

function BarisRiwayat({ item }: { item: TutupBukuItem }) {
  return (
    <li className="px-4 py-3 space-y-1 text-sm">
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-slate-100">
          Sampai {tanggalTampil(item.sampai_tanggal)}
        </span>
        <span
          className={`rounded px-1.5 text-xs border ${
            item.status === "Aktif"
              ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-100"
              : "border-slate-600 text-slate-300"
          }`}
        >
          {item.status === "Aktif" ? "Berlaku" : item.status}
        </span>
      </p>
      <p className="text-xs text-slate-400">
        Ditutup oleh {item.dibuat_oleh} di perangkat{" "}
        {kodePendek(item.kode_perangkat)} pada{" "}
        {waktuTampil(item.waktu_perangkat)} (menurut jam perangkat).
      </p>
      <p className="text-xs text-slate-400">
        {item.diterima_cloud
          ? `Diterima cloud ${waktuTampil(item.diterima_cloud)}.`
          : "Belum sampai ke cloud."}
      </p>
      {item.status === "Dibuka" ? (
        <p className="text-xs text-slate-300 break-words">
          Dibuka kembali oleh {item.dibuka_oleh} pada{" "}
          {waktuTampil(item.dibuka_pada ?? "")}: {item.alasan_buka}
        </p>
      ) : null}
    </li>
  );
}

function DialogTutup({
  batas,
  onClose,
  onSelesai,
}: {
  batas: string | null;
  onClose: () => void;
  onSelesai: (sampai: string) => Promise<void>;
}) {
  const hariIni = hariIniWib();
  const [sampai, setSampai] = useState(tanggalBawaan(hariIni, batas));
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const isSubmittingRef = useRef(false);

  async function simpan(event: FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      await tutupBuku(sampai);
      await onSelesai(sampai);
    } catch (error) {
      setGalat(pesanGalat(error, "Buku tidak bisa ditutup."));
    } finally {
      isSubmittingRef.current = false;
      setSibuk(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Tutup buku" hideFooter>
      <form onSubmit={simpan} className="space-y-4 text-sm text-slate-200">
        <div>
          <label className={LABEL} htmlFor="tutup-sampai">
            Tutup sampai tanggal
          </label>
          <input
            id="tutup-sampai"
            type="date"
            required
            className={INPUT}
            value={sampai}
            min={batas ? geser(batas, 1) : undefined}
            max={geser(hariIni, -1)}
            onChange={(e) => setSampai(e.target.value)}
          />
        </div>
        <p>
          Saldo semua akun sampai tanggal itu dicatat sebagai potret tutup buku.
          Sesudahnya, pencatatan bertanggal sampai tanggal itu ditolak.
        </p>
        <p className="text-slate-400">
          Perangkat yang sedang tanpa jaringan baru ikut menolak setelah
          menerima tutup buku ini lewat sinkronisasi.
        </p>
        {galat ? (
          <p role="alert" className={GALAT_KOTAK}>
            {galat}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={TOMBOL_KEDUA} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={sibuk}>
            {sibuk ? "Menutup..." : "Tutup buku"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DialogBuka({
  batas,
  onClose,
  onSelesai,
}: {
  batas: string;
  onClose: () => void;
  onSelesai: () => Promise<void>;
}) {
  const [alasan, setAlasan] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const isSubmittingRef = useRef(false);

  async function simpan(event: FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      await bukaKembaliBuku(alasan);
      await onSelesai();
    } catch (error) {
      setGalat(pesanGalat(error, "Periode tidak bisa dibuka kembali."));
    } finally {
      isSubmittingRef.current = false;
      setSibuk(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Buka kembali periode" hideFooter>
      <form onSubmit={simpan} className="space-y-4 text-sm text-slate-200">
        <p>
          Tutup buku sampai {tanggalTampil(batas)} dibuka kembali. Catatannya
          tidak dihapus: riwayat tetap menunjukkan siapa yang menutup, siapa
          yang membuka, dan alasannya.
        </p>
        <div>
          <label className={LABEL} htmlFor="buka-alasan">
            Alasan
          </label>
          <textarea
            id="buka-alasan"
            required
            maxLength={MAKS_ALASAN_BUKA}
            rows={3}
            className={INPUT}
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
          />
        </div>
        {galat ? (
          <p role="alert" className={GALAT_KOTAK}>
            {galat}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={TOMBOL_KEDUA} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_BAHAYA} disabled={sibuk}>
            {sibuk ? "Membuka..." : "Buka kembali"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
