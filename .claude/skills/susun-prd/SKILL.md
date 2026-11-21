---
name: susun-prd
description: >-
  Ubah ide fitur menjadi PRD siap kerja, tanpa menulis kode. Pakai untuk "buat PRD", "spesifikasi",
  "rancang dulu fitur X", atau ide fitur besar yang belum punya rencana. Bukan untuk mengerjakan
  fitur (`kerjakan-fitur-lintas-platform`) atau mencari ide fitur (`rekomendasi-fitur`).
---

# Susun PRD

1. **Pahami dulu, tanpa kode.** Cek `MEMORY.md` (keputusan yang sudah ditutup tidak ditanya ulang),
   buka `references/` domain yang tersentuh (tabel di CLAUDE.md), dan telusuri kode secukupnya
   untuk temuan nyata `file:baris` (contoh pola: `prd-hris/fase-1.md` §19.1).
2. **Ambigu?** Maksimal 5 pertanyaan bernomor (`Q-1` …), masing-masing dengan rekomendasi, lalu
   berhenti. Lewati bila sudah jelas.
3. **Tulis** `prd-<topik>.md` di root. Fitur besar: induk + `prd-<topik>/fase-N.md` supaya satu sesi
   cukup membaca satu fase. Bagian:
   - Masalah dan tujuan · Keputusan pemilik (bertanggal)
   - Alur pengguna (per peran: admin TU, guru, kepsek, bendahara, wali/siswa, bila relevan)
   - Wajib ada (per fase bila besar) · Di luar cakupan
   - Kriteria penerimaan yang bisa diuji, sebut platform bila berbeda (Web/Desktop/Mobile)
   - Catatan teknis: tabel/kolom dan statusnya (tersinkron atau khusus cloud), izin baru vs
     `DEFAULT_ROLE_PERMISSIONS`, aturan yang dieja kembar TS ↔ Rust, invarian `references/` yang
     berlaku (dirujuk, tidak disalin)
   - Temuan dari kode · Urutan pengerjaan (langkah + kolom Gerbang: tes/audit bukti selesai) ·
     Pertanyaan terbuka
4. **Jawab di chat** cukup: tautan berkas, ringkasan 3 baris, pertanyaan terbuka.
