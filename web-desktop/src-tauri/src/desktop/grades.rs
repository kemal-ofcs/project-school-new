use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};

use super::{
    config::DesktopState,
    models::CommandError,
    nilai_akhir::{self, JENIS_EFEKTIF_SQL},
    storage, sync,
};

/// Modul nilai akademik (v28).
///
/// Kedua tabelnya IKUT SINKRONISASI dan melewati outbox, jadi setiap penulisan
/// di sini mengikuti pola `class_attendance.rs`: tulis ke SQLite lokal dan
/// daftarkan event outbox-nya di dalam SATU transaksi. Menulis lokal tanpa
/// event berarti nilai yang hanya ada di satu perangkat; mendaftarkan event
/// tanpa tulisan lokal berarti guru tidak melihat apa yang baru ia simpan.
///
/// Yang paling mudah salah di modul ini: `skor` NULL berarti BELUM DINILAI,
/// bukan nol. Tidak ada satu pun `unwrap_or(0.0)` di berkas ini, dan tidak
/// boleh ada.

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("").trim()
}

fn optional_text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|teks| !teks.is_empty())
        .map(str::to_owned)
}

fn integer(value: &Value, key: &str, fallback: i64) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(fallback)
}

/// Id baris: `<prefix><epoch detik>-<48 bit acak>`.
///
/// Bagian acaknya yang menjamin keunikan. Id epoch telanjang sudah pernah
/// bertabrakan di repo ini, di dalam satu penyimpanan massal — dan penilaian
/// satu kelas disimpan persis seperti itu, tiga puluh baris sekaligus.
fn new_grade_id(prefix: &str) -> String {
    let mut bytes = [0u8; 6];
    rand_core::RngCore::fill_bytes(&mut rand_core::OsRng, &mut bytes);
    format!(
        "{prefix}{}-{}",
        storage::now_epoch_seconds(),
        hex::encode(bytes)
    )
}

/// Stempel waktu dari SQLite, bukan dari jam proses.
///
/// Baris yang sama bisa ditulis Rust di satu perangkat dan dibaca TypeScript di
/// perangkat lain; dua sumber jam menghasilkan urutan yang tidak bisa dipercaya.
fn sqlite_now(transaction: &rusqlite::Transaction<'_>) -> String {
    transaction
        .query_row("SELECT datetime('now');", [], |row| row.get::<_, String>(0))
        .unwrap_or_default()
}

const JENIS_PENILAIAN: &[&str] = &["Tugas", "Ulangan Harian", "Praktik", "UTS", "UAS"];

/// Jenis penilaian ditolak bila asing, TIDAK dinormalkan menjadi nilai bawaan.
///
/// Pelajaran `class_status` dan `notifikasi_wa`: menormalkan nilai asing
/// mengubah bug klien menjadi baris yang salah tanpa jejak bahwa ada yang
/// keliru. Di sini akibatnya lebih jauh lagi — CHECK constraint cloud akan
/// menolaknya saat push, dan event-nya berhenti di `failed` dengan
/// `next_retry_at = NULL`, hilang tanpa jalan pulih dari UI.
fn jenis_penilaian(raw: &str) -> Result<&str, CommandError> {
    JENIS_PENILAIAN
        .iter()
        .find(|jenis| **jenis == raw)
        .copied()
        .ok_or_else(|| {
            CommandError::new(
                "VALIDATION_ERROR",
                format!(
                    "Jenis penilaian '{raw}' tidak dikenal. Gunakan salah satu dari: {}.",
                    JENIS_PENILAIAN.join(", ")
                ),
            )
        })
}

/// Nilai saringan jenis: nama jenis lama diterjemahkan ke id bawaannya, id
/// jenis (`jns-...`) diterima apa adanya, selain itu DITOLAK. Cermin
/// `jenisSaringan` di `services/grades.ts`.
fn jenis_saringan(raw: &str) -> Result<String, CommandError> {
    if raw.starts_with("jns-") {
        return Ok(raw.to_owned());
    }
    let jenis = jenis_penilaian(raw)?;
    nilai_akhir::id_jenis_efektif(None, jenis).ok_or_else(CommandError::internal)
}

fn semester(raw: &str) -> Result<&str, CommandError> {
    match raw {
        "Ganjil" => Ok("Ganjil"),
        "Genap" => Ok("Genap"),
        other => Err(CommandError::new(
            "VALIDATION_ERROR",
            format!("Semester '{other}' tidak dikenal. Gunakan Ganjil atau Genap."),
        )),
    }
}

