-- Data uji berkas transfer (HRIS Fase 8a). Dipakai SAMA oleh
-- `services/transfer.test.ts` dan `mod tests` di `desktop/transfer.rs`.
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift) VALUES ('tr-p1', 'K001', 'Ani Guru', 'Guru', 1);
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift, id_keluar) VALUES ('tr-p2', 'K002', 'Budi Staf', 'Tata Usaha', 1, 'klr-uji');
INSERT INTO master_data (id_unik, kode_karyawan, nama, divisi, id_shift) VALUES ('tr-p3', 'K003', 'Cici Tendik', 'Tata Usaha', 1);
INSERT INTO hr_profil (id_karyawan, bank, no_rekening, nama_rekening) VALUES ('tr-p1', 'BCA', '1111111111', 'Ani Guru');
INSERT INTO hr_profil (id_karyawan, bank, no_rekening, nama_rekening) VALUES ('tr-p2', ' bank  mandiri ', '2222222222', 'budi staf');
INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by) VALUES ('run-draft', 'uji-draft', '2026-09-01', '2026-09-30', 'DRAFT', 'uji');
INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by) VALUES ('run-ok', 'uji-ok', '2026-10-01', '2026-10-31', 'APPROVED', 'uji');
INSERT INTO payroll_runs (id, idempotency_key, period_start, period_end, status, created_by) VALUES ('run-paid', 'uji-paid', '2026-08-01', '2026-08-31', 'PAID', 'uji');
INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES ('it-d1', 'run-draft', 'tr-p1', 'Ani Guru', 'Guru', 0, 0, 0, 0, 0, 0, 0, 5000000, '{}');
INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES ('it-o1', 'run-ok', 'tr-p1', 'Ani Guru', 'Guru', 0, 0, 0, 0, 0, 0, 0, 5000000, '{}');
INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES ('it-o2', 'run-ok', 'tr-p2', 'Budi Staf', 'Tata Usaha', 0, 0, 0, 0, 0, 0, 0, 2500000, '{}');
INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES ('it-o3', 'run-ok', 'tr-p3', 'Cici Tendik', 'Tata Usaha', 0, 0, 0, 0, 0, 0, 0, 1000000, '{}');
INSERT INTO payroll_items (id, payroll_run_id, id_karyawan, nama_karyawan, divisi, total_regular_hours, total_overtime_hours, total_overtime_index, rate_per_hour, basic_salary, overtime_salary, gross_salary, net_salary, breakdown_snapshot) VALUES ('it-p1', 'run-paid', 'tr-p1', 'Ani Guru', 'Guru', 0, 0, 0, 0, 0, 0, 0, 4000000, '{}');
