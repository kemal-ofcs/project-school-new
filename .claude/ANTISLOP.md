# ANTISLOP.md — hasil antislop

- Waktu: 2026-10-23 06:55 WIB
- Commit: aa8e376 (+ 12 berkas berubah, belum commit)
- Berkas disunting: 0

## Disunting
(tidak ada berkas yang perlu disunting; komentar dan teks antarmuka sudah ringkas serta bebas AI-slop)

## Dilewati
- `mobile/src/lib/client/xlsx.ts` — salinan Mobile turunan yang dihasilkan `sync:mobile`
- `mobile/src/lib/client/xlsx.test.ts` — berkas tes dan salinan Mobile turunan
- `mobile/src/lib/validations/impor-dapodik.ts` — salinan Mobile turunan yang dihasilkan `sync:mobile`
- `mobile/src/lib/validations/impor-dapodik.test.ts` — berkas tes dan salinan Mobile turunan
- `mobile/src/components/siswa/DapodikSiswa.tsx` — salinan Mobile turunan via `sync-frontend-lib.ts`
- `web-desktop/src/lib/client/xlsx.test.ts` — berkas tes unit
- `web-desktop/src/lib/validations/impor-dapodik.test.ts` — berkas tes unit
- `web-desktop/src/lib/client/xlsx.ts` — komentar teknis CSV sudah ringkas dan sesuai standar
- `web-desktop/src/lib/validations/impor-dapodik.ts` — komentar dan pesan galat validasi sudah ringkas dan jelas
- `web-desktop/src/components/siswa/DapodikSiswa.tsx` — teks UI modal impor natural, penanda `shortcut:` terjaga
- `web-desktop/src/app/siswa/page.tsx` — komentar guard RBAC sudah ringkas
- `mobile/src/app/siswa/page.tsx` — penempatan tombol impor sudah bersih

## Perlu tindakan
- Jalankan `bun run sync:mobile` untuk memperbarui berkas turunan di workspace mobile.
- Samakan guard tombol impor di `mobile/src/app/siswa/page.tsx` dengan menambahkan `canLihatDapodik` bersama `canUbahDapodik` seperti di `web-desktop`.
