import { describe, expect, test } from "bun:test";
import {
  aturJamSelesaiBel,
  aturNomorJamBel,
  barisBelBerbunyi,
  buildPresentWithoutGateScanWarning,
  composeReconciliationMessage,
  findPresentWithoutGateScan,
  hariDariTanggal,
  hasUnsavedAttendanceMarks,
  hitungJp,
  jadwalBelBerlaku,
  jamKeBeririsan,
  jamKeSekarang,
  jpUnitKey,
  nomorJamKbmKosong,
  normalizeJamBel,
  normalizeJamKe,
  normalizeSuaraBel,
  parseJpDuration,
  parseJpDurationForUnit,
  parseJpMaxForUnit,
  parseJpMaxPerDay,
  pukulJamKe,
  rentangJamKe,
  susunJamKe,
  teksPengumumanBel,
  usulkanSesiSekarang,
} from "@/lib/validations/class-attendance";

/**
 * Vektor `jam_ke` — WAJIB identik dengan `normalisasi_jam_ke_menerima_angka_dan_rentang`
 * di `class_attendance.rs`. Inilah cara paritas kedua implementasi dijaga tanpa
 * bisa menjalankan Rust dari sini, pola yang sama dengan `ip-allowlist` dan `totp`.
 */
const JAM_KE_DITERIMA: [string, string][] = [
  ["1", "1"],
  ["8", "8"],
  ["12", "12"],
  ["  3  ", "3"],
  ["1-2", "1-2"],
  ["7-8", "7-8"],
  ["1 - 2", "1-2"],
  ["11-12", "11-12"],
  // Batas struktural naik ke 20: pesantren dan sekolah berasrama benar-benar
  // punya jam pelajaran sampai belasan. Jumlah yang dipakai sebuah sekolah
  // dibatasi terpisah lewat `jp_max_per_hari`.
  ["20", "20"],
  ["13-20", "13-20"],
];

const JAM_KE_DITOLAK = [
  "", // kosong
  "0", // di bawah batas
  "21", // di atas batas struktural
  "abc", // bukan angka
  "2-1", // terbalik
  "3-3", // rentang nol
  "1-", // tidak lengkap
  "-2", // tidak lengkap
  "1-2-3", // rentang bertingkat
  "1,2", // pemisah salah
  "０", // digit non-ASCII
];

describe("normalizeJamKe", () => {
  for (const [masukan, harapan] of JAM_KE_DITERIMA) {
    test(`menerima "${masukan}" menjadi "${harapan}"`, () => {
      expect(normalizeJamKe(masukan)).toBe(harapan);
    });
  }

  for (const masukan of JAM_KE_DITOLAK) {
    test(`menolak "${masukan}"`, () => {
      expect(normalizeJamKe(masukan)).toBeNull();
    });
  }

  test("bentuk kanonik membuat dua ejaan sesi yang sama tidak lolos sebagai duplikat", () => {
    // Tanpa normalisasi sebelum pemeriksaan duplikat, "1-2" dan "1 - 2" akan
    // tersimpan sebagai dua sesi berbeda untuk jam pelajaran yang sama.
    expect(normalizeJamKe("1 - 2")).toBe(normalizeJamKe("1-2"));
  });
});

/**
 * Vektor rentang & irisan — WAJIB identik dengan
 * `rentang_jam_ke_membaca_angka_tunggal_dan_rentang` dan
 * `irisan_jam_ke_dinilai_dari_rentang_bukan_teks` di `class_attendance.rs`.
 */
const RENTANG: Array<[string, { awal: number; akhir: number } | null]> = [
  ["1", { awal: 1, akhir: 1 }],
  ["12", { awal: 12, akhir: 12 }],
  ["1-2", { awal: 1, akhir: 2 }],
  ["3 - 5", { awal: 3, akhir: 5 }],
  ["20", { awal: 20, akhir: 20 }],
  ["abc", null],
  ["2-1", null],
  ["21", null],
];

const BERIRISAN: Array<[string, string]> = [
  ["1", "1"],
  ["1-2", "2"],
  ["2", "1-2"],
  ["1-2", "2-3"],
  ["1-4", "2-3"],
  ["2-3", "1-4"],
  ["1 - 2", "1-2"],
];

