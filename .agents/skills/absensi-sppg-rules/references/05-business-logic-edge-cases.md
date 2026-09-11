# Modul Logika Bisnis & Penanganan Edge-Cases Operasional

Dokumen ini mendokumentasikan aturan logika bisnis, penanganan shift malam lintas hari, proteksi hasil koreksi admin, anti-double scan, otomasi Auto-Alfa, dan penegakan geofence.

---

## 1. Shift Malam Lintas Tengah Malam (Cross-Midnight Shifts)

### Aturan Penetapan Tanggal Kerja:
- Karyawan yang bekerja pada shift malam (misalnya Masuk: 22:00, Pulang: 06:00 keesokan harinya) dicatat dengan **tanggal kerja resmi mengikuti tanggal saat sesi masuk dimulai**.
- Saat scan pulang dilakukan setelah jam 00:00 (dini hari), sistem wajib merekonsiliasi scan tersebut ke sesi kerja H-1 yang belum tertutup.
- Buffer waktu toleransi shift malam diperhitungkan agar keterlambatan scan pulang tidak dianggap sebagai scan masuk baru untuk hari berikutnya.

### Jendela Scan Masuk & Jam Kerja (schema versi 21):
Jendelanya tersusun MUNDUR dari Jam Masuk (contoh 07:00, awal 120, batas 60, toleransi 30):

```
04:00 ─ Awal Absen Masuk ─ 06:00 ─ Tepat Waktu ─ 07:00 ─ Terlambat ─ 07:30
```

- **Tepat Waktu** = (Jam Masuk − Batas Masuk Tepat Waktu) s/d Jam Masuk.
- **Awal Absen Masuk** ("Datang Lebih Awal") dihitung mundur dari awal jendela Tepat Waktu; sebelum itu absen masih ditutup.
- **Terlambat** = setelah Jam Masuk s/d Jam Masuk + Toleransi, dan menitnya diukur dari Jam Masuk. Lewat dari itu scanner menolak dan karyawan menghubungi Admin/Operator — karena itu Koreksi Admin sengaja boleh mencatat jam masuk sampai sebelum Jam Pulang (`diDalamRentangKoreksiMasuk`), sedangkan import tetap memakai jendela scanner.
- **Jam Kerja Normal** = (Jam Pulang − Jam Masuk) − Istirahat.
- **Jam kerja aktual** dimulai dari max(scan masuk, Jam Masuk): datang awal tidak menambah jam kerja/lembur.
- **Istirahat** mulai pada Jam Masuk + Offset Potong Istirahat; pulang setelah titik itu dipotong istirahat PENUH, sebelumnya tidak dipotong.
- Rumusnya dieja sekali per bahasa dan diuji dengan vektor yang sama: `time-policy.ts` (`jendelaScanMasuk`, `hitungMenitKerjaPadaGarisWaktu`, `hitungUlangAbsensiDariJam`) dan `time_policy.rs` (`entry_window_offsets`, `calculate_work_on_timeline`, `recalculate_from_clock`). Seluruh jalur admin (koreksi, edit riwayat, import, hapus log, sync-push) WAJIB memanggil fungsi itu, bukan menghitung sendiri.

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
