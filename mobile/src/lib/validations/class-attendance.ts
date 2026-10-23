import {
  composeWaMessage,
  type WaTemplateKind,
} from "@/lib/validations/wa-notification";

/**
 * Peringatan sebelum menyimpan presensi kelas.
 *
 * Status awal seluruh roster adalah "Hadir" — lihat `DEFAULT_ROSTER_STATUS` di
 * `src/lib/services/class-attendance.ts` dan cerminan Rust-nya untuk alasannya.
 * Bawaan itu sengaja tidak pernah diisi "Alfa" supaya kartu yang tertinggal atau
 * scanner yang mati tidak menghukum siswa.
 *
 * Konsekuensinya ada di arah sebaliknya: guru yang menekan simpan tanpa memeriksa
 * akan menandai HADIR seluruh kelas, termasuk siswa yang benar-benar tidak masuk.
 * Anomali `TANPA_SCAN_GERBANG` memang menjaringnya, tetapi baru SETELAH kejadian.
 * Fungsi ini memindahkan temuan yang sama ke detik sebelum penyimpanan, tanpa
 * pernah mengubah status siapa pun secara otomatis — gurunya yang memutuskan.
 */

/**
 * Batas STRUKTURAL jam pelajaran — pagar terluar, bukan kebijakan sekolah.
 *
 * Angka ini hanya menjaga agar teks asing tidak masuk ke kolom yang ikut
 * disinkronkan; jumlah jam pelajaran yang benar-benar dipakai sebuah sekolah
 * diatur terpisah lewat `jp_max_per_hari` di `setting_gex_system`. Keduanya
 * dipisah karena sifatnya berbeda: yang ini melindungi database dan karena itu
 * dieja di kode, yang satu lagi keputusan sekolah dan karena itu bisa diubah
 * tanpa memasang ulang aplikasi.
 *
 * Dinaikkan dari 12 ke 20 pada versi ini: pesantren dan sekolah berasrama
 * benar-benar punya jam pelajaran sampai belasan, dan batas lama menguncinya
 * tanpa alasan teknis apa pun.
 */
export const MAX_JAM_KE = 20;

/**
 * Jenis baris pada jadwal bel sekolah. `Pulang` (v60) hanya penanda bel jam
 * pulang: tidak bernomor dan tidak punya jam selesai.
 */
export const JENIS_JAM_PELAJARAN = [
  "KBM",
  "Istirahat",
  "Upacara",
  "Ekstrakurikuler",
  "Pulang",
] as const;

export type JenisJamPelajaran = (typeof JENIS_JAM_PELAJARAN)[number];

/**
 * Suara bel per baris (v60). Nada dibangkitkan Web Audio, MP3 dibaca dari
 * perangkat bel itu sendiri (tidak ikut sinkronisasi), pengumuman memakai TTS.
 * Kolomnya tanpa CHECK supaya nada baru tidak menuntut rebuild tabel; nilai
 * asing ditolak di titik simpan. Cerminan `SUARA_BEL` di `class_attendance.rs`.
 */
export const SUARA_BEL = [
  "nada-1",
  "nada-2",
  "nada-3",
  "mp3-1",
  "mp3-2",
  "mp3-3",
  "pengumuman",
] as const;

export type SuaraBel = (typeof SUARA_BEL)[number];

export const SUARA_BEL_BAWAAN: SuaraBel = "nada-1";

export const LABEL_SUARA_BEL: Record<SuaraBel, string> = {
  "nada-1": "Ding-dong",
  "nada-2": "Tiga nada",
  "nada-3": "Bel panjang",
  "mp3-1": "MP3 1",
  "mp3-2": "MP3 2",
  "mp3-3": "MP3 3",
  pengumuman: "Pengumuman suara",
};

/**
 * Kosong jatuh ke nada bawaan, nilai asing `null` (ditolak pemanggil).
 * Cerminan `normalize_suara_bel` di `class_attendance.rs`; vektor sama.
 */
