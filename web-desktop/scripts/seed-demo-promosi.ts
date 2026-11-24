import { createClient } from "@libsql/client";
import { resolveServerDatabaseConfig } from "../src/lib/server/database-config";

async function main() {
  const config = resolveServerDatabaseConfig(process.env);
  const client = createClient(config);

  console.log("Seeding realistic promotional demo data into:", config.url);

  // ==========================================
  // 1. INVENTARIS BARANG & MUTASI
  // ==========================================
  console.log("\n[1/5] Menambahkan data Inventaris...");
  const items = [
    {
      id: "brg_laptop_asus",
      kode: "AST-TI-001",
      nama: "Laptop ASUS ExpertBook B1400 Core i5",
      kategori: "Elektronik & IT",
      tipe: "Aset",
      satuan: "unit",
      min: 5,
      tempat: "Laboratorium Komputer",
      catatan: "Pengadaan Lab Multimedia & Pemrograman",
      jumlah: 35,
      harga: 9500000,
    },
    {
      id: "brg_proyektor_epson",
      kode: "AST-TI-002",
      nama: "Proyektor Epson EB-X500 3600 Lumens",
      kategori: "Elektronik & IT",
      tipe: "Aset",
      satuan: "unit",
      min: 2,
      tempat: "Ruang Guru & Multimedia",
      catatan: "Perangkat presentasi pembelajaran interaktif",
      jumlah: 12,
      harga: 6200000,
    },
    {
      id: "brg_kertas_hvs",
      kode: "HPK-ATK-001",
      nama: "Kertas HVS A4 80gr PaperOne",
      kategori: "Alat Tulis Kantor",
      tipe: "Habis Pakai",
      satuan: "rim",
      min: 20,
      tempat: "Gudang ATK Pusat",
      catatan: "Kebutuhan ujian dan administrasi TU",
      jumlah: 85,
      harga: 58000,
    },
    {
      id: "brg_spidol_snowman",
      kode: "HPK-ATK-002",
      nama: "Spidol Boardmarker Snowman Hitam",
      kategori: "Alat Tulis Kantor",
      tipe: "Habis Pakai",
      satuan: "pcs",
      min: 30,
      tempat: "Ruang Guru",
      catatan: "Kebutuhan pembelajaran tatap muka",
      jumlah: 150,
      harga: 12500,
    },
    {
      id: "brg_meja_kursi_jati",
      kode: "AST-MBL-001",
      nama: "Meja & Kursi Siswa Standar Kayu Jati",
      kategori: "Mebel & Sarpras",
      tipe: "Aset",
      satuan: "set",
      min: 15,
      tempat: "Ruang Kelas X-XII",
      catatan: "Kondisi prima terawat",
      jumlah: 240,
      harga: 750000,
    },
    {
      id: "brg_router_mikrotik",
      kode: "AST-TI-003",
      nama: "Router MikroTik RB750Gr3 Gigabit",
      kategori: "Elektronik & IT",
      tipe: "Aset",
      satuan: "unit",
      min: 2,
      tempat: "Ruang Server Pusat",
      catatan: "Manajemen bandwidth & jaringan ujian CBT",
      jumlah: 8,
      harga: 950000,
    },
    {
      id: "brg_kabel_lan",
      kode: "HPK-TI-001",
      nama: "Kabel UTP Cat6 Belden Original 305m",
      kategori: "Jaringan & IT",
      tipe: "Habis Pakai",
      satuan: "roll",
      min: 1,
      tempat: "Gudang IT",
      catatan: "Kabel instalasi jaringan lab dan kelas",
      jumlah: 4,
      harga: 1850000,
    },
    {
      id: "brg_mikroskop_ipa",
      kode: "AST-LAB-001",
      nama: "Mikroskop Monokuler Siswa XSP-12",
      kategori: "Laboratorium",
      tipe: "Aset",
      satuan: "unit",
      min: 3,
      tempat: "Laboratorium IPA",
      catatan: "Peralatan praktikum Biologi",
      jumlah: 20,
      harga: 1450000,
    },
    {
      id: "brg_bola_basket",
      kode: "AST-OLR-001",
      nama: "Bola Basket Molten GG7X Standar Perbasi",
      kategori: "Olahraga",
      tipe: "Aset",
      satuan: "pcs",
      min: 5,
      tempat: "Gudang Olahraga",
      catatan: "Peralatan penjas dan ekstrakurikuler",
      jumlah: 15,
      harga: 420000,
    },
    {
      id: "brg_sound_portable",
      kode: "AST-PRL-001",
      nama: "Sound System Portable Wireless Baretone 15 Inch",
      kategori: "Perlengkapan Sekolah",
      tipe: "Aset",
      satuan: "unit",
      min: 1,
      tempat: "Ruang Perlengkapan / Lapangan",
      catatan: "Upacara bendera & apel harian",
      jumlah: 4,
      harga: 3850000,
    },
  ];

  for (const it of items) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO inventory_barang 
              (id_barang, kode_barang, nama_barang, kategori, tipe, satuan, bisa_expired, stok_minimum, tempat_utama, catatan, status_aktif, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, '2026-10-15 08:00:00', '2026-11-20 09:30:00')`,
        args: [it.id, it.kode, it.nama, it.kategori, it.tipe, it.satuan, it.min, it.tempat, it.catatan],
      });

      // Insert mutasi saldo awal / pengadaan
      await client.execute({
        sql: `INSERT OR REPLACE INTO inventory_mutasi
              (id_mutasi, id_barang, jenis, alasan, tanggal, jumlah, tempat_tujuan, kondisi_tujuan, harga_satuan, catatan, dicatat_oleh, created_at)
              VALUES (?, ?, 'Masuk', 'Pengadaan', '2026-10-15', ?, ?, 'Baik', ?, 'Pengadaan Sarana & Prasarana Sekolah', 'superadmin', '2026-10-15 08:30:00')`,
        args: [`mut_${it.id}`, it.id, it.jumlah, it.tempat, it.harga],
      });
    } catch (err: any) {
      console.log(`Error insert barang ${it.id}:`, err.message);
    }
  }
  console.log("Inventaris berhasil diisi.");

  // ==========================================
  // 2. KEUANGAN, TAGIHAN, & PEMBAYARAN
  // ==========================================
  console.log("\n[2/5] Menyiapkan data Keuangan, Tagihan, dan Jurnal...");
  const jenisTagihan = [
    {
      id: "tag_spp_2627",
      nama: "SPP Bulanan TA 2026/2027",
      periodik: "Bulanan",
      nominal: 250000,
      akun: "akun-pendapatan-spp",
    },
    {
      id: "tag_dsp_2627",
      nama: "Dana Sumbangan Pendidikan (DSP / Uang Gedung)",
      periodik: "Sekali",
      nominal: 1500000,
      akun: "akun-pendapatan-pangkal",
    },
    {
      id: "tag_seragam_2627",
      nama: "Paket Seragam & Atribut Sekolah Lengkap",
      periodik: "Sekali",
      nominal: 450000,
      akun: "akun-pendapatan-pendaftaran",
    },
    {
      id: "tag_pas_2627",
      nama: "Biaya Penilaian Akhir Semester (PAS Ganjil)",
      periodik: "Sekali",
      nominal: 150000,
      akun: "akun-pendapatan-lain",
    },
  ];

  for (const jt of jenisTagihan) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_jenis_tagihan 
              (id_jenis_tagihan, nama, periodik, nominal_bawaan, id_akun_pendapatan, is_aktif, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 1, '2026-07-01 08:00:00', '2026-11-01 08:00:00')`,
        args: [jt.id, jt.nama, jt.periodik, jt.nominal, jt.akun],
      });

      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_tarif_tagihan 
              (id_tarif, id_jenis_tagihan, nama_unit, tingkat, nominal, created_at, updated_at)
              VALUES (?, ?, '', NULL, ?, '2026-07-01 08:00:00', '2026-11-01 08:00:00')`,
        args: [`trf_${jt.id}`, jt.id, jt.nominal],
      });
    } catch (err: any) {
      console.log(`Error insert jenis tagihan ${jt.id}:`, err.message);
    }
  }

  // Ambil 25 siswa aktif
  const studentsRes = await client.execute(
    "SELECT id_siswa, nama_lengkap, nis FROM siswa_data LIMIT 25"
  );
  const students = studentsRes.rows;

  let nomorUrut = 1;
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const idSiswa = String(s.id_siswa);
    const namaSiswa = String(s.nama_lengkap);

    // Tagihan SPP November 2026
    const idTagSpp = `tag_spp_nov26_${idSiswa}`;
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_tagihan
              (id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal, potongan, jatuh_tempo, dibuat_oleh, created_at)
              VALUES (?, ?, ?, 'tag_spp_2627', 'SPP November 2026', '2026-11', 250000, 0, '2026-11-10', 'superadmin', '2026-11-01 08:00:00')`,
        args: [idTagSpp, idSiswa, namaSiswa],
      });
    } catch (err: any) {
      console.log("Error insert tagihan SPP:", err.message);
    }

    // Tagihan DSP Uang Gedung
    const idTagDsp = `tag_dsp26_${idSiswa}`;
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_tagihan
              (id_tagihan, id_siswa, nama_siswa, id_jenis_tagihan, nama_tagihan, periode, nominal, potongan, jatuh_tempo, dibuat_oleh, created_at)
              VALUES (?, ?, ?, 'tag_dsp_2627', 'DSP / Uang Gedung 2026/2027', '2026/2027', 1500000, 0, '2026-12-15', 'superadmin', '2026-07-15 08:00:00')`,
        args: [idTagDsp, idSiswa, namaSiswa],
      });
    } catch (err: any) {
      console.log("Error insert tagihan DSP:", err.message);
    }

    // Jika i < 15, siswa ini sudah membayar SPP (Lunas)
    if (i < 15) {
      const idPembayaran = `pby_spp_nov26_${idSiswa}`;
      const metode = i % 2 === 0 ? "Tunai" : "Transfer";
      const idAkun = i % 2 === 0 ? "akun-kas" : "akun-bank";
      const tanggalPby = `2026-11-0${(i % 8) + 1}`;
      const nomorKwi = `KWI-202611-${String(nomorUrut).padStart(4, "0")}`;

      try {
        await client.execute({
          sql: `INSERT OR REPLACE INTO keu_pembayaran
                (id_pembayaran, id_siswa, nama_siswa, tanggal, seri, nomor_urut, nomor, metode, id_akun_kas, total, keterangan, dibuat_oleh, created_at)
                VALUES (?, ?, ?, ?, 'KWI', ?, ?, ?, ?, 250000, 'Pembayaran SPP Bulan November 2026', 'superadmin', '2026-11-05 10:00:00')`,
          args: [idPembayaran, idSiswa, namaSiswa, tanggalPby, nomorUrut, nomorKwi, metode, idAkun],
        });

        await client.execute({
          sql: `INSERT OR REPLACE INTO keu_pembayaran_alokasi
                (id_alokasi, id_pembayaran, id_tagihan, nominal)
                VALUES (?, ?, ?, 250000)`,
          args: [`alo_${idPembayaran}`, idPembayaran, idTagSpp],
        });
        nomorUrut++;
      } catch (err: any) {
        console.log("Error insert pembayaran:", err.message);
      }
    }
  }

  // JURNAL UMUM REALISTIS
  console.log("Menambahkan Jurnal Pembukuan...");
  const jurnalEntries = [
    {
      id: "jur_202611_01",
      tanggal: "2026-11-05",
      seri: "JU",
      urut: 1,
      nomor: "JU-202611-0001",
      keterangan: "Penerimaan Pembayaran SPP Siswa Gelombang I (Tunai)",
      debitAkun: "akun-kas",
      kreditAkun: "akun-pendapatan-spp",
      nominal: 3750000,
    },
    {
      id: "jur_202611_02",
      tanggal: "2026-11-10",
      seri: "JU",
      urut: 2,
      nomor: "JU-202611-0002",
      keterangan: "Penerimaan Pembayaran DSP & Uang Gedung Siswa via Bank",
      debitAkun: "akun-bank",
      kreditAkun: "akun-pendapatan-pangkal",
      nominal: 12000000,
    },
    {
      id: "jur_202611_03",
      tanggal: "2026-11-12",
      seri: "JU",
      urut: 3,
      nomor: "JU-202611-0003",
      keterangan: "Pembayaran Tagihan Listrik, Air & Paket Internet Sekolah",
      debitAkun: "akun-beban-utilitas",
      kreditAkun: "akun-bank",
      nominal: 2450000,
    },
    {
      id: "jur_202611_04",
      tanggal: "2026-11-15",
      seri: "JU",
      urut: 4,
      nomor: "JU-202611-0004",
      keterangan: "Pembelian ATK, Kertas HVS & Tinta Printer Kantor",
      debitAkun: "akun-beban-atk",
      kreditAkun: "akun-kas",
      nominal: 1850000,
    },
    {
      id: "jur_202611_05",
      tanggal: "2026-11-18",
      seri: "JU",
      urut: 5,
      nomor: "JU-202611-0005",
      keterangan: "Biaya Servis & Pemeliharaan Komputer Lab Multimedia",
      debitAkun: "akun-beban-pemeliharaan",
      kreditAkun: "akun-bank",
      nominal: 1650000,
    },
    {
      id: "jur_202611_06",
      tanggal: "2026-11-20",
      seri: "JU",
      urut: 6,
      nomor: "JU-202611-0006",
      keterangan: "Penerimaan Pembayaran SPP Siswa Gelombang II (Transfer Bank)",
      debitAkun: "akun-bank",
      kreditAkun: "akun-pendapatan-spp",
      nominal: 2500000,
    },
  ];

  for (const j of jurnalEntries) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_jurnal
              (id_jurnal, tanggal, seri, nomor_urut, nomor, keterangan, sumber, id_sumber, dibuat_oleh, created_at)
              VALUES (?, ?, ?, ?, ?, ?, 'Manual', NULL, 'superadmin', '2026-11-20 12:00:00')`,
        args: [j.id, j.tanggal, j.seri, j.urut, j.nomor, j.keterangan],
      });

      // Debit line
      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_jurnal_baris
              (id_baris, id_jurnal, id_akun, debit, kredit, keterangan, urutan)
              VALUES (?, ?, ?, ?, 0, ?, 1)`,
        args: [`${j.id}_d`, j.id, j.debitAkun, j.nominal, j.keterangan],
      });

      // Kredit line
      await client.execute({
        sql: `INSERT OR REPLACE INTO keu_jurnal_baris
              (id_baris, id_jurnal, id_akun, debit, kredit, keterangan, urutan)
              VALUES (?, ?, ?, 0, ?, ?, 2)`,
        args: [`${j.id}_k`, j.id, j.kreditAkun, j.nominal, j.keterangan],
      });
    } catch (err: any) {
      console.log(`Error insert jurnal ${j.id}:`, err.message);
    }
  }
  console.log("Keuangan & Pembukuan berhasil diisi.");

  // ==========================================
  // 3. PAYROLL / GAJI GURU & KARYAWAN
  // ==========================================
  console.log("\n[3/5] Menyiapkan data Payroll Runs & Gaji...");
  const teachersRes = await client.execute(
    "SELECT id_unik, nama, divisi FROM master_data WHERE divisi = 'Tenaga Pengajar' LIMIT 16"
  );
  const teachers = teachersRes.rows;

  // Run 1: Oktober 2026 (PAID)
  const run1Id = "prun_202610_paid";
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO payroll_runs
            (id, idempotency_key, period_start, period_end, status, total_gross_payout, total_net_payout, total_employees, created_by, created_at, updated_at)
            VALUES (?, 'payroll-run-2026-10', '2026-10-01', '2026-10-31', 'PAID', 67200000, 62450000, ?, 'superadmin', '2026-10-31 16:00:00', '2026-11-02 09:00:00')`,
      args: [run1Id, teachers.length],
    });
  } catch (err: any) {
    console.log("Error insert payroll run 1:", err.message);
  }

  // Run 2: November 2026 (APPROVED)
  const run2Id = "prun_202611_approved";
  try {
    await client.execute({
      sql: `INSERT OR REPLACE INTO payroll_runs
            (id, idempotency_key, period_start, period_end, status, total_gross_payout, total_net_payout, total_employees, created_by, created_at, updated_at)
            VALUES (?, 'payroll-run-2026-11', '2026-11-01', '2026-11-30', 'APPROVED', 69850000, 64920000, ?, 'superadmin', '2026-11-23 15:00:00', '2026-11-24 10:00:00')`,
      args: [run2Id, teachers.length],
    });
  } catch (err: any) {
    console.log("Error insert payroll run 2:", err.message);
  }

  // Items untuk masing-masing guru
  for (const t of teachers) {
    const idGuru = String(t.id_unik);
    const namaGuru = String(t.nama);
    const divisi = String(t.divisi || "Tenaga Pengajar");

    // Item Run 2 (November)
    const basicSalary = 3800000;
    const teachingJp = 24;
    const teachingSalary = teachingJp * 45000; // 1.080.000
    const allowances = 500000; // Tunjangan transport & wali kelas
    const gross = basicSalary + teachingSalary + allowances;
    const bpjsEmp = 125000;
    const bpjsComp = 260000;
    const pph21 = 75000;
    const deductions = bpjsEmp + pph21;
    const net = gross - deductions;

    const breakdown = JSON.stringify({
      basicSalary,
      teachingSalary,
      teachingJp,
      allowances: [{ name: "Tunjangan Jabatan / Wali Kelas", amount: allowances }],
      deductions: [{ name: "BPJS Ketenagakerjaan & Kesehatan", amount: bpjsEmp }],
      pph21,
      net,
    });

    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO payroll_items
              (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, ptkp_status, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, overtime_salary, gross_salary, total_allowances, total_deductions, bpjs_employee_total, bpjs_company_total, pph21_amount, net_salary, breakdown_snapshot, total_teaching_jp, teaching_salary, salary_type, daily_rate, days_present, created_at)
              VALUES (?, ?, ?, ?, ?, 'K/1', 160.0, 0.0, 0.0, 23750, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'HOURLY', 0, 22, '2026-11-23 15:30:00')`,
        args: [
          `pi_${run2Id}_${idGuru}`,
          run2Id,
          idGuru,
          namaGuru,
          divisi,
          basicSalary,
          gross,
          allowances,
          deductions,
          bpjsEmp,
          bpjsComp,
          pph21,
          net,
          breakdown,
          teachingJp,
          teachingSalary,
        ],
      });
    } catch (err: any) {
      console.log(`Error insert payroll item ${idGuru}:`, err.message);
    }
  }
  console.log("Payroll Runs & Gaji berhasil diisi.");

  // ==========================================
  // 4. NOTIFIKASI WHATSAPP
  // ==========================================
  console.log("\n[4/5] Memperbarui dan mengisi Notifikasi WhatsApp...");
  // Update sebagian notifikasi lama menjadi Terkirim
  await client.execute(
    "UPDATE notifikasi_wa SET status = 'Terkirim', sent_at = '2026-10-08 07:05:00', attempt_count = 1 WHERE id_notifikasi IN (SELECT id_notifikasi FROM notifikasi_wa WHERE status = 'Menunggu' LIMIT 35)"
  );

  // Tambahkan notifikasi baru bertanggal 2026-11-24 hari ini
  const recentWa = [
    {
      id: "wa_promosi_01",
      dedupe: "scan:20261124-sis01:scan_masuk",
      jenis: "scan_masuk",
      siswa: "sis_536138e64eff4e09940e444f6219adb8",
      nomor: "+6281234567890",
      pesan: "Yth. Orang Tua dari Bunga Nazwa Aryadi (Kelas X TJKT 1). Ananda telah hadir dan melakukan presensi masuk gerbang sekolah pukul 06:45:12 WIB. Kehadiran: Tepat Waktu.",
      status: "Terkirim",
      sent_at: "2026-11-24 06:45:15",
    },
    {
      id: "wa_promosi_02",
      dedupe: "scan:20261124-sis02:scan_masuk",
      jenis: "scan_masuk",
      siswa: "sis_f592ecb6738947d5896213bf68b44e56",
      nomor: "+6281987654321",
      pesan: "Yth. Orang Tua dari Devina Assifa (Kelas X TJKT 1). Ananda telah hadir dan melakukan presensi masuk gerbang sekolah pukul 06:52:40 WIB. Kehadiran: Tepat Waktu.",
      status: "Terkirim",
      sent_at: "2026-11-24 06:52:43",
    },
    {
      id: "wa_promosi_03",
      dedupe: "tagihan:20261124-sis03:pengingat",
      jenis: "tagihan",
      siswa: "sis_ec1e8a78ad36417298e9d6e49ed62507",
      nomor: "+6285211223344",
      pesan: "Yth. Orang Tua dari Nadia Putri Kamal. Pengingat administrasi SPP Bulan November 2026 sebesar Rp 250.000. Pembayaran dapat dilakukan via transfer Bank Mandiri 132-00-123456-7 a.n SMKS Mekarsari.",
      status: "Terkirim",
      sent_at: "2026-11-24 08:00:10",
    },
    {
      id: "wa_promosi_04",
      dedupe: "pengumuman:20261124:rapat_wali",
      jenis: "koreksi_admin",
      siswa: "sis_8ccb93bf7d9c44faac22f816e46d5538",
      nomor: "+6287711223344",
      pesan: "Yth. Bapak/Ibu Wali Murid SMK Mekarsari. Undangan Pengambilan Rapor Penilaian Tengah Semester (PTS) akan diselenggarakan pada hari Sabtu, 28 November 2026. Terima kasih.",
      status: "Terkirim",
      sent_at: "2026-11-24 09:15:00",
    },
    {
      id: "wa_promosi_05",
      dedupe: "scan:20261124-sis05:scan_pulang",
      jenis: "scan_pulang",
      siswa: "sis_cc439d0592f344d4bf754ecb3b3ae96d",
      nomor: "+6281355667788",
      pesan: "Yth. Orang Tua dari Nurhayati (Kelas X TJKT 1). Ananda telah melakukan presensi pulang sekolah pukul 15:30:22 WIB. Selamat beristirahat di rumah.",
      status: "Terkirim",
      sent_at: "2026-11-24 15:30:25",
    },
  ];

  for (const w of recentWa) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO notifikasi_wa
              (id_notifikasi, dedupe_key, jenis, id_siswa, tujuan_nomor, isi_pesan, status, attempt_count, sent_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, '2026-11-24 06:40:00', '2026-11-24 15:30:25')`,
        args: [w.id, w.dedupe, w.jenis, w.siswa, w.nomor, w.pesan, w.status, w.sent_at],
      });
    } catch (err: any) {
      console.log("Error insert WA:", err.message);
    }
  }
  console.log("Notifikasi WhatsApp berhasil diselaraskan.");

  // ==========================================
  // 5. NOTIFIKASI TELEGRAM
  // ==========================================
  console.log("\n[5/5] Menyiapkan data Notifikasi Telegram Broadcast...");
  const telegramRows = [
    {
      id: "tg_001",
      kejadian: "Presensi Harian",
      isi: "📢 [REKAP PRESENSI HARIAN] 24 Nov 2026\nTotal Siswa Hadir: 102/104 (98.1%)\nTepat Waktu: 94 Siswa\nTerlambat: 8 Siswa\nSakit/Izin: 2 Siswa\nGuru Hadir: 16/16 (100%)\nStatus Operasional Gerbang: NORMAL.",
      status: "Terkirim",
      sent_at: "2026-11-24 07:30:00",
    },
    {
      id: "tg_002",
      kejadian: "Keamanan Sistem",
      isi: "🛡️ [GATE SCANNER ONLINE] Terminal Gerbang Utama (Timur) berhasil sinkronisasi 1350 catatan kehadiran ke Cloud LibSQL. Latensi rata-rata: 42ms.",
      status: "Terkirim",
      sent_at: "2026-11-24 06:30:00",
    },
    {
      id: "tg_003",
      kejadian: "Keuangan Sekolah",
      isi: "💰 [PENERIMAAN KEUANGAN] Penerimaan pembayaran SPP & Tagihan Siswa per 24 Nov 2026 tercatat sebesar Rp 18.250.000 dari 25 transaksi.",
      status: "Terkirim",
      sent_at: "2026-11-24 14:00:00",
    },
    {
      id: "tg_004",
      kejadian: "Backup & Integritas",
      isi: "💾 [AUTOMATED BACKUP] Snapshot harian database SPPG berhasil disimpan ke cold storage terenkripsi AES-256. Integritas data: 100% Terverifikasi.",
      status: "Terkirim",
      sent_at: "2026-11-24 02:00:00",
    },
  ];

  for (const tg of telegramRows) {
    try {
      await client.execute({
        sql: `INSERT OR REPLACE INTO notifikasi_telegram
              (id_notifikasi, kejadian, isi_pesan, status, attempt_count, sent_at, created_at)
              VALUES (?, ?, ?, ?, 1, ?, '2026-11-24 06:00:00')`,
        args: [tg.id, tg.kejadian, tg.isi, tg.status, tg.sent_at],
      });
    } catch (err: any) {
      console.log("Error insert Telegram:", err.message);
    }
  }
  console.log("Notifikasi Telegram berhasil diisi.");

  console.log("\n=== Seluruh Data Sampel Promosi Berhasil Ditanam! ===");
  client.close();
}

main().catch(console.error);