/// Daftar penilaian satu semester, disaring rombel, mapel, dan jenis.
///
/// `AVG(skor)` mengabaikan NULL dengan sendirinya — itulah yang diinginkan:
/// rata-rata dihitung dari anak yang SUDAH dinilai, bukan dari seluruh roster
/// dengan nol untuk yang belum. `jumlah_dinilai` dan `jumlah_siswa` dipisah
/// supaya guru bisa melihat berapa yang masih kosong.
///
/// Rombel kosong berarti SEMUA rombel; karena itu `nama_rombel` ikut dibawa,
/// supaya halamannya bisa menampilkan kolom Kelas.
pub fn list_assessments(
    state: &DesktopState,
    id_tahun_ajaran: &str,
    semester_filter: &str,
    id_rombel: Option<&str>,
    id_mapel: Option<&str>,
    jenis: Option<&str>,
) -> Result<Value, CommandError> {
    let (sql, args) =
        assessment_list_query(id_tahun_ajaran, semester_filter, id_rombel, id_mapel, jenis)?;
    let conn = storage::database(&state.data_dir)?;

    let mut stmt = conn.prepare(&sql).map_err(|e| {
        CommandError::new("DB_ERROR", format!("Gagal menyiapkan daftar nilai: {e}"))
    })?;

    let rows: Vec<Value> = stmt
        .query_map(rusqlite::params_from_iter(args.iter()), |row| {
            Ok(json!({
                "id_penilaian": row.get::<_, String>(0)?,
                "id_tahun_ajaran": row.get::<_, String>(1)?,
                "semester": row.get::<_, String>(2)?,
                "id_rombel": row.get::<_, String>(3)?,
                "id_mapel": row.get::<_, String>(4)?,
                "id_guru": row.get::<_, String>(5)?,
                "jenis": row.get::<_, String>(6)?,
                "nama_penilaian": row.get::<_, String>(7)?,
                "tanggal": row.get::<_, String>(8)?,
                "bobot": row.get::<_, i64>(9)?,
                "kkm": row.get::<_, i64>(10)?,
                "nilai_maks": row.get::<_, i64>(11)?,
                "catatan": row.get::<_, Option<String>>(12)?,
                "created_at": row.get::<_, String>(13)?,
                "updated_at": row.get::<_, String>(14)?,
                "nama_mapel": row.get::<_, String>(15)?,
                "nama_rombel": row.get::<_, String>(16)?,
                "jumlah_siswa": row.get::<_, i64>(17)?,
                "jumlah_dinilai": row.get::<_, i64>(18)?,
                // `Option<f64>`: NULL berarti belum ada satu pun skor, bukan nol.
                "rata_rata": row.get::<_, Option<f64>>(19)?,
                "id_jenis": row.get::<_, Option<String>>(20)?,
                "nama_jenis": row.get::<_, String>(21)?,
            }))
        })
        .map_err(|_| CommandError::internal())?
        .filter_map(Result::ok)
        .collect();

    Ok(json!({ "items": rows }))
}