const TIDAK_BERIRISAN: Array<[string, string]> = [
  ["1", "2"],
  ["1-2", "3-4"],
  ["3-4", "1-2"],
  ["1-2", "3"],
  // Nilai tidak valid tidak pernah dianggap bentrok: baris lama dengan teks
  // asing tidak boleh mengunci jadwal rombelnya.
  ["1-2", "abc"],
  ["abc", "1-2"],
  ["", "1"],
];

describe("rentangJamKe", () => {
  for (const [masukan, harapan] of RENTANG) {
    test(`membaca "${masukan}"`, () => {
      expect(rentangJamKe(masukan)).toEqual(harapan);
    });
  }
});

describe("jamKeBeririsan", () => {
  for (const [a, b] of BERIRISAN) {
    test(`"${a}" beririsan dengan "${b}"`, () => {
      expect(jamKeBeririsan(a, b)).toBe(true);
    });
  }

  for (const [a, b] of TIDAK_BERIRISAN) {
    test(`"${a}" tidak beririsan dengan "${b}"`, () => {
      expect(jamKeBeririsan(a, b)).toBe(false);
    });
  }
});

describe("hitungJp", () => {
  test("angka tunggal bernilai satu JP", () => {
    expect(hitungJp("4")).toBe(1);
  });

  test("rentang dihitung inklusif di kedua ujungnya", () => {
    // 3-5 adalah jam ke-3, ke-4, dan ke-5 — tiga JP, bukan dua. Selisih satu
    // di sini adalah selisih satu jam pelajaran pada honor guru.
    expect(hitungJp("3-5")).toBe(3);
    expect(hitungJp("1-2")).toBe(2);
  });

  test("nilai tidak valid tidak menghasilkan angka", () => {
    expect(hitungJp("abc")).toBeNull();
  });
});

describe("susunJamKe", () => {
  test("dua angka sama menjadi angka tunggal", () => {
    expect(susunJamKe(3, 3)).toBe("3");
  });

  test("dua angka berbeda menjadi rentang kanonik", () => {
    expect(susunJamKe(1, 2)).toBe("1-2");
  });

  test("urutan terbalik dan angka di luar batas ditolak", () => {
    expect(susunJamKe(2, 1)).toBeNull();
    expect(susunJamKe(0, 2)).toBeNull();
    expect(susunJamKe(1, 21)).toBeNull();
  });
});

describe("peringatan Hadir tanpa scan gerbang", () => {
  const roster = [
    { nama_lengkap: "Budi", status: "Hadir", jam_masuk: "07:01" },
    { nama_lengkap: "Siti", status: "Hadir", jam_masuk: null },
    { nama_lengkap: "Andi", status: "Hadir", jam_masuk: "   " },
    { nama_lengkap: "Rina", status: "Alfa", jam_masuk: null },
    { nama_lengkap: "Doni", status: "Izin", jam_masuk: null },
  ];

  test("hanya menandai yang berstatus Hadir tanpa jam masuk", () => {
    // Rina (Alfa) dan Doni (Izin) sudah ditandai sadar oleh guru, jadi bukan
    // urusan peringatan ini. Andi berisi spasi — itu tetap berarti belum scan.
    expect(findPresentWithoutGateScan(roster)).toEqual(["Siti", "Andi"]);
  });

  test("tidak bertanya apa pun ketika semuanya wajar", () => {
    expect(
      buildPresentWithoutGateScanWarning([
        { nama_lengkap: "Budi", status: "Hadir", jam_masuk: "07:01" },
        { nama_lengkap: "Rina", status: "Alfa", jam_masuk: null },
      ]),
    ).toBeNull();
  });

  test("meringkas sisanya ketika namanya lebih dari lima", () => {
    const banyak = Array.from({ length: 8 }, (_, i) => ({
      nama_lengkap: `Siswa ${i + 1}`,
      status: "Hadir",
      jam_masuk: null,
    }));
    const pesan = buildPresentWithoutGateScanWarning(banyak) ?? "";
    expect(pesan).toContain("8 siswa");
    expect(pesan).toContain("dan 3 lainnya");
  });
});