export function normalizeSuaraBel(
  raw: string | null | undefined,
): SuaraBel | null {
  const value = String(raw ?? "").trim();
  if (value === "") return SUARA_BEL_BAWAAN;
  return (SUARA_BEL as readonly string[]).includes(value)
    ? (value as SuaraBel)
    : null;
}

/**
 * Jam selesai yang disimpan untuk satu baris bel. Baris `Pulang` hanya punya
 * satu pukul, jadi jam selesainya disamakan dengan jam mulai; jenis lain
 * wajib selesai sesudah mulai. Cerminan `atur_jam_selesai_bel`; vektor sama.
 */
export function aturJamSelesaiBel(
  jenis: string,
  jamMulai: string,
  jamSelesai: string,
): { ok: true; jamSelesai: string } | { ok: false; pesan: string } {
  if (jenis === "Pulang") return { ok: true, jamSelesai: jamMulai };
  if (jamSelesai <= jamMulai) {
    return {
      ok: false,
      pesan: "Jam selesai harus lebih lambat daripada jam mulai.",
    };
  }
  return { ok: true, jamSelesai };
}

/**
 * Normalisasi jam dinding `HH:MM` pada jadwal bel.
 *
 * Menerima `7:5` dan mengembalikan `07:05`, karena orang mengetik jam seperti
 * itu; menolak apa pun yang bukan jam. Kolomnya TEKS dan ikut disinkronkan,
 * jadi satu ejaan bebas akan membuat pengurutan bel berantakan di perangkat
 * lain tanpa pesan apa pun.
 *
 * Cerminan `normalize_jam_bel` di `class_attendance.rs`; keduanya diuji dengan
 * vektor yang sama.
 */
export function normalizeJamBel(raw: string): string | null {
  const compact = String(raw ?? "").replace(/\s+/g, "");
  const pisah = compact.indexOf(":");
  if (pisah <= 0) return null;

  const jamText = compact.slice(0, pisah);
  const menitText = compact.slice(pisah + 1);
  if (!/^\d{1,2}$/.test(jamText) || !/^\d{1,2}$/.test(menitText)) return null;

  const jam = Number(jamText);
  const menit = Number(menitText);
  if (jam < 0 || jam > 23 || menit < 0 || menit > 59) return null;

  return `${String(jam).padStart(2, "0")}:${String(menit).padStart(2, "0")}`;
}

/** Kunci `setting_gex_system` untuk jumlah jam pelajaran per hari. */
export const JP_MAX_PER_DAY_SETTING_KEY = "jp_max_per_hari";

/** Kunci `setting_gex_system` untuk lama satu jam pelajaran (menit). */
export const JP_DURATION_SETTING_KEY = "jp_durasi_menit";

/** Jumlah jam pelajaran per hari bila sekolah belum mengaturnya. */
export const DEFAULT_JP_MAX_PER_DAY = 12;

/** Lama satu jam pelajaran bila sekolah belum mengaturnya (menit). */
export const DEFAULT_JP_DURATION_MINUTES = 45;

/**
 * Membaca `jp_max_per_hari` dari `setting_gex_system`.
 *
 * Nilai yang hilang, bukan angka, atau di luar `1..MAX_JAM_KE` jatuh ke bawaan
 * — BUKAN ke nol dan bukan ke batas struktural. Nol akan membuat setiap
 * presensi ditolak, dan batas struktural akan diam-diam melonggarkan kebijakan
 * sekolah yang justru sedang salah tulis.
 *
 * Cerminan `jp_max_per_day` di `class_attendance.rs`; keduanya diuji dengan
 * vektor yang sama.
 */
export function parseJpMaxPerDay(raw: string | null | undefined): number {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > MAX_JAM_KE) {
    return DEFAULT_JP_MAX_PER_DAY;
  }
  return value;
}

/**
 * Membaca `jp_durasi_menit` dari `setting_gex_system`.
 *
 * Angka ini TIDAK mengubah nominal gaji: honor guru dibayar per jam pelajaran,
 * bukan per menit. Ia dipakai untuk menerangkan durasi di layar presensi.
 *
 * Cerminan `jp_duration_minutes` di `class_attendance.rs`.
 */