/// SQL + argumen `list_assessments`. Cerminan `listAssessments` di
/// `services/grades.ts`: filter kosong diabaikan, jenis asing DITOLAK.
fn assessment_list_query(
    id_tahun_ajaran: &str,
    semester_filter: &str,
    id_rombel: Option<&str>,
    id_mapel: Option<&str>,
    jenis: Option<&str>,
) -> Result<(String, Vec<String>), CommandError> {
    let isi = |nilai: Option<&str>| {
        nilai
            .map(str::trim)
            .filter(|teks| !teks.is_empty())
            .map(str::to_owned)
    };

    let mut sql = format!(
        r#"
        SELECT p.id_penilaian, p.id_tahun_ajaran, p.semester, p.id_rombel,
               p.id_mapel, p.id_guru, p.jenis, p.nama_penilaian, p.tanggal,
               p.bobot, p.kkm, p.nilai_maks, p.catatan, p.created_at, p.updated_at,
               COALESCE(m.nama_mapel, '') AS nama_mapel,
               COALESCE(r.nama_rombel, '') AS nama_rombel,
               (SELECT COUNT(*) FROM nilai_siswa n WHERE n.id_penilaian = p.id_penilaian)
                 AS jumlah_siswa,
               (SELECT COUNT(*) FROM nilai_siswa n
                 WHERE n.id_penilaian = p.id_penilaian AND n.skor IS NOT NULL)
                 AS jumlah_dinilai,
               (SELECT AVG(n.skor) FROM nilai_siswa n
                 WHERE n.id_penilaian = p.id_penilaian AND n.skor IS NOT NULL)
                 AS rata_rata,
               {JENIS_EFEKTIF_SQL} AS id_jenis,
               COALESCE(j.nama, p.jenis) AS nama_jenis
          FROM nilai_penilaian p
          LEFT JOIN akademik_mapel m ON m.id_mapel = p.id_mapel
          LEFT JOIN akademik_rombel r ON r.id_rombel = p.id_rombel
          LEFT JOIN nilai_jenis j ON j.id_jenis = {JENIS_EFEKTIF_SQL}
         WHERE p.id_tahun_ajaran = ? AND p.semester = ?
        "#
    );
    let mut args = vec![id_tahun_ajaran.to_owned(), semester_filter.to_owned()];

    if let Some(rombel) = isi(id_rombel) {
        sql.push_str(" AND p.id_rombel = ?");
        args.push(rombel);
    }
    if let Some(mapel) = isi(id_mapel) {
        sql.push_str(" AND p.id_mapel = ?");
        args.push(mapel);
    }
    if let Some(raw) = isi(jenis) {
        sql.push_str(&format!(" AND {JENIS_EFEKTIF_SQL} = ?"));
        args.push(jenis_saringan(&raw)?);
    }
    // Berbatas meski `nilai_penilaian` tumbuh per semester, bukan per hari:
    // tanpa rombel, satu semester seluruh sekolah bisa ribuan penilaian dan
    // halamannya merender semuanya sekaligus.
    sql.push_str(" ORDER BY p.tanggal DESC, p.created_at DESC LIMIT 300;");

    Ok((sql, args))
}

/// Satu penilaian beserta skor seluruh siswa rombelnya.
///
/// Roster diambil dari `siswa_data` dan di-LEFT JOIN ke `nilai_siswa`, bukan
/// sebaliknya: siswa yang belum punya baris nilai tetap harus muncul di layar
/// guru dengan kolom kosong. Mengambil dari `nilai_siswa` saja akan
/// menyembunyikan anak yang justru paling perlu dinilai.
pub fn get_assessment(state: &DesktopState, id_penilaian: &str) -> Result<Value, CommandError> {
    let conn = storage::database(&state.data_dir)?;

    let penilaian: Option<Value> = conn
        .query_row(
            &format!(
                r#"SELECT p.id_penilaian, p.id_tahun_ajaran, p.semester, p.id_rombel,
                      p.id_mapel, p.id_guru, p.jenis, p.nama_penilaian, p.tanggal,
                      p.bobot, p.kkm, p.nilai_maks, p.catatan,
                      COALESCE(m.nama_mapel, '') AS nama_mapel,
                      COALESCE(r.nama_rombel, '') AS nama_rombel,
                      {JENIS_EFEKTIF_SQL} AS id_jenis,
                      COALESCE(j.nama, p.jenis) AS nama_jenis
                 FROM nilai_penilaian p
                 LEFT JOIN akademik_mapel m ON m.id_mapel = p.id_mapel
                 LEFT JOIN akademik_rombel r ON r.id_rombel = p.id_rombel
                 LEFT JOIN nilai_jenis j ON j.id_jenis = {JENIS_EFEKTIF_SQL}
                WHERE p.id_penilaian = ?1
                LIMIT 1;"#
            ),
            params![id_penilaian],
            |row| {
                Ok(json!({
                    "id_penilaian": row.get::<_, String>(0)?,
                    "id_tahun_ajaran": row.get::<_, String>(1)?,
                    "semester": row.get::<_, String>(2)?,
                    "id_rombel": row.get::<_, String>(3)?,
                    "id_mapel": row.get::<_, String>(4)?,
                    "id_guru": row.get::<_, String>(5)?,
                    "jenis": row.get::<_, String>(6)?,
                    "nama_penilaian": row.get::<_, String>(7)?,
                    "tanggal": row.get::<_, String>(8)?,
                    "bobot": row.get::<_, i64>(9)?,
                    "kkm": row.get::<_, i64>(10)?,
                    "nilai_maks": row.get::<_, i64>(11)?,
                    "catatan": row.get::<_, Option<String>>(12)?,
                    "nama_mapel": row.get::<_, String>(13)?,
                    "nama_rombel": row.get::<_, String>(14)?,
                    "id_jenis": row.get::<_, Option<String>>(15)?,
                    "nama_jenis": row.get::<_, String>(16)?,
                }))
            },
        )
        .optional()
        .map_err(|_| CommandError::internal())?;

    let Some(penilaian) = penilaian else {
        return Err(CommandError::new("NOT_FOUND", "Penilaian tidak ditemukan."));
    };

    let id_rombel = penilaian
        .get("id_rombel")
        .and_then(Value::as_str)
        .unwrap_or("");

    let mut stmt = conn
        .prepare(
            r#"SELECT s.id_siswa, s.nama_lengkap, COALESCE(s.nis, '') AS nis,
                      n.id_nilai, n.skor, n.keterangan
                 FROM siswa_data s
                 LEFT JOIN nilai_siswa n
                        ON n.id_siswa = s.id_siswa AND n.id_penilaian = ?1
                WHERE s.id_rombel = ?2 AND s.status = 'Aktif'
             ORDER BY s.nama_lengkap ASC
                LIMIT 200;"#,
        )
        .map_err(|_| CommandError::internal())?;

    let items: Vec<Value> = stmt
        .query_map(params![id_penilaian, id_rombel], |row| {
            Ok(json!({
                "id_siswa": row.get::<_, String>(0)?,
                "nama_lengkap": row.get::<_, String>(1)?,
                "nis": row.get::<_, String>(2)?,
                "id_nilai": row.get::<_, Option<String>>(3)?,
                // NULL = belum dinilai. JANGAN diganti 0.
                "skor": row.get::<_, Option<f64>>(4)?,
                "keterangan": row.get::<_, Option<String>>(5)?,
            }))
        })
        .map_err(|_| CommandError::internal())?
        .filter_map(Result::ok)
        .collect();

    Ok(json!({ "penilaian": penilaian, "items": items }))
}

