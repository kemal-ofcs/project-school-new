-- Data uji reimbursement (HRIS Fase 8c). Dipakai SAMA oleh
-- `services/hr-reimburse.test.ts` dan `mod tests` di `desktop/hr_reimburse.rs`.
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, unit) VALUES ('rb-g1', 'K101', 'Ani Guru', 'Guru', 1, 'SD');
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, unit) VALUES ('rb-ks', 'K102', 'Kepala SD', 'Guru', 1, 'SD');
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, unit) VALUES ('rb-kp', 'K103', 'Kepala SMP', 'Guru', 1, 'SMP');
INSERT INTO hr_reimburse_jenis (id_jenis, nama, wajib_nota, batas_bulanan) VALUES ('rmj-uji', 'Uji Batas', 1, 200000);