// Vektor yang sama dengan `tests_reconciliation_message` di `class_attendance.rs`.
describe("composeReconciliationMessage", () => {
  const dasar = {
    nama_siswa: "Budi Santoso",
    nama_rombel: "VII-A",
    nama_mapel: "Matematika",
    jam_ke: "1-2",
    nama_guru: "Bu Rina",
    jam_masuk_gerbang: "2026-10-07 07:01:30",
    tanggal: "2026-10-07",
  };
  const BOLOS_BAWAAN =
    "Yth. Bapak/Ibu Wali dari Budi Santoso, diberitahukan bahwa ananda tercatat hadir di gerbang sekolah (pukul 07:01), namun TIDAK HADIR (Alfa) pada Matematika jam ke-1-2 (Bu Rina). Mohon konfirmasi kehadiran siswa. Terima kasih.";

  test("tanpa template tersimpan memakai teks bawaan per anomali", () => {
    expect(
      composeReconciliationMessage(
        { ...dasar, anomaly_type: "BOLOS_DI_SEKOLAH" },
        {},
      ),
    ).toBe(BOLOS_BAWAAN);
    // Regresi: kedua anomali sempat memakai kalimat yang sama, sehingga wali
    // siswa HADIR_TANPA_SCAN_GERBANG menerima fakta yang terbalik.
    expect(
      composeReconciliationMessage(
        {
          ...dasar,
          anomaly_type: "HADIR_TANPA_SCAN_GERBANG",
          jam_masuk_gerbang: null,
        },
        {},
      ),
    ).toBe(
      "Yth. Bapak/Ibu Wali dari Budi Santoso, ananda tercatat HADIR pada Matematika jam ke-1-2 (Bu Rina), namun tidak ditemukan catatan scan di gerbang sekolah hari ini. Mohon dipastikan ananda membawa kartu pelajarnya dan memindai di gerbang saat tiba. Terima kasih.",
    );
  });

  test("template tersimpan dipakai, dan jam gerbang hanya jam:menit", () => {
    expect(
      composeReconciliationMessage(
        {
          ...dasar,
          anomaly_type: "BOLOS_DI_SEKOLAH",
          jam_masuk_gerbang: "06:30:00",
        },
        {
          rekonsiliasi_bolos:
            "Halo wali {nama} ({rombel}), {mapel} jam {jam_ke} pukul {jam_gerbang} tgl {tanggal}",
        },
      ),
    ).toBe(
      "Halo wali Budi Santoso (VII-A), Matematika jam 1-2 pukul 06:30 tgl 2026-10-07",
    );
  });

  test("template tersimpan yang tidak sah jatuh ke bawaan", () => {
    expect(
      composeReconciliationMessage(
        { ...dasar, anomaly_type: "BOLOS_DI_SEKOLAH" },
        { rekonsiliasi_bolos: "Halo {rombel}" },
      ),
    ).toBe(BOLOS_BAWAAN);
  });

  test("kolom kosong diisi cadangan, bukan undefined", () => {
    expect(
      composeReconciliationMessage({ anomaly_type: "BOLOS_DI_SEKOLAH" }, {}),
    ).toBe(
      "Yth. Bapak/Ibu Wali dari ananda, diberitahukan bahwa ananda tercatat hadir di gerbang sekolah (pukul -), namun TIDAK HADIR (Alfa) pada mata pelajaran jam ke-- (-). Mohon konfirmasi kehadiran siswa. Terima kasih.",
    );
  });
});

describe("hasUnsavedAttendanceMarks", () => {
  test("roster yang belum disentuh tidak perlu ditanyakan", () => {
    // Semuanya masih di status bawaan: memuat ulang tidak kehilangan apa pun.
    expect(
      hasUnsavedAttendanceMarks([
        { nama_lengkap: "Budi", status: "Hadir" },
        { nama_lengkap: "Siti", status: "Hadir" },
      ]),
    ).toBe(false);
    expect(hasUnsavedAttendanceMarks([])).toBe(false);
  });

  test("status yang menyimpang dari bawaan dihitung sebagai pekerjaan", () => {
    for (const status of ["Izin", "Sakit", "Alfa", "Dispensasi"]) {
      expect(
        hasUnsavedAttendanceMarks([
          { nama_lengkap: "Budi", status: "Hadir" },
          { nama_lengkap: "Siti", status },
        ]),
      ).toBe(true);
    }
  });

  test("catatan yang diketik guru juga dihitung", () => {
    expect(
      hasUnsavedAttendanceMarks([
        { nama_lengkap: "Budi", status: "Hadir", catatan: "Izin ke UKS" },
      ]),
    ).toBe(true);
    // Catatan kosong atau berisi spasi bukan pekerjaan.
    expect(
      hasUnsavedAttendanceMarks([
        { nama_lengkap: "Budi", status: "Hadir", catatan: "   " },
      ]),
    ).toBe(false);
  });

  test("status kosong berarti belum ditandai, bukan penyimpangan", () => {
    expect(
      hasUnsavedAttendanceMarks([{ nama_lengkap: "Budi", status: "" }]),
    ).toBe(false);
  });
});