/// `(id_jenis, jenis warisan)` untuk penilaian yang disimpan.
///
/// Klien baru mengirim `id_jenis`; klien lama hanya `jenis`. Kolom `jenis`
/// tetap terisi nama yang lolos CHECK lama (`nilai_akhir::jenis_warisan`),
/// supaya perangkat yang belum diperbarui tetap menerima barisnya. Jenis
/// nonaktif ditolak, kecuali penilaian itu memang sudah memakainya.
fn jenis_untuk_simpan(
    tx: &rusqlite::Transaction<'_>,
    draft: &Value,
    id_penilaian: &str,
    is_new: bool,
) -> Result<(String, String), CommandError> {
    let Some(id_jenis) = optional_text(draft, "id_jenis") else {
        let jenis = jenis_penilaian(text(draft, "jenis"))?;
        let id = nilai_akhir::id_jenis_efektif(None, jenis).ok_or_else(CommandError::internal)?;
        return Ok((id, jenis.to_owned()));
    };
    let aktif: Option<i64> = tx
        .query_row(
            "SELECT is_aktif FROM nilai_jenis WHERE id_jenis = ?1;",
            params![id_jenis],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| CommandError::internal())?;
    let Some(aktif) = aktif else {
        return Err(CommandError::new(
            "VALIDATION_ERROR",
            "Jenis penilaian tidak ditemukan.",
        ));
    };
    if aktif != 1 {
        let tersimpan: Option<Option<String>> = if is_new {
            None
        } else {
            tx.query_row(
                &format!(
                    "SELECT {JENIS_EFEKTIF_SQL} FROM nilai_penilaian p WHERE p.id_penilaian = ?1;"
                ),
                params![id_penilaian],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| CommandError::internal())?
        };
        if tersimpan.flatten().as_deref() != Some(id_jenis.as_str()) {
            return Err(CommandError::new(
                "VALIDATION_ERROR",
                "Jenis penilaian ini nonaktif.",
            ));
        }
    }
    let jenis = nilai_akhir::jenis_warisan(&id_jenis);
    Ok((id_jenis, jenis))
}

