mod mobile;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    tauri::Builder::default()
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .build(),
            )?;
            // Storage Access Framework, hanya pada build Android.
            //
            // Ini yang membuat "Simpan cadangan" benar-benar sampai ke tangan
            // pengguna: sejak Android 10 (scoped storage) aplikasi tidak boleh
            // lagi menulis ke /storage/emulated/0/Download, sehingga berkas
            // cadangan tersimpan di folder privat dan tidak pernah ditemukan
            // siapa pun. Dengan SAF, penggunalah yang memilih tujuannya dan
            // izin diberikan per berkas — tanpa satu pun permission manifest.
            #[cfg(target_os = "android")]
            app.handle().plugin(tauri_plugin_android_fs::init())?;
            app.manage(mobile::MobileState::initialize(app.handle())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mobile::commands::desktop_get_session,
            mobile::commands::desktop_get_runtime_status,
            mobile::commands::desktop_get_bootstrap_status,
            mobile::commands::desktop_bootstrap_superadmin,
            mobile::commands::desktop_check_bootstrap_database,
            mobile::commands::desktop_link_bootstrap_database,
            mobile::commands::desktop_login,
            mobile::commands::desktop_logout,
            mobile::commands::desktop_password_reset_approve,
            mobile::commands::desktop_password_recovery_with_code,
            mobile::commands::desktop_password_reset_route,
            mobile::commands::desktop_list_password_reset_history,
            mobile::commands::desktop_get_password_reset_photo,
            mobile::commands::desktop_delete_password_reset_history,
            mobile::commands::desktop_purge_password_reset_history,
            mobile::commands::desktop_list_attendance_photos,
            mobile::commands::desktop_get_attendance_photo,
            mobile::commands::desktop_delete_attendance_photo,
            mobile::commands::desktop_purge_attendance_photos,
            mobile::commands::desktop_get_scan_security,
            mobile::commands::desktop_update_scan_security,
            mobile::commands::desktop_password_reset_lookup,
            mobile::commands::desktop_password_reset_confirm,
            mobile::commands::desktop_password_reset_swap_challenge,
            mobile::commands::desktop_password_reset_verify,
            mobile::commands::desktop_password_reset_inspect,
            mobile::commands::desktop_password_reset_complete,
            mobile::commands::desktop_send_test_mail,
            mobile::commands::desktop_get_mail_config,
            mobile::commands::desktop_save_mail_config,
            mobile::commands::desktop_get_two_factor_status,
            mobile::commands::desktop_issue_recovery_codes,
            mobile::commands::desktop_begin_two_factor_setup,
            mobile::commands::desktop_confirm_two_factor_setup,
            mobile::commands::desktop_disable_two_factor,
            mobile::commands::desktop_admin_disable_two_factor,
            mobile::commands::desktop_get_master_operators,
            mobile::commands::desktop_create_operator,
            mobile::commands::desktop_update_operator,
            mobile::commands::desktop_delete_operator,
            mobile::commands::desktop_get_roles,
            mobile::commands::desktop_create_role,
            mobile::commands::desktop_update_role,
            mobile::commands::desktop_set_role_permissions,
            mobile::commands::desktop_delete_role,
            mobile::commands::desktop_get_employees,
            mobile::commands::desktop_create_employee,
            mobile::commands::desktop_import_employees,
            mobile::commands::desktop_update_employee,
            mobile::commands::desktop_set_employee_status,
            mobile::commands::desktop_generate_employee_tokens,
            mobile::commands::desktop_get_shifts,
            mobile::commands::desktop_create_shift,
            mobile::commands::desktop_update_shift,
            mobile::commands::desktop_delete_shift,
            mobile::commands::desktop_submit_qr_scan,
            mobile::commands::desktop_get_corrections,
            mobile::commands::desktop_create_correction,
            mobile::commands::desktop_delete_correction,
            mobile::commands::desktop_update_attendance,
            mobile::commands::desktop_delete_attendance,
            mobile::commands::desktop_delete_log_scan,
            mobile::commands::desktop_delete_import_offline,
            mobile::commands::desktop_get_backups,
            mobile::commands::desktop_create_backup,
            mobile::commands::desktop_cancel_backup,
            mobile::commands::desktop_get_imports,
            mobile::commands::desktop_import_offline,
            mobile::commands::desktop_get_dashboard_data,
            mobile::commands::desktop_get_id_cards,
            mobile::commands::desktop_update_id_card,
            mobile::commands::desktop_get_id_card_template,
            mobile::commands::desktop_save_id_card_template,
            mobile::commands::desktop_force_resync_settings,
            mobile::commands::desktop_debug_template_sync,
            mobile::commands::desktop_get_geofence_settings,
            mobile::commands::desktop_update_geofence_settings,
            mobile::commands::desktop_get_scanner_settings,
            mobile::commands::desktop_update_scanner_settings,
            mobile::commands::desktop_get_app_display_name,
            mobile::commands::desktop_update_app_display_name,
            mobile::commands::desktop_get_sync_status,
            mobile::commands::desktop_sync_now,
            mobile::commands::desktop_get_sync_conflicts,
            mobile::commands::desktop_retry_failed_sync,
            mobile::commands::desktop_resolve_sync_conflicts,
            mobile::commands::desktop_resolve_sync_conflicts_local,
            mobile::commands::desktop_clear_failed_sync,
            mobile::commands::desktop_export_database,
            mobile::commands::desktop_import_database,
            mobile::commands::desktop_import_database_bytes,
            mobile::commands::desktop_get_data_folder,
            mobile::commands::desktop_save_file,
            mobile::share::desktop_share_file,
            mobile::share::mobile_export_database_to_device,
            mobile::commands::desktop_get_holidays,
            mobile::commands::desktop_get_holiday_whitelist,
            mobile::commands::desktop_create_holiday_whitelist,
            mobile::commands::desktop_update_holiday_whitelist,
            mobile::commands::desktop_delete_holiday_whitelist,
            mobile::commands::desktop_create_holiday,
            mobile::commands::desktop_update_holiday,
            mobile::commands::desktop_delete_holiday,
            mobile::commands::desktop_get_alfa_settings,
            mobile::commands::desktop_save_alfa_settings,
            mobile::commands::desktop_trigger_generate_alfa,
            mobile::commands::desktop_get_attendance_audit,
            // Dasbor Audit Kehadiran ikut ke Mobile karena ia BENAR-BENAR
            // offline: `get_attendance_dashboard_metrics` membaca SQLite lokal,
            // dan keenam tabel yang dibacanya (`absensi_harian`, `master_data`,
            // `siswa_data`, `akademik_rombel`, `presensi_mapel`,
            // `presensi_mapel_detail`) ada di `SNAPSHOT_TABLES` sehingga
            // datanya sudah tersedia di perangkat. Ini juga fitur Fase 4 yang
            // paling berguna di genggaman: kepala sekolah bisa melihat rekap
            // pagi itu tanpa membuka laptop.
            //
            // Bimbingan Konseling dan tinjauan antrean WhatsApp SENGAJA tidak
            // ikut — lihat catatan di gateway masing-masing.
            mobile::commands::desktop_get_attendance_dashboard_metrics,
            // Bimbingan Konseling: murni cloud (`bk_kasus`/`bk_sesi` tidak
            // pernah ada di SQLite lokal), jadi tidak menyentuh outbox maupun
            // SNAPSHOT_TABLES. Halamannya WAJIB mengatakan saat jaringan mati.
            mobile::commands::desktop_list_counseling_cases,
            mobile::commands::desktop_get_counseling_case,
            mobile::commands::desktop_create_counseling_case,
            mobile::commands::desktop_update_counseling_case,
            mobile::commands::desktop_add_counseling_session,
            mobile::commands::desktop_delete_counseling_case,
            mobile::commands::desktop_delete_counseling_session,
            // Tinjauan antrean WhatsApp: command khusus Mobile yang membaca CLOUD.
            // Membaca `notifikasi_wa` LOKAL akan selalu kosong di perangkat yang
            // bukan terminal pemindai — lihat `wa_review.rs`.
            mobile::wa_review::mobile_list_wa_notifications,
            mobile::commands::desktop_get_server_url,
            mobile::commands::desktop_set_server_url,
            mobile::commands::desktop_get_turso_url,
            mobile::commands::desktop_get_database_config,
            mobile::commands::desktop_save_turso_config,
            mobile::commands::desktop_test_turso_connection,
            mobile::commands::desktop_clear_turso_config,
            mobile::commands::desktop_get_company_profile,
            mobile::commands::desktop_update_company_profile,
            mobile::payroll::mobile_get_my_payroll_slips,
            mobile::payroll::mobile_get_payroll_slip_detail,
            mobile::payroll::mobile_get_payroll_recap,
            mobile::payroll::mobile_get_employee_payroll_estimate,
            mobile::commands::desktop_get_academic_years,
            mobile::commands::desktop_save_academic_year,
            mobile::commands::desktop_delete_academic_year,
            mobile::commands::desktop_set_active_academic_year,
            mobile::commands::desktop_get_academic_departments,
            mobile::commands::desktop_save_academic_department,
            mobile::commands::desktop_delete_academic_department,
            mobile::commands::desktop_get_academic_classes,
            mobile::commands::desktop_save_academic_class,
            mobile::commands::desktop_delete_academic_class,
            mobile::commands::desktop_get_academic_subjects,
            mobile::commands::desktop_save_academic_subject,
            mobile::commands::desktop_delete_academic_subject,
            mobile::commands::desktop_get_academic_assignments,
            mobile::commands::desktop_save_academic_assignment,
            mobile::commands::desktop_delete_academic_assignment,
            mobile::commands::desktop_get_teachers,
            mobile::commands::desktop_save_teacher,
            mobile::commands::desktop_delete_teacher,
            mobile::commands::desktop_get_students,
            mobile::commands::desktop_save_student,
            mobile::commands::desktop_delete_student,
            mobile::commands::desktop_get_class_attendance_sessions,
            mobile::commands::desktop_get_class_attendance_detail,
            mobile::commands::desktop_get_roster_for_attendance,
            mobile::commands::desktop_save_class_attendance,
            mobile::commands::desktop_delete_class_attendance,
            mobile::commands::desktop_get_attendance_reconciliation,
            mobile::commands::desktop_get_teaching_journal,
            mobile::commands::desktop_list_teaching_journals,
            mobile::commands::desktop_save_teaching_journal,
            mobile::commands::desktop_delete_teaching_journal,
            mobile::commands::desktop_get_ledger_preview,
            mobile::commands::desktop_freeze_attendance_ledger,
            mobile::commands::desktop_get_frozen_ledger,
            mobile::commands::desktop_delete_frozen_ledger,
            mobile::commands::desktop_backfill_id_cards,
            mobile::commands::desktop_save_student_photo,
            mobile::commands::desktop_get_student_photo,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            eprintln!("Aplikasi Mobile berhenti karena runtime Tauri gagal: {error}");
            std::process::exit(1);
        });
}