/**
 * Vektor pengaturan jam pelajaran — WAJIB identik dengan
 * `pengaturan_jp_jatuh_ke_bawaan_bukan_ke_nol` di `class_attendance.rs`.
 *
 * `[nilai mentah di setting_gex_system, hasil bacaan]`
 */
const VEKTOR_JP_MAX: Array<[string | null, number]> = [
  [null, 12],
  ["", 12],
  ["   ", 12],
  ["bukan angka", 12],
  ["0", 12],
  ["-3", 12],
  ["21", 12], // di atas batas struktural
  ["1", 1],
  ["8", 8],
  ["12", 12],
  ["20", 20],
  [" 10 ", 10],
];

const VEKTOR_JP_DURASI: Array<[string | null, number]> = [
  [null, 45],
  ["", 45],
  ["abc", 45],
  ["0", 45],
  ["241", 45],
  ["35", 35],
  ["40", 40],
  ["45", 45],
  ["240", 240],
];

describe("pengaturan jam pelajaran", () => {
  for (const [mentah, harapan] of VEKTOR_JP_MAX) {
    test(`jumlah per hari "${mentah}" dibaca ${harapan}`, () => {
      // Nilai cacat jatuh ke BAWAAN, bukan ke nol (setiap presensi ditolak)
      // dan bukan ke batas struktural (diam-diam melonggarkan kebijakan).
      expect(parseJpMaxPerDay(mentah)).toBe(harapan);
    });
  }

  for (const [mentah, harapan] of VEKTOR_JP_DURASI) {
    test(`durasi "${mentah}" dibaca ${harapan}`, () => {
      expect(parseJpDuration(mentah)).toBe(harapan);
    });
  }
});

/**
 * Vektor jam bel — WAJIB identik dengan `normalisasi_jam_bel_menerima_bentuk_manusia`
 * di `class_attendance.rs`.
 */
const JAM_BEL_DITERIMA: Array<[string, string]> = [
  ["07:00", "07:00"],
  ["7:0", "07:00"],
  ["7:5", "07:05"],
  ["23:59", "23:59"],
  ["00:00", "00:00"],
  [" 08 : 30 ", "08:30"],
];

const JAM_BEL_DITOLAK = [
  "",
  "0700", // tanpa titik dua
  "24:00", // jam di luar hari
  "07:60", // menit di luar jam
  "7", // tidak lengkap
  ":30",
  "07:",
  "abc:00",
  "007:00", // lebih dari dua digit
  "０7:00", // digit non-ASCII
];

describe("normalizeJamBel", () => {
  for (const [masukan, harapan] of JAM_BEL_DITERIMA) {
    test(`menerima "${masukan}" menjadi "${harapan}"`, () => {
      expect(normalizeJamBel(masukan)).toBe(harapan);
    });
  }

  for (const masukan of JAM_BEL_DITOLAK) {
    test(`menolak "${masukan}"`, () => {
      expect(normalizeJamBel(masukan)).toBeNull();
    });
  }
});

// Vektor yang sama dengan `tests_atur_nomor_jam_bel` di `class_attendance.rs`.
describe("aturNomorJamBel", () => {
  test("hanya KBM yang bernomor", () => {
    expect(aturNomorJamBel("KBM", 3, 12)).toEqual({ ok: true, jamKe: 3 });
    expect(aturNomorJamBel("Istirahat", 4, 12)).toEqual({ ok: true, jamKe: 1 });
    expect(aturNomorJamBel("Upacara", 0, 12)).toEqual({ ok: true, jamKe: 1 });
    for (const jamKe of [0, 13, 2.5]) {
      expect(aturNomorJamBel("KBM", jamKe, 12)).toEqual({
        ok: false,
        pesan: "Jam pelajaran harus di antara 1 dan 12, sesuai Pengaturan.",
      });
    }
  });
});

