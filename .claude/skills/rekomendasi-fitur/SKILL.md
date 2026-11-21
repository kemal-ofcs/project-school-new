---
name: rekomendasi-fitur
description: >-
  Analisis kritis aplikasi atau satu modul, lalu 3-5 rekomendasi fitur berbasis bukti, diurutkan dari
  quick win. Pakai untuk "rekomendasi fitur", "apa yang kurang", "fitur apa berikutnya", "evaluasi UX
  modul X", "analisa modul/aplikasi X". Bukan untuk bug (`debug-akar-masalah`), audit keamanan (`audit-lalu-perbaiki`), atau
  menulis spesifikasi (`susun-prd`).
---

# Rekomendasi Fitur

1. **Lingkup**: modul yang disebut saja. Seluruh aplikasi → peta dulu (`graphify query` atau daftar
   rute `src/app/`), bukan membaca semua berkas.
2. **Cari celah nyata**, masing-masing dengan bukti halaman/`file:baris`: langkah manual berulang,
   data dicatat tetapi tidak dipakai, jalan buntu tanpa tindak lanjut, perilaku beda antar
   platform, peran yang tidak terlayani (TU, guru, kepsek, bendahara, wali/siswa).
3. **Saring**: buang yang sudah ada, yang ditunda/ditolak di `MEMORY.md`, dan saran generik
   (chatbot AI, dark mode, "tambah dashboard").
4. **Keluaran** tabel, urut quick win → jangka panjang:
   `# | Masalah (bukti) | Manfaat | Effort | Dampak`.
   Effort: UI satu shell = Low; aturan kembar TS+Rust atau tabel tersinkron baru = Medium;
   izin baru + khusus cloud + lintas modul = High.
5. Tutup dengan satu baris: pilih nomor untuk dijadikan PRD (`susun-prd`). Tanpa kode, tanpa berkas.