export function parseJpDuration(raw: string | null | undefined): number {
  const value = Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value < 1 || value > 240) {
    return DEFAULT_JP_DURATION_MINUTES;
  }
  return value;
}

/**
 * Kunci pengaturan JP milik satu unit (v60), misalnya `jp_max_per_hari:unt_1`.
 * Kunci tanpa akhiran tetap berlaku untuk "Semua unit" dan menjadi cadangan.
 * Cerminan `jp_unit_key` di `class_attendance.rs`.
 */
export function jpUnitKey(base: string, idUnit: string): string {
  return `${base}:${idUnit}`;
}

/**
 * Batas JP sebuah unit: nilai unitnya bila sah, kalau tidak nilai sekolah.
 * Nilai unit yang rusak jatuh ke nilai sekolah, BUKAN ke bawaan 12, supaya
 * salah tulis di satu unit tidak diam-diam melonggarkan kebijakan sekolah.
 * Cerminan `jp_max_for_unit`; vektor sama.
 */
export function parseJpMaxForUnit(
  unitRaw: string | null | undefined,
  sekolahRaw: string | null | undefined,
): number {
  const value = Number(String(unitRaw ?? "").trim());
  if (
    String(unitRaw ?? "").trim() !== "" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_JAM_KE
  ) {
    return value;
  }
  return parseJpMaxPerDay(sekolahRaw);
}

/** Lama JP sebuah unit, pola yang sama. Cerminan `jp_duration_for_unit`. */
export function parseJpDurationForUnit(
  unitRaw: string | null | undefined,
  sekolahRaw: string | null | undefined,
): number {
  const value = Number(String(unitRaw ?? "").trim());
  if (
    String(unitRaw ?? "").trim() !== "" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 240
  ) {
    return value;
  }
  return parseJpDuration(sekolahRaw);
}

/**
 * Normalisasi dan validasi `presensi_mapel.jam_ke`.
 *
 * Kolomnya TEKS, dan itu memang benar — nilainya bukan sekadar angka melainkan
 * juga RENTANG untuk blok dua jam pelajaran (`1-2`, `3-4`). Mengubahnya menjadi
 * INTEGER akan memusnahkan bagian setelah tanda hubung.
 *
 * Cerminan `normalize_jam_ke` di `class_attendance.rs`; keduanya diuji dengan
 * vektor yang SAMA, pola paritas yang sama dengan `ip-allowlist` dan `totp`.
 *
 * Mengembalikan bentuk kanoniknya, atau `null` bila tidak valid.
 */
export function normalizeJamKe(raw: string): string | null {
  const compact = String(raw ?? "").replace(/\s+/g, "");

  const angka = (bagian: string): number | null => {
    if (!/^\d+$/.test(bagian)) return null;
    const value = Number(bagian);
    return value >= 1 && value <= MAX_JAM_KE ? value : null;
  };

  const pisah = compact.indexOf("-");
  if (pisah === -1) {
    const value = angka(compact);
    return value === null ? null : String(value);
  }

  const awal = angka(compact.slice(0, pisah));
  const akhir = angka(compact.slice(pisah + 1));
  if (awal === null || akhir === null || awal >= akhir) return null;
  return `${awal}-${akhir}`;
}

/** Rentang jam pelajaran: `3` menjadi `{ awal: 3, akhir: 3 }`. */
export interface RentangJamKe {
  awal: number;
  akhir: number;
}

/**
 * Rentang `jam_ke`, atau `null` bila nilainya tidak lolos `normalizeJamKe`.
 *
 * Pemanggil yang membandingkan dengan baris TERSIMPAN wajib memperlakukan
 * `null` sebagai "tidak diketahui", bukan bentrok: satu baris lama bertulisan
 * asing tidak boleh mengunci seluruh jadwal rombelnya dari presensi baru.
 *
 * Cerminan `jam_ke_range` di `class_attendance.rs`; keduanya diuji dengan
 * vektor yang sama.
 */
export function rentangJamKe(raw: string): RentangJamKe | null {
  const normal = normalizeJamKe(raw);
  if (normal === null) return null;

  const pisah = normal.indexOf("-");
  if (pisah === -1) {
    const value = Number(normal);
    return { awal: value, akhir: value };
  }
  return {
    awal: Number(normal.slice(0, pisah)),
    akhir: Number(normal.slice(pisah + 1)),
  };
}

