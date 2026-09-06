# Modul Logika Bisnis & Penanganan Edge-Cases Operasional

Dokumen ini mendokumentasikan aturan logika bisnis, penanganan shift malam lintas hari, proteksi hasil koreksi admin, anti-double scan, otomasi Auto-Alfa, dan penegakan geofence.

---

## 1. Shift Malam Lintas Tengah Malam (Cross-Midnight Shifts)

### Aturan Penetapan Tanggal Kerja:
- Karyawan yang bekerja pada shift malam (misalnya Masuk: 22:00, Pulang: 06:00 keesokan harinya) dicatat dengan **tanggal kerja resmi mengikuti tanggal saat sesi masuk dimulai**.
- Saat scan pulang dilakukan setelah jam 00:00 (dini hari), sistem wajib merekonsiliasi scan tersebut ke sesi kerja H-1 yang belum tertutup.
- Buffer waktu toleransi shift malam diperhitungkan agar keterlambatan scan pulang tidak dianggap sebagai scan masuk baru untuk hari berikutnya.

---

## 2. Otomasi Generate Alfa (Auto-Alfa Runner)

### Mekanisme Eksekusi 2-Tier:
- Eksekusi pembuatan absensi Alfa harian dijalankan otomatis di klien melalui `AutoAlfaRunner` setiap 5 menit.
- **Kondisi Pengecualian Alfa:**
  - Hari libur nasional yang tercatat di `tbl_hari_libur`.
  - Karyawan yang sudah memiliki catatan hadir, izin, cuti, atau sakit pada tanggal tersebut.
- **Shift fleksibel BUKAN pengecualian.** Shift 00:00-23:59 tetap di-Alfa-kan,
  hanya jendelanya yang berbeda: kewajibannya berakhir bersama hari kalender
  (`END_OF_DAY_MINUTE` = 1439), sehingga tanggal kerja yang dinilai adalah H-1
  selama hari berjalan belum habis — persis pola shift malam yang diselesaikan
  pagi harinya. `offset_generate_alfa` menjadi jeda setelah tengah malam
  sebelum Alfa dibuat. Bebas absen jam berapa saja bukan berarti bebas tidak
  absen.
- **Pendaftaran Outbox Wajib:**
  - Setiap row Alfa baru yang dibuat di database SQLite lokal WAJIB langsung didaftarkan ke `desktop_sync_outbox` dengan route kanonik `attendance/create` (operasi `create`).
  - Hal ini menjamin record Alfa otomatis di-push ke Turso Cloud dan terdistribusi ke semua terminal lainnya.

---

## 3. Perlindungan Record Hasil Koreksi Admin (Non-Overwritable)

### Masalah Historis:
- Sebelumnya, record absensi yang sudah dikoreksi manual oleh Administrator berpotensi tertimpa kembali secara tidak sengaja oleh event scanner kartu fisik.

### Guard Perlindungan:
- Setiap row di `absensi_harian` yang berstatus `is_koreksi = 1` atau berasal dari `koreksi_admin` diperlakukan sebagai **Protected Resource**.
- Fungsi scanner kartu fisik DILARANG mengubah status, jam masuk, atau jam pulang pada record yang berstatus koreksi admin, kecuali dilakukan koreksi ulang secara eksplisit oleh admin.

---

## 4. Anti-Double Scan & Cooldown Penegakan Backend

### Aturan Cooldown:
- Validasi cooldown (`anti_double_scan_seconds`, default 60 detik) ditegakkan di **Backend Rust & Server Handler**, bukan hanya di level UI React.
- **Multi-Session Safety:**
  - Scan kedua dalam rentang jam shift diinterpretasikan sebagai **Scan Pulang**.
  - Scan ketiga setelah sesi masuk-pulang selesai ditolak secara fail-closed, KECUALI shift target secara eksplisit mengizinkan `multi_session = 1`.

---

## 5. Penegakan Geofence Presisi Meter & Audit Logging

### Aturan Geofencing:
1. Perhitungan jarak antara posisi karyawan dan titik kantor menggunakan **Formula Haversine Bola Bumi** dengan presisi satuan meter.
2. **Kondisi Kegagalan Geofence (Di Luar Radius / GPS Mati):**
   - Tolak scan absensi dengan pesan ramah.
   - **TETAP CATAT** event penolakan ke tabel `log_scan` untuk keperluan audit keamanan dan transparansi.
   - **DILARANG** membuat row di tabel `absensi_harian` jika validasi geofence gagal.
