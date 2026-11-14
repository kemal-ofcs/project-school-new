/**
 * Laporan kehadiran per orang untuk ekspor Excel dasbor: satu baris per
 * personil, satu kolom per tanggal, lalu total.
 *
 * Backend (`getLaporanKehadiran` di `report.ts`, `laporan_kehadiran` di
 * `administration.rs`) hanya mengirim data mentah; matriksnya disusun di sini
 * sekali untuk ketiga build. Hadir dan terlambat per hari memakai rumus kartu
 * dasbor (`REKAP_PER_TANGGAL_SQL`), libur memakai `wajibMasuk` milik auto-alfa,
 * jadi laporan tidak pernah berselisih dengan dua keduanya.
 */

import { parseHariKerja, tanggalValid, wajibMasuk } from "./hari-kerja";
import {
  evaluateHolidayScan,
  type HolidayWhitelistEntry,
} from "./holiday-whitelist";
import { hariSekolahUntuk, parseHariSekolah } from "./nilai-akhir";

type Hasil<T> = { ok: true; value: T } | { ok: false; error: string };

/** Cermin `MAKS_HARI_LAPORAN` di `administration.rs`. */
export const MAKS_HARI_LAPORAN = 92;

export const JENIS_LAPORAN = ["Guru", "Pegawai", "Peserta Didik"] as const;
export type JenisLaporan = (typeof JENIS_LAPORAN)[number];

export interface PersonilLaporan {
  id: string;
  kode: string;
  nama: string;
  jenis: string;
  divisi: string;
  aktif: number;
  hari_kerja: string | null;
  kode_shift: number | string | null;
  id_unit_siswa: string | null;
}

/** Satu orang pada satu tanggal, multi-sesi sudah digabung oleh SQL. */
export interface HariLaporan {
  id: string;
  tanggal: string;
  hadir: number;
  /** Menit terlambat sesi yang paling telat; > 0 berarti hari itu terlambat. */
  telat: number;
  /** Jumlah menit terlambat semua sesi hari itu. */
  menit: number;
  sakit: number;
  izin: number;
  dispensasi: number;
  alfa: number;
}

export interface DataLaporanKehadiran {
  mulai: string;
  selesai: string;
  hari_ini: string;
  hari_sekolah: string | null;
  personil: PersonilLaporan[];
  hari: HariLaporan[];
  libur: { tanggal: string; nama: string }[];
  whitelist: HolidayWhitelistEntry[];
  /** Pengajuan cuti/izin/sakit/dinas luar yang berlaku (HRIS v69). */
  pengajuan: PengajuanLaporan[];
}

export interface PengajuanLaporan {
  id: string;
  mulai: string;
  selesai: string;
  kelompok: string;
}

/** Kode laporan untuk kelompok pengajuan; `null` = tidak tampil. */
export function kodeKelompok(kelompok: string): string | null {
  if (kelompok === "Dinas Luar") return "DL";
  if (kelompok === "Cuti") return "C";
  if (kelompok === "Izin") return "I";
  if (kelompok === "Sakit") return "S";
  return null;
}

export const KODE_LAPORAN = [
  ["H", "Hadir tepat waktu"],
  ["T", "Hadir, terlambat"],
  ["S", "Sakit"],
  ["I", "Izin"],
  ["C", "Cuti (pengajuan Cuti & Izin)"],
  ["DL", "Dinas luar (pengajuan Cuti & Izin), dihitung hadir"],
  ["D", "Dispensasi"],
  ["A", "Alfa (tidak hadir tanpa keterangan)"],
  ["L", "Hari libur dari halaman Hari Libur"],
  ["M", "Libur mingguan: di luar hari kerja shift atau Hari Sekolah"],
  ["-", "Seharusnya masuk, tetapi belum ada catatan absensi"],
] as const;

export interface BarisLaporan {
  personil: PersonilLaporan;
  /** Sejajar `tanggal`; kosong untuk tanggal sesudah hari ini. */
  sel: string[];
  hadir: number;
  terlambat: number;
  menitTerlambat: number;
  sakit: number;
  izin: number;
  cuti: number;
  /** Dinas luar: hari wajib dan ikut persen hadir (bekerja di luar sekolah). */
  dinas: number;
  dispensasi: number;
  alfa: number;
  tanpaData: number;
  libur: number;
  wajibMasuk: number;
  /** (Hadir + dinas luar) ÷ hari wajib masuk, satu desimal; `null` bila tidak ada hari wajib. */
  persen: number | null;
}

/** Cermin `validate_rentang_laporan`; pesannya sama kata demi kata. */
export function validateRentangLaporan(
  mulai: string,
  selesai: string,
): Hasil<{ mulai: string; selesai: string }> {
  if (!tanggalValid(mulai) || !tanggalValid(selesai)) {
    return { ok: false, error: "Tanggal laporan tidak valid." };
  }
  const selisih =
    (Date.parse(`${selesai}T00:00:00Z`) - Date.parse(`${mulai}T00:00:00Z`)) /
    86_400_000;
  if (selisih < 0) {
    return {
      ok: false,
      error: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    };
  }
  if (selisih >= MAKS_HARI_LAPORAN) {
    return {
      ok: false,
      error: `Rentang laporan paling panjang ${MAKS_HARI_LAPORAN} hari.`,
    };
  }
  return { ok: true, value: { mulai, selesai } };
}

/** Setiap tanggal dari `mulai` sampai `selesai`, inklusif. */
export function daftarTanggal(mulai: string, selesai: string): string[] {
  const hasil: string[] = [];
  const awal = Date.parse(`${mulai}T00:00:00Z`);
  for (let i = 0; i <= MAKS_HARI_LAPORAN; i++) {
    const tanggal = new Date(awal + i * 86_400_000).toISOString().slice(0, 10);
    if (tanggal > selesai) break;
    hasil.push(tanggal);
  }
  return hasil;
}