/**
 * Jumlah jam pelajaran yang dipakai sebuah sesi: `3-5` bernilai 3 JP.
 *
 * Dipakai pratinjau "= N JP" di layar presensi, dan menjadi dasar honor guru
 * per JP. Karena itu ia dieja sekali di sini, bukan dihitung ulang di layar.
 */
export function hitungJp(raw: string): number | null {
  const rentang = rentangJamKe(raw);
  return rentang === null ? null : rentang.akhir - rentang.awal + 1;
}

/**
 * Apakah dua `jam_ke` memakai setidaknya satu jam pelajaran yang sama?
 *
 * Membandingkan IRISAN, bukan teks: `1-2` dan `2` adalah dua nilai berbeda bagi
 * `=`, padahal keduanya memakai jam ke-2. Pemeriksaan duplikat yang lama
 * mencocokkan teks persis, sehingga pasangan itu tersimpan sebagai dua sesi dan
 * jam ke-2 terhitung dua kali.
 *
 * Cerminan `jam_ke_overlaps` di `class_attendance.rs`.
 */
export function jamKeBeririsan(a: string, b: string): boolean {
  const kiri = rentangJamKe(a);
  const kanan = rentangJamKe(b);
  if (kiri === null || kanan === null) return false;
  return kiri.awal <= kanan.akhir && kanan.awal <= kiri.akhir;
}

/**
 * Menyusun `jam_ke` dari dua angka yang diketik pengguna.
 *
 * Layar presensi memberi dua kolom "dari" dan "sampai" alih-alih daftar pilihan
 * tetap, supaya sekolah dengan jam pelajaran di luar delapan pilihan lama tidak
 * terkunci. Bentuk kanoniknya tetap dihasilkan `normalizeJamKe`, jadi tidak ada
 * ejaan kedua yang bisa lolos ke database.
 */
export function susunJamKe(dari: number, sampai: number): string | null {
  if (!Number.isInteger(dari) || !Number.isInteger(sampai)) return null;
  return normalizeJamKe(dari === sampai ? String(dari) : `${dari}-${sampai}`);
}

/**
 * Nomor `jam_ke` yang disimpan untuk sebuah baris jadwal bel.
 *
 * Hanya baris KBM yang bernomor: Istirahat dan Upacara tidak memakan nomor jam
 * pelajaran, kalau tidak, pelajaran jam 3-5 yang melewati istirahat terhitung
 * 3 JP. Baris non-KBM diurutkan menurut pukulnya dan disimpan dengan nomor 1
 * hanya karena kolomnya wajib terisi (CHECK `jam_ke >= 1`).
 *
 * Cerminan `atur_nomor_jam_bel` di `class_attendance.rs`; keduanya diuji dengan
 * vektor yang sama.
 */
export function aturNomorJamBel(
  jenis: string,
  jamKe: number,
  batas: number,
): { ok: true; jamKe: number } | { ok: false; pesan: string } {
  if (jenis !== "KBM") return { ok: true, jamKe: 1 };
  // `batas` adalah batas unit baris bel itu (v60), bukan selalu batas sekolah.
  if (!Number.isInteger(jamKe) || jamKe < 1 || jamKe > batas) {
    return {
      ok: false,
      pesan: `Jam pelajaran harus di antara 1 dan ${batas}, sesuai Pengaturan.`,
    };
  }
  return { ok: true, jamKe };
}

/** Bentuk minimal satu baris jadwal bel yang dibutuhkan fungsi di bawah. */
export interface JamBelLike {
  jam_ke: number;
  jam_mulai: string;
  jam_selesai: string;
  jenis: string;
  is_aktif: number;
}

/** Cakupan satu baris bel (v60). `null` = semua unit / setiap hari. */
export interface CakupanBel {
  id_unit?: string | null;
  hari?: number | null;
}