/// Buat atau perbarui satu penilaian.
///
/// `kkm` hanya diambil dari draft saat penilaian BARU dibuat; pada pembaruan,
/// nilai yang sudah tersimpan dipertahankan. KKM yang diubah admin di tengah
/// semester tidak boleh mengubah penilaian yang sudah berlangsung dan sudah
/// dilihat orang tua — pola yang sama dengan `payroll_runs` yang menyimpan
/// tarif yang dipakainya.
pub fn save_assessment(state: &DesktopState, draft: &Value) -> Result<Value, CommandError> {
    let mut conn = storage::database(&state.data_dir)?;
    let tx = conn.transaction().map_err(|_| CommandError::internal())?;

    let now = sqlite_now(&tx);
    let is_new = text(draft, "id_penilaian").is_empty();
    let id_penilaian = if is_new {
        new_grade_id("nil-")
    } else {
        text(draft, "id_penilaian").to_owned()
    };

    let id_tahun_ajaran = text(draft, "id_tahun_ajaran");
    let semester_value = semester(text(draft, "semester"))?;
    let id_rombel = text(draft, "id_rombel");
    let id_mapel = text(draft, "id_mapel");
    let id_guru = text(draft, "id_guru");
    let (id_jenis, jenis) = jenis_untuk_simpan(&tx, draft, &id_penilaian, is_new)?;
    let nama_penilaian = text(draft, "nama_penilaian");
    let tanggal = text(draft, "tanggal");
    let catatan = optional_text(draft, "catatan");

    if id_tahun_ajaran.is_empty()
        || id_rombel.is_empty()
        || id_mapel.is_empty()
        || id_guru.is_empty()
        || nama_penilaian.is_empty()
        || tanggal.is_empty()
    {
        return Err(CommandError::new(
            "VALIDATION_ERROR",
            "Tahun ajaran, rombel, mata pelajaran, guru, nama penilaian, dan tanggal wajib diisi.",
        ));
    }

    let bobot = integer(draft, "bobot", 1).clamp(1, 100);
    let nilai_maks = integer(draft, "nilai_maks", 100).clamp(1, 1000);

    // Keunikan ditegakkan di APLIKASI, bukan lewat UNIQUE constraint. Tabel ini
    // melewati outbox: sebuah UNIQUE akan membuat push dari perangkat kedua
    // gagal PERMANEN dengan `next_retry_at = NULL`, dan nilainya hilang tanpa
    // jalan pulih dari UI. Aturan yang sama dengan `hari_libur_whitelist`.
    let bentrok: Option<String> = tx
        .query_row(
            r#"SELECT nama_penilaian FROM nilai_penilaian
                WHERE id_tahun_ajaran = ?1 AND semester = ?2 AND id_rombel = ?3
                  AND id_mapel = ?4 AND LOWER(TRIM(nama_penilaian)) = LOWER(TRIM(?5))
                  AND id_penilaian <> ?6
                LIMIT 1;"#,
            params![
                id_tahun_ajaran,
                semester_value,
                id_rombel,
                id_mapel,
                nama_penilaian,
                id_penilaian
            ],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| CommandError::internal())?;

    if let Some(nama) = bentrok {
        return Err(CommandError::new(
            "DUPLICATE_ASSESSMENT",
            format!(
                "Penilaian bernama '{nama}' sudah ada pada mata pelajaran dan rombel ini di semester yang sama."
            ),
        ));
    }

    // KKM dibekukan: draft hanya dipakai saat baris BARU dibuat.
    let kkm_tersimpan: Option<i64> = tx
        .query_row(
            "SELECT kkm FROM nilai_penilaian WHERE id_penilaian = ?1 LIMIT 1;",
            params![id_penilaian],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|_| CommandError::internal())?;

    let kkm = match kkm_tersimpan {
        Some(nilai) => nilai,
        None => {
            // Diambil dari mapelnya bila draft tidak menyebutkan, supaya guru
            // tidak perlu mengetik ulang angka yang sudah jadi kebijakan sekolah.
            let bawaan_mapel: Option<i64> = tx
                .query_row(
                    "SELECT kkm FROM akademik_mapel WHERE id_mapel = ?1 LIMIT 1;",
                    params![id_mapel],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|_| CommandError::internal())?;
            integer(draft, "kkm", bawaan_mapel.unwrap_or(75)).clamp(0, 100)
        }
    };

    let created_at: String = if is_new {
        now.clone()
    } else {
        tx.query_row(
            "SELECT created_at FROM nilai_penilaian WHERE id_penilaian = ?1 LIMIT 1;",
            params![id_penilaian],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| CommandError::internal())?
        .unwrap_or_else(|| now.clone())
    };

    tx.execute(
        r#"
        INSERT INTO nilai_penilaian (
            id_penilaian, id_tahun_ajaran, semester, id_rombel, id_mapel, id_guru,
            jenis, nama_penilaian, tanggal, bobot, kkm, nilai_maks, catatan,
            created_at, updated_at, id_jenis
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(id_penilaian) DO UPDATE SET
            id_jenis = excluded.id_jenis,
            id_tahun_ajaran = excluded.id_tahun_ajaran,
            semester = excluded.semester,
            id_rombel = excluded.id_rombel,
            id_mapel = excluded.id_mapel,
            id_guru = excluded.id_guru,
            jenis = excluded.jenis,
            nama_penilaian = excluded.nama_penilaian,
            tanggal = excluded.tanggal,
            bobot = excluded.bobot,
            nilai_maks = excluded.nilai_maks,
            catatan = excluded.catatan,
            updated_at = excluded.updated_at;
        "#,
        params![
            id_penilaian,
            id_tahun_ajaran,
            semester_value,
            id_rombel,
            id_mapel,
            id_guru,
            jenis,
            nama_penilaian,
            tanggal,
            bobot,
            kkm,
            nilai_maks,
            catatan,
            created_at,
            now,
            id_jenis,
        ],
    )
    .map_err(|e| CommandError::new("DB_ERROR", format!("Gagal menyimpan penilaian: {e}")))?;

    let client_id = sync::ensure_client_id(state)?;
    let payload = json!({
        "id_penilaian": id_penilaian,
        "id_tahun_ajaran": id_tahun_ajaran,
        "semester": semester_value,
        "id_rombel": id_rombel,
        "id_mapel": id_mapel,
        "id_guru": id_guru,
        "jenis": jenis,
        "id_jenis": id_jenis,
        "nama_penilaian": nama_penilaian,
        "tanggal": tanggal,
        "bobot": bobot,
        "kkm": kkm,
        "nilai_maks": nilai_maks,
        "catatan": catatan,
        "created_at": created_at,
        "updated_at": now,
    });

    sync::enqueue(
        &tx,
        &client_id,
        "grade",
        if is_new { "create" } else { "update" },
        &id_penilaian,
        &payload,
        None,
    )?;

    tx.commit().map_err(|_| CommandError::internal())?;
    Ok(json!({ "sukses": true, "id_penilaian": id_penilaian }))
}

/// Simpan skor satu kelas sekaligus.
///
/// Seluruhnya dalam SATU transaksi: kegagalan di tengah tidak boleh
/// meninggalkan separuh kelas tersimpan dan separuhnya tidak, karena guru tidak
/// punya cara mengetahui mana yang sudah masuk.
///
/// Skor yang dikirim sebagai `null` DISIMPAN sebagai NULL, bukan dilewati dan
/// bukan diubah menjadi nol. Guru yang mengosongkan kembali sebuah nilai berhak
/// mengembalikan anak itu ke keadaan "belum dinilai".
pub fn save_scores(state: &DesktopState, draft: &Value) -> Result<Value, CommandError> {
    let mut conn = storage::database(&state.data_dir)?;
    let tx = conn.transaction().map_err(|_| CommandError::internal())?;

    let now = sqlite_now(&tx);
    let id_penilaian = text(draft, "id_penilaian");
    if id_penilaian.is_empty() {
        return Err(CommandError::new(
            "VALIDATION_ERROR",
            "Penilaian wajib dipilih sebelum menyimpan nilai.",
        ));
    }

    let nilai_maks: i64 = tx
        .query_row(
            "SELECT nilai_maks FROM nilai_penilaian WHERE id_penilaian = ?1 LIMIT 1;",
            params![id_penilaian],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|_| CommandError::internal())?
        .ok_or_else(|| CommandError::new("NOT_FOUND", "Penilaian tidak ditemukan."))?;

    let items = draft
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let client_id = sync::ensure_client_id(state)?;
    let mut tersimpan = 0usize;

    for item in items {
        let id_siswa = text(&item, "id_siswa");
        if id_siswa.is_empty() {
            continue;
        }

        // `as_f64()` mengembalikan None untuk `null` DAN untuk nilai yang bukan
        // angka. Keduanya diperlakukan sebagai "belum dinilai" — yang benar,
        // karena satu-satunya cara menjadi dinilai adalah mengirim angka.
        let skor = item.get("skor").and_then(Value::as_f64);
        if let Some(nilai) = skor {
            if !nilai.is_finite() || nilai < 0.0 || nilai > nilai_maks as f64 {
                return Err(CommandError::new(
                    "VALIDATION_ERROR",
                    format!(
                        "Nilai {nilai} di luar rentang yang diizinkan (0 sampai {nilai_maks})."
                    ),
                ));
            }
        }
        let keterangan = optional_text(&item, "keterangan");

        let tersedia: Option<(String, String)> = tx
            .query_row(
                "SELECT id_nilai, created_at FROM nilai_siswa WHERE id_penilaian = ?1 AND id_siswa = ?2 LIMIT 1;",
                params![id_penilaian, id_siswa],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|_| CommandError::internal())?;

        let (id_nilai, created_at) = match tersedia {
            Some(ada) => ada,
            None => (new_grade_id("nis-"), now.clone()),
        };

        tx.execute(
            r#"
            INSERT INTO nilai_siswa (
                id_nilai, id_penilaian, id_siswa, skor, keterangan, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id_nilai) DO UPDATE SET
                skor = excluded.skor,
                keterangan = excluded.keterangan,
                updated_at = excluded.updated_at;
            "#,
            params![
                id_nilai,
                id_penilaian,
                id_siswa,
                skor,
                keterangan,
                created_at,
                now,
            ],
        )
        .map_err(|e| CommandError::new("DB_ERROR", format!("Gagal menyimpan nilai: {e}")))?;

        sync::enqueue(
            &tx,
            &client_id,
            "grade-detail",
            "save",
            &id_nilai,
            &json!({
                "id_nilai": id_nilai,
                "id_penilaian": id_penilaian,
                "id_siswa": id_siswa,
                "skor": skor,
                "keterangan": keterangan,
                "created_at": created_at,
                "updated_at": now,
            }),
            None,
        )?;

        tersimpan += 1;
    }

    tx.commit().map_err(|_| CommandError::internal())?;
    Ok(json!({ "sukses": true, "tersimpan": tersimpan }))
}

/// Hapus penilaian beserta seluruh nilainya.
///
/// Setiap detail yang dibuang mendapat event `grade-detail/delete` SENDIRI.
/// `nilai_siswa` disinkronkan dengan `delete_missing: false`, jadi tanpa event
/// itu barisnya tetap hidup di cloud dan tarikan berikutnya mengembalikannya ke
/// setiap perangkat — nilai tanpa penilaian induk, yang tidak akan pernah
/// terlihat siapa pun sampai rekapnya salah. Pelajaran `save_class_attendance`.
pub fn delete_assessment(state: &DesktopState, id_penilaian: &str) -> Result<Value, CommandError> {
    let mut conn = storage::database(&state.data_dir)?;
    let tx = conn.transaction().map_err(|_| CommandError::internal())?;

    let ada: Option<String> = tx
        .query_row(
            "SELECT id_penilaian FROM nilai_penilaian WHERE id_penilaian = ?1 LIMIT 1;",
            params![id_penilaian],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|_| CommandError::internal())?;

    if ada.is_none() {
        return Err(CommandError::new("NOT_FOUND", "Penilaian tidak ditemukan."));
    }

    let client_id = sync::ensure_client_id(state)?;

    let detail: Vec<(String, String)> = {
        let mut stmt = tx
            .prepare("SELECT id_nilai, id_siswa FROM nilai_siswa WHERE id_penilaian = ?1;")
            .map_err(|_| CommandError::internal())?;
        let rows = stmt
            .query_map(params![id_penilaian], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|_| CommandError::internal())?
            .filter_map(Result::ok)
            .collect();
        rows
    };

    for (id_nilai, id_siswa) in detail {
        sync::enqueue(
            &tx,
            &client_id,
            "grade-detail",
            "delete",
            &id_nilai,
            &json!({
                "id_nilai": id_nilai,
                "id_penilaian": id_penilaian,
                "id_siswa": id_siswa,
            }),
            None,
        )?;
    }

    tx.execute(
        "DELETE FROM nilai_siswa WHERE id_penilaian = ?1;",
        params![id_penilaian],
    )
    .map_err(|_| CommandError::internal())?;
    tx.execute(
        "DELETE FROM nilai_penilaian WHERE id_penilaian = ?1;",
        params![id_penilaian],
    )
    .map_err(|_| CommandError::internal())?;

    sync::enqueue(
        &tx,
        &client_id,
        "grade",
        "delete",
        id_penilaian,
        &json!({ "id_penilaian": id_penilaian }),
        None,
    )?;

    tx.commit().map_err(|_| CommandError::internal())?;
    Ok(json!({ "sukses": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jenis_asing_ditolak_bukan_dinormalkan() {
        // Menormalkan nilai asing menjadi bawaan akan mengubah bug klien
        // menjadi baris yang salah tanpa jejak — dan CHECK constraint cloud
        // akan menolaknya saat push, menghentikan event-nya PERMANEN.
        assert!(jenis_penilaian("Kuis Dadakan").is_err());
        assert_eq!(jenis_penilaian("UTS").expect("UTS sah"), "UTS");
        assert_eq!(
            jenis_penilaian("Ulangan Harian").expect("UH sah"),
            "Ulangan Harian"
        );
    }

    #[test]
    fn semester_asing_ditolak() {
        assert!(semester("Pendek").is_err());
        assert_eq!(semester("Ganjil").expect("sah"), "Ganjil");
        assert_eq!(semester("Genap").expect("sah"), "Genap");
    }

    #[test]
    fn id_nilai_selalu_berbeda_meski_dibuat_beruntun() {
        // Penilaian satu kelas disimpan tiga puluh baris sekaligus; id epoch
        // telanjang sudah pernah bertabrakan persis pada pola itu.
        let ids: std::collections::HashSet<String> =
            (0..200).map(|_| new_grade_id("nis-")).collect();
        assert_eq!(ids.len(), 200, "id nilai bertabrakan dalam satu batch");
    }

    fn state_uji() -> (tempfile::TempDir, DesktopState) {
        let dir = tempfile::tempdir().expect("tempdir");
        storage::initialize(dir.path()).expect("skema lokal");
        let state = DesktopState {
            server_origin: std::sync::RwLock::new("http://localhost:3000".to_string()),
            offline_max_age_hours: 24,
            data_dir: dir.path().to_path_buf(),
            http: reqwest::Client::new(),
            turso_config: std::sync::RwLock::new(None),
            session: std::sync::Mutex::new(None),
            vault_lock: std::sync::Mutex::new(()),
        };
        (dir, state)
    }

    /// Vektor kembar: `listAssessments` di `services/grades.test.ts` memakai
    /// data dan harapan yang sama.
    #[test]
    fn daftar_penilaian_semua_rombel_dan_filter_jenis() {
        let (_dir, state) = state_uji();
        let conn = storage::database(&state.data_dir).expect("db");
        conn.execute_batch(
            r#"
            INSERT INTO akademik_rombel (id_rombel, id_tahun_ajaran, tingkat, nama_rombel)
            VALUES ('r7a', 'ta1', 7, 'VII A'), ('r7b', 'ta1', 7, 'VII B');
            INSERT INTO nilai_penilaian (id_penilaian, id_tahun_ajaran, semester, id_rombel,
              id_mapel, id_guru, jenis, nama_penilaian, tanggal, created_at, updated_at)
            VALUES
              ('p1', 'ta1', 'Ganjil', 'r7a', 'mtk', 'g', 'UTS', 'UTS MTK', '2026-09-01', 'x', 'x'),
              ('p2', 'ta1', 'Ganjil', 'r7b', 'mtk', 'g', 'Tugas', 'Tugas 1', '2026-09-02', 'x', 'x'),
              ('p3', 'ta1', 'Ganjil', 'r7b', 'ipa', 'g', 'UTS', 'UTS IPA', '2026-09-03', 'x', 'x'),
              ('p4', 'ta1', 'Genap', 'r7a', 'mtk', 'g', 'UTS', 'UTS Genap', '2026-09-04', 'x', 'x');
            "#,
        )
        .expect("seed");

        let ids = |rombel: Option<&str>, mapel: Option<&str>, jenis: Option<&str>| {
            let hasil =
                list_assessments(&state, "ta1", "Ganjil", rombel, mapel, jenis).expect("daftar");
            hasil["items"]
                .as_array()
                .expect("items")
                .iter()
                .map(|item| {
                    format!(
                        "{}:{}",
                        item["id_penilaian"].as_str().unwrap_or(""),
                        item["nama_rombel"].as_str().unwrap_or("")
                    )
                })
                .collect::<Vec<_>>()
        };

        assert_eq!(ids(None, None, None), ["p3:VII B", "p2:VII B", "p1:VII A"]);
        // String kosong = tanpa filter, sama dengan None.
        assert_eq!(ids(Some(" "), Some(""), Some("")), ids(None, None, None));
        assert_eq!(ids(Some("r7b"), None, None), ["p3:VII B", "p2:VII B"]);
        assert_eq!(ids(None, None, Some("UTS")), ["p3:VII B", "p1:VII A"]);
        assert_eq!(ids(Some("r7b"), Some("mtk"), Some("Tugas")), ["p2:VII B"]);

        let galat = list_assessments(&state, "ta1", "Ganjil", None, None, Some("Kuis"))
            .expect_err("jenis asing harus ditolak");
        assert_eq!(galat.code, "VALIDATION_ERROR");
    }
}