describe("jadwal bel untuk jadwal mengajar dan presensi", () => {
  const bel = [
    {
      jam_ke: 1,
      jam_mulai: "07:00",
      jam_selesai: "07:40",
      jenis: "KBM",
      is_aktif: 1,
    },
    {
      jam_ke: 2,
      jam_mulai: "07:40",
      jam_selesai: "08:20",
      jenis: "KBM",
      is_aktif: 1,
    },
    // Data lama: Istirahat masih memakan nomor 3, sehingga KBM lompat ke 4.
    {
      jam_ke: 3,
      jam_mulai: "08:20",
      jam_selesai: "08:35",
      jenis: "Istirahat",
      is_aktif: 1,
    },
    {
      jam_ke: 4,
      jam_mulai: "08:35",
      jam_selesai: "09:15",
      jenis: "KBM",
      is_aktif: 1,
    },
    {
      jam_ke: 5,
      jam_mulai: "09:15",
      jam_selesai: "09:55",
      jenis: "KBM",
      is_aktif: 0,
    },
  ];

  test("celah penomoran KBM ditandai, baris nonaktif diabaikan", () => {
    expect(nomorJamKbmKosong(bel)).toEqual([3]);
    expect(nomorJamKbmKosong([])).toEqual([]);
  });

  test("pukul rentang hanya dari baris KBM aktif", () => {
    expect(pukulJamKe(bel, "1-2")).toBe("07:00–08:20");
    expect(pukulJamKe(bel, "3")).toBeNull();
    expect(pukulJamKe(bel, "5")).toBeNull();
  });

  test("jam yang sedang berlangsung", () => {
    expect(jamKeSekarang(bel, "07:00")).toBe(1);
    expect(jamKeSekarang(bel, "07:40")).toBe(2);
    expect(jamKeSekarang(bel, "08:25")).toBeNull(); // istirahat
    expect(jamKeSekarang(bel, "06:30")).toBeNull();
  });

  test("sesi yang diusulkan mengikuti rentang jadwal", () => {
    const jadwal = [
      { id: "a", jam_ke: "1-2" },
      { id: "b", jam_ke: "4" },
    ];
    expect(usulkanSesiSekarang(jadwal, bel, "07:50")?.id).toBe("a");
    expect(usulkanSesiSekarang(jadwal, bel, "08:40")?.id).toBe("b");
    expect(usulkanSesiSekarang(jadwal, bel, "08:25")).toBeNull();
  });
});

/**
 * Vektor v60 — WAJIB identik dengan `pengaturan_jp_per_unit_dan_bel_v60` di
 * `class_attendance.rs`.
 */
const VEKTOR_JP_MAX_UNIT: [string | null, string | null, number][] = [
  [null, null, 12],
  [null, "8", 8],
  ["10", "8", 10],
  [" 6 ", "8", 6],
  ["", "8", 8],
  ["0", "8", 8],
  ["21", "8", 8],
  ["abc", "8", 8],
  ["abc", "rusak", 12],
  ["20", null, 20],
];

const VEKTOR_JP_DURASI_UNIT: [string | null, string | null, number][] = [
  [null, null, 45],
  [null, "40", 40],
  ["35", "40", 35],
  ["0", "40", 40],
  ["241", "40", 40],
  ["x", "x", 45],
];

const VEKTOR_SUARA: [string, string | null][] = [
  ["", "nada-1"],
  ["   ", "nada-1"],
  ["nada-2", "nada-2"],
  [" mp3-3 ", "mp3-3"],
  ["pengumuman", "pengumuman"],
  ["nada-4", null],
  ["MP3-1", null],
  ["sirene", null],
];

const VEKTOR_JAM_SELESAI: [string, string, string, string | null][] = [
  ["Pulang", "14:00", "", "14:00"],
  ["Pulang", "14:00", "13:00", "14:00"],
  ["KBM", "07:00", "07:45", "07:45"],
  ["KBM", "07:00", "07:00", null],
  ["Istirahat", "10:00", "09:30", null],
];