/**
 * Baris bel yang berlaku untuk satu unit pada satu hari.
 *
 * Satu cakupan dipakai UTUH, tidak dicampur: begitu unit (atau hari) punya
 * baris sendiri, baris umum tidak ikut. Mencampurnya akan membunyikan bel
 * pulang Jumat dan bel pulang biasa sekaligus. Urutannya unit+hari, unit
 * setiap hari, semua unit+hari, lalu semua unit setiap hari. Hanya dipakai UI
 * (bel, presensi, jadwal), jadi tidak punya cerminan Rust.
 */
export function jadwalBelBerlaku<T extends CakupanBel>(
  periods: readonly T[],
  idUnit: string | null,
  hari: number | null,
): T[] {
  const unit = idUnit?.trim() || null;
  const cocok = (row: T, u: string | null, h: number | null) =>
    (row.id_unit?.trim() || null) === u && (row.hari ?? null) === h;
  const urutan: [string | null, number | null][] = unit
    ? [
        [unit, hari],
        [unit, null],
        [null, hari],
        [null, null],
      ]
    : [
        [null, hari],
        [null, null],
      ];
  for (const [u, h] of urutan) {
    const rows = periods.filter((row) => cocok(row, u, h));
    if (rows.length > 0) return rows;
  }
  return [];
}

/**
 * Baris yang dibunyikan perangkat bel pada satu hari: gabungan jadwal setiap
 * unit yang dipilih perangkat itu (kosong = jadwal "Semua unit"), hanya yang
 * aktif dan berbunyi, satu baris per pukul supaya dua unit yang bersamaan
 * tidak berbunyi dua kali.
 */
export function barisBelBerbunyi<
  T extends CakupanBel & { jam_mulai: string; is_aktif: number; bunyi: number },
>(periods: readonly T[], units: readonly string[], hari: number | null): T[] {
  const cakupan = units.length > 0 ? units : [null];
  const perPukul = new Map<string, T>();
  for (const unit of cakupan) {
    for (const row of jadwalBelBerlaku(periods, unit, hari)) {
      if (row.is_aktif !== 1 || row.bunyi !== 1) continue;
      if (!perPukul.has(row.jam_mulai)) perPukul.set(row.jam_mulai, row);
    }
  }
  return [...perPukul.values()].sort((a, b) =>
    a.jam_mulai.localeCompare(b.jam_mulai),
  );
}

/** Kalimat pengumuman suara untuk satu baris bel. */
export function teksPengumumanBel(row: {
  jenis: string;
  jam_ke: number;
}): string {
  switch (row.jenis) {
    case "KBM":
      return `Jam pelajaran ke-${row.jam_ke} dimulai.`;
    case "Istirahat":
      return "Waktu istirahat.";
    case "Upacara":
      return "Waktu upacara. Silakan menuju lapangan.";
    case "Ekstrakurikuler":
      return "Waktu kegiatan ekstrakurikuler.";
    case "Pulang":
      return "Waktu pulang. Hati-hati di jalan.";
    default:
      return "Bel berbunyi.";
  }
}