/**
 * Kode hari yang punya catatan. Urutannya mengikuti dasbor: Hadir menang atas
 * Sakit/Izin/Dispensasi, yang menang atas Alfa. `null` = tidak ada status yang
 * dikenali, sehingga tanggal itu dinilai dari jadwalnya.
 */
function kodeTercatat(hari: HariLaporan | undefined): string | null {
  if (!hari) return null;
  if (Number(hari.hadir) === 1) return Number(hari.telat) > 0 ? "T" : "H";
  if (Number(hari.sakit) === 1) return "S";
  if (Number(hari.izin) === 1) return "I";
  if (Number(hari.dispensasi) === 1) return "D";
  if (Number(hari.alfa) === 1) return "A";
  return null;
}

const URUTAN_JENIS: readonly string[] = JENIS_LAPORAN;

export function susunLaporanKehadiran(
  data: DataLaporanKehadiran,
  jenis: JenisLaporan | "" = "",
): { tanggal: string[]; baris: BarisLaporan[] } {
  const tanggal = daftarTanggal(data.mulai, data.selesai);
  const libur = new Set(data.libur.map((item) => item.tanggal));
  const hariSekolah = parseHariSekolah(data.hari_sekolah);
  const catatan = new Map(
    data.hari.map((hari) => [`${hari.id}|${hari.tanggal}`, hari]),
  );
  // Pengajuan pertama per orang per tanggal (urutan SQL).
  const kodeAjuan = new Map<string, string>();
  for (const p of data.pengajuan ?? []) {
    const kode = kodeKelompok(p.kelompok);
    if (!kode) continue;
    for (const t of tanggal) {
      const kunci = `${p.id}|${t}`;
      if (t >= p.mulai && t <= p.selesai && !kodeAjuan.has(kunci)) {
        kodeAjuan.set(kunci, kode);
      }
    }
  }

  const baris = data.personil
    .filter((personil) => !jenis || personil.jenis === jenis)
    .map((personil): BarisLaporan => {
      const hariMasuk =
        personil.jenis === "Peserta Didik"
          ? hariSekolahUntuk(hariSekolah, personil.id_unit_siswa)
          : parseHariKerja(personil.hari_kerja);
      const kodeShift = Number(personil.kode_shift);
      const dijadwalkanPada = (t: string) => {
        const tanggalLibur = libur.has(t);
        return wajibMasuk({
          tanggal: t,
          hariMasuk,
          libur: tanggalLibur,
          masukSaatLibur:
            tanggalLibur &&
            evaluateHolidayScan(data.whitelist, {
              tanggal: t,
              divisi: personil.divisi,
              kodeShift: Number.isFinite(kodeShift) ? kodeShift : null,
            }).allowed,
        });
      };
      const hasil: BarisLaporan = {
        personil,
        sel: [],
        hadir: 0,
        terlambat: 0,
        menitTerlambat: 0,
        sakit: 0,
        izin: 0,
        cuti: 0,
        dinas: 0,
        dispensasi: 0,
        alfa: 0,
        tanpaData: 0,
        libur: 0,
        wajibMasuk: 0,
        persen: null,
      };

      for (const t of tanggal) {
        if (t > data.hari_ini) {
          hasil.sel.push("");
          continue;
        }
        const hari = catatan.get(`${personil.id}|${t}`);
        const kode = kodeTercatat(hari);
        // Urutan §20.2.6: H/T > pengajuan > S/I/D Koreksi Admin > A > L/M/-.
        // Pengajuan hanya di tanggal wajib atau yang punya catatan.
        const ajuan =
          kode === "H" || kode === "T"
            ? null
            : (kodeAjuan.get(`${personil.id}|${t}`) ?? null);
        if (ajuan && (kode || dijadwalkanPada(t))) {
          hasil.sel.push(ajuan);
          hasil.wajibMasuk++;
          if (ajuan === "S") hasil.sakit++;
          if (ajuan === "I") hasil.izin++;
          if (ajuan === "C") hasil.cuti++;
          if (ajuan === "DL") hasil.dinas++;
          continue;
        }
        if (kode) {
          hasil.sel.push(kode);
          hasil.wajibMasuk++;
          if (kode === "H" || kode === "T") hasil.hadir++;
          if (kode === "T") {
            hasil.terlambat++;
            hasil.menitTerlambat += Number(hari?.menit) || 0;
          }
          if (kode === "S") hasil.sakit++;
          if (kode === "I") hasil.izin++;
          if (kode === "D") hasil.dispensasi++;
          if (kode === "A") hasil.alfa++;
          continue;
        }

        const tanggalLibur = libur.has(t);
        if (dijadwalkanPada(t)) {
          hasil.sel.push("-");
          hasil.wajibMasuk++;
          hasil.tanpaData++;
        } else {
          // Tanggal libur yang jatuh di hari libur mingguan tetap "L": nama
          // liburnya lebih berguna daripada "bukan hari kerja".
          hasil.sel.push(tanggalLibur ? "L" : "M");
          hasil.libur++;
        }
      }

      if (hasil.wajibMasuk > 0) {
        hasil.persen =
          Math.round(((hasil.hadir + hasil.dinas) / hasil.wajibMasuk) * 1000) /
          10;
      }
      return hasil;
    });

  baris.sort(
    (a, b) =>
      URUTAN_JENIS.indexOf(a.personil.jenis) -
        URUTAN_JENIS.indexOf(b.personil.jenis) ||
      a.personil.divisi.localeCompare(b.personil.divisi, "id") ||
      a.personil.nama.localeCompare(b.personil.nama, "id"),
  );
  return { tanggal, baris };
}