describe("pengaturan JP per unit dan bel (v60)", () => {
  test("kunci unit", () => {
    expect(jpUnitKey("jp_max_per_hari", "unt_1")).toBe("jp_max_per_hari:unt_1");
  });

  for (const [unit, sekolah, harapan] of VEKTOR_JP_MAX_UNIT) {
    test(`batas unit ${unit} / sekolah ${sekolah} = ${harapan}`, () => {
      // Nilai unit yang rusak jatuh ke nilai SEKOLAH, bukan ke bawaan 12.
      expect(parseJpMaxForUnit(unit, sekolah)).toBe(harapan);
    });
  }

  for (const [unit, sekolah, harapan] of VEKTOR_JP_DURASI_UNIT) {
    test(`durasi unit ${unit} / sekolah ${sekolah} = ${harapan}`, () => {
      expect(parseJpDurationForUnit(unit, sekolah)).toBe(harapan);
    });
  }

  for (const [mentah, harapan] of VEKTOR_SUARA) {
    test(`suara "${mentah}" -> ${harapan}`, () => {
      // Nilai asing DITOLAK, tidak dinormalkan ke nada bawaan.
      expect(normalizeSuaraBel(mentah)).toBe(harapan as never);
    });
  }

  for (const [jenis, mulai, selesai, harapan] of VEKTOR_JAM_SELESAI) {
    test(`${jenis} ${mulai}-${selesai} -> ${harapan}`, () => {
      const hasil = aturJamSelesaiBel(jenis, mulai, selesai);
      expect(hasil.ok ? hasil.jamSelesai : null).toBe(harapan);
    });
  }
});

describe("jadwal bel per unit dan hari", () => {
  const bel = (
    id: string,
    id_unit: string | null,
    hari: number | null,
    jam_mulai: string,
    extra: Partial<{ is_aktif: number; bunyi: number }> = {},
  ) => ({
    id,
    id_unit,
    hari,
    jam_mulai,
    is_aktif: 1,
    bunyi: 1,
    ...extra,
  });
  const semua = [
    bel("umum", null, null, "07:00"),
    bel("umum-jumat", null, 5, "07:30"),
    bel("smk", "smk", null, "06:45"),
    bel("smk-jumat", "smk", 5, "06:30"),
  ];
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

  test("cakupan paling khusus dipakai utuh, tidak dicampur", () => {
    expect(ids(jadwalBelBerlaku(semua, "smk", 5))).toEqual(["smk-jumat"]);
    expect(ids(jadwalBelBerlaku(semua, "smk", 1))).toEqual(["smk"]);
    expect(ids(jadwalBelBerlaku(semua, "smp", 5))).toEqual(["umum-jumat"]);
    expect(ids(jadwalBelBerlaku(semua, "smp", 1))).toEqual(["umum"]);
    expect(ids(jadwalBelBerlaku(semua, null, 5))).toEqual(["umum-jumat"]);
    expect(ids(jadwalBelBerlaku(semua, null, null))).toEqual(["umum"]);
    expect(jadwalBelBerlaku([], "smk", 1)).toEqual([]);
  });

  test("hari dari tanggal mengikuti 1=Senin sampai 7=Minggu", () => {
    expect(hariDariTanggal("2026-10-23")).toBe(5); // Jumat
    expect(hariDariTanggal("2026-10-25")).toBe(7); // Minggu
    expect(hariDariTanggal("2026-10-26")).toBe(1); // Senin
    expect(hariDariTanggal("23-10-2026")).toBeNull();
  });

  test("perangkat bel menggabungkan unit, membuang senyap dan pukul ganda", () => {
    const rows = [
      bel("a", "smp", null, "07:00"),
      bel("b", "smk", null, "07:00"),
      bel("c", "smk", null, "08:00", { bunyi: 0 }),
      bel("d", "smk", null, "09:00", { is_aktif: 0 }),
      bel("e", "smk", null, "06:45"),
      bel("f", null, null, "10:00"),
    ];
    expect(ids(barisBelBerbunyi(rows, ["smp", "smk"], 1))).toEqual(["e", "a"]);
    // Tanpa unit terpilih = jadwal "Semua unit".
    expect(ids(barisBelBerbunyi(rows, [], 1))).toEqual(["f"]);
  });

  test("pengumuman menyebut jam pelajaran dan pulang", () => {
    expect(teksPengumumanBel({ jenis: "KBM", jam_ke: 3 })).toBe(
      "Jam pelajaran ke-3 dimulai.",
    );
    expect(teksPengumumanBel({ jenis: "Pulang", jam_ke: 1 })).toContain(
      "pulang",
    );
  });
});