/** Hari dari tanggal `YYYY-MM-DD`, 1=Senin sampai 7=Minggu; `null` bila rusak. */
export function hariDariTanggal(tanggal: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return null;
  const hari = new Date(`${tanggal}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(hari)) return null;
  return hari === 0 ? 7 : hari;
}

/** Baris KBM yang aktif, urut nomor jam pelajarannya. */
export function jamKbmAktif<T extends JamBelLike>(periods: readonly T[]): T[] {
  return periods
    .filter((row) => row.jenis === "KBM" && row.is_aktif === 1)
    .sort((a, b) => a.jam_ke - b.jam_ke);
}

/**
 * Nomor jam KBM yang terlewat, misalnya `[4]` untuk 1, 2, 3, 5.
 *
 * Sebelum Istirahat berhenti memakan nomor, sekolah mengisinya sebagai "jam
 * ke-4". Data lama itu tidak diubah otomatis; celahnya ditandai di layar supaya
 * admin merapikan penomorannya sendiri.
 */
export function nomorJamKbmKosong(periods: readonly JamBelLike[]): number[] {
  const nomor = new Set(jamKbmAktif(periods).map((row) => row.jam_ke));
  const tertinggi = Math.max(0, ...nomor);
  const kosong: number[] = [];
  for (let n = 1; n < tertinggi; n += 1) {
    if (!nomor.has(n)) kosong.push(n);
  }
  return kosong;
}

/** Pukul sebuah rentang `jam_ke` menurut jadwal bel, misalnya `07:00–08:20`. */
export function pukulJamKe(
  periods: readonly JamBelLike[],
  jamKe: string,
): string | null {
  const rentang = rentangJamKe(jamKe);
  if (!rentang) return null;
  const kbm = jamKbmAktif(periods);
  const awal = kbm.find((row) => row.jam_ke === rentang.awal);
  const akhir = kbm.find((row) => row.jam_ke === rentang.akhir);
  return awal && akhir ? `${awal.jam_mulai}–${akhir.jam_selesai}` : null;
}

/** Nomor jam KBM yang sedang berlangsung pada pukul `HH:MM`, atau `null`. */
export function jamKeSekarang(
  periods: readonly JamBelLike[],
  pukul: string,
): number | null {
  const row = jamKbmAktif(periods).find(
    (item) => item.jam_mulai <= pukul && pukul < item.jam_selesai,
  );
  return row ? row.jam_ke : null;
}

/**
 * Baris jadwal mengajar yang sedang berlangsung, untuk DIUSULKAN di layar
 * presensi. Tidak pernah dipakai untuk menyimpan apa pun: guru tetap memilih
 * dan menekan simpan sendiri.
 */
export function usulkanSesiSekarang<T extends { jam_ke: string }>(
  jadwal: readonly T[],
  periods: readonly JamBelLike[],
  pukul: string,
): T | null {
  const sekarang = jamKeSekarang(periods, pukul);
  if (sekarang === null) return null;
  return (
    jadwal.find((row) => {
      const rentang = rentangJamKe(row.jam_ke);
      return (
        rentang !== null &&
        rentang.awal <= sekarang &&
        sekarang <= rentang.akhir
      );
    }) ?? null
  );
}

/**
 * Status awal setiap baris roster.
 *
 * Dieja di sini — modul netral yang dipakai UI maupun service — supaya nilainya
 * tidak bercabang antara keduanya. Alasan mengapa bawaannya `Hadir` dan bukan
 * `Alfa` ada di `DEFAULT_ROSTER_STATUS` pada `class_attendance.rs`.
 */
export const DEFAULT_ROSTER_STATUS = "Hadir" as const;

/**
 * Apakah roster memuat pekerjaan guru yang belum tersimpan?
 *
 * Memuat ulang roster mengembalikan SELURUH siswa ke status bawaan dan
 * menghapus sesi yang sedang disunting. Tombolnya duduk tepat di sebelah filter,
 * jadi satu salah ketuk di layar sentuh bisa menghapus tiga puluh tanda
 * kehadiran tanpa jejak — dan karena `editingSessionId` ikut hilang, simpan
 * berikutnya membuat sesi baru yang justru ditolak sebagai duplikat.
 *
 * Hanya penyimpangan dari bawaan yang dihitung: memuat ulang roster yang belum
 * disentuh sama sekali tidak kehilangan apa pun, jadi tidak perlu ditanyakan.
 */
export function hasUnsavedAttendanceMarks(
  items: readonly RosterAttendanceCheckItem[],
): boolean {
  return items.some((item) => {
    const status = String(item.status ?? "").trim();
    if (status !== "" && status !== DEFAULT_ROSTER_STATUS) return true;
    return String(item.catatan ?? "").trim() !== "";
  });
}

/** Bentuk minimal satu baris anomali yang dibutuhkan penyusunan pesan wali. */
export interface ParentNotificationSource {
  anomaly_type?: string | null;
  nama_siswa?: string | null;
  nama_rombel?: string | null;
  nama_mapel?: string | null;
  jam_ke?: string | null;
  nama_guru?: string | null;
  jam_masuk_gerbang?: string | null;
  tanggal?: string | null;
}

/** Dua template yang dipakai tombol "Hubungi Wali" di Rekonsiliasi KBM. */
export const REKONSILIASI_TEMPLATE_KINDS = [
  "rekonsiliasi_bolos",
  "rekonsiliasi_tanpa_scan",
] as const satisfies readonly WaTemplateKind[];

/**
 * Pesan WhatsApp untuk wali murid, DIBEDAKAN per jenis anomali.
 *
 * Rekonsiliasi menghasilkan dua anomali yang artinya berlawanan, tetapi teks
 * pesannya sempat dipaku untuk salah satu saja. Akibatnya wali dari siswa
 * `HADIR_TANPA_SCAN_GERBANG` menerima kalimat yang setiap klausanya terbalik —
 * "tercatat hadir di gerbang … namun TIDAK HADIR di kelas" — padahal yang
 * terjadi justru sebaliknya. Karena itu tiap anomali punya template sendiri.
 *
 * `templates` berisi teks tersimpan (`wa_template_<jenis>`); yang kosong atau
 * tidak sah jatuh ke teks bawaan. Cermin `reconciliation_message` di
 * `class_attendance.rs`, diuji dengan vektor yang sama.
 */
export function composeReconciliationMessage(
  item: ParentNotificationSource,
  templates: Partial<Record<WaTemplateKind, string>>,
): string {
  const teks = (value: string | null | undefined, cadangan: string) =>
    String(value ?? "").trim() || cadangan;
  const jenis: WaTemplateKind =
    item.anomaly_type === "HADIR_TANPA_SCAN_GERBANG"
      ? "rekonsiliasi_tanpa_scan"
      : "rekonsiliasi_bolos";
  // `jam_masuk` di absensi_harian berupa stempel lengkap "YYYY-MM-DD HH:MM:SS";
  // wali cukup membaca jam dan menitnya.
  const jamGerbang =
    String(item.jam_masuk_gerbang ?? "")
      .trim()
      .split(" ")
      .pop()
      ?.slice(0, 5) ?? "";
  return composeWaMessage(jenis, templates[jenis], {
    nama: teks(item.nama_siswa, "ananda"),
    rombel: teks(item.nama_rombel, "-"),
    mapel: teks(item.nama_mapel, "mata pelajaran"),
    jam_ke: teks(item.jam_ke, "-"),
    guru: teks(item.nama_guru, "-"),
    jam_gerbang: jamGerbang || "-",
    tanggal: teks(item.tanggal, "-"),
  });
}

/** Bentuk minimal satu baris roster yang dibutuhkan pemeriksaan ini. */
export interface RosterAttendanceCheckItem {
  nama_lengkap?: string | null;
  status?: string | null;
  jam_masuk?: string | null;
  catatan?: string | null;
}

/** Siswa yang ditandai Hadir tetapi tidak punya catatan scan gerbang hari itu. */
export function findPresentWithoutGateScan(
  items: readonly RosterAttendanceCheckItem[],
): string[] {
  return items
    .filter(
      (item) =>
        String(item.status ?? "").trim() === "Hadir" &&
        String(item.jam_masuk ?? "").trim() === "",
    )
    .map((item) => String(item.nama_lengkap ?? "").trim() || "(tanpa nama)");
}

/**
 * Pesan konfirmasi, atau `null` bila tidak ada yang perlu ditanyakan.
 *
 * Nama dibatasi lima supaya kotak dialog tetap terbaca di layar ponsel; sisanya
 * diringkas sebagai hitungan.
 */
export function buildPresentWithoutGateScanWarning(
  items: readonly RosterAttendanceCheckItem[],
): string | null {
  const names = findPresentWithoutGateScan(items);
  if (names.length === 0) return null;

  const shown = names.slice(0, 5).join(", ");
  const sisa = names.length - 5;
  const daftar = sisa > 0 ? `${shown}, dan ${sisa} lainnya` : shown;

  return (
    `${names.length} siswa ditandai Hadir tetapi belum scan gerbang hari ini:\n\n` +
    `${daftar}\n\n` +
    "Periksa sekali lagi sebelum menyimpan. Lanjutkan?"
  );
}
