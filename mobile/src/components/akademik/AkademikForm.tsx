"use client";

import type {
  GuruMapelInput,
  JurusanInput,
  MapelInput,
  RombelInput,
  TahunAjaranInput,
} from "@/lib/gateways/academic";

/*
 * Formulir master akademik untuk Mobile — padanan modal formulir di
 * `web-desktop/src/app/akademik/page.tsx`. Sengaja di `components/`, bukan
 * `lib/`: `mobile/src/lib` adalah salinan hasil generate dari `web-desktop`.
 *
 * Isian angka disimpan sebagai string selama diketik (supaya kolom boleh
 * kosong sementara), lalu diubah dan divalidasi sekali di `toAcademicInput`.
 */

export type AcademicKind =
  | "tahun_ajaran"
  | "rombel"
  | "mapel"
  | "jurusan"
  | "penugasan";

export const KELOMPOK_MAPEL = [
  "Wajib",
  "Peminatan",
  "Muatan Lokal",
  "Kejuruan",
] as const;
type KelompokMapel = (typeof KELOMPOK_MAPEL)[number];

export type AcademicDraft =
  | {
      kind: "tahun_ajaran";
      id?: string;
      nama_tahun: string;
      semester: "Ganjil" | "Genap";
      tanggal_mulai: string;
      tanggal_selesai: string;
      is_aktif: number;
    }
  | {
      kind: "jurusan";
      id?: string;
      kode_jurusan: string;
      nama_jurusan: string;
      deskripsi: string;
      is_aktif: number;
    }
  | {
      kind: "rombel";
      id?: string;
      id_tahun_ajaran: string;
      tingkat: string;
      id_jurusan: string;
      nama_rombel: string;
      id_wali_kelas: string;
      kapasitas: string;
      ruang_kelas: string;
      is_aktif: number;
    }
  | {
      kind: "mapel";
      id?: string;
      kode_mapel: string;
      nama_mapel: string;
      /** Tidak ditampilkan di formulir (sama dengan Web); dipertahankan saat mengubah. */
      tingkat: number | null;
      kelompok: KelompokMapel;
      beban_jam: string;
      kkm: string;
      is_aktif: number;
    }
  | {
      kind: "penugasan";
      id_tahun_ajaran: string;
      id_rombel: string;
      id_mapel: string;
      id_guru: string;
    };

export const KIND_LABEL: Record<AcademicKind, string> = {
  tahun_ajaran: "Tahun Ajaran",
  rombel: "Rombel",
  mapel: "Mata Pelajaran",
  jurusan: "Jurusan",
  penugasan: "Penugasan Guru",
};

type AcademicInput =
  | { kind: "tahun_ajaran"; input: TahunAjaranInput }
  | { kind: "jurusan"; input: JurusanInput }
  | { kind: "rombel"; input: RombelInput }
  | { kind: "mapel"; input: MapelInput }
  | { kind: "penugasan"; input: GuruMapelInput };

function wholeNumberIn(value: string, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/** Validasi + konversi ke bentuk gateway. Mengembalikan pesan galat bila tidak sah. */
export function toAcademicInput(
  draft: AcademicDraft,
): AcademicInput | { error: string } {
  switch (draft.kind) {
    case "tahun_ajaran": {
      if (!draft.nama_tahun.trim())
        return { error: "Nama tahun ajaran wajib diisi." };
      if (!draft.tanggal_mulai || !draft.tanggal_selesai)
        return { error: "Tanggal mulai dan selesai wajib diisi." };
      if (draft.tanggal_mulai > draft.tanggal_selesai)
        return { error: "Tanggal mulai harus sebelum tanggal selesai." };
      return {
        kind: draft.kind,
        input: {
          id_tahun_ajaran: draft.id,
          nama_tahun: draft.nama_tahun.trim(),
          semester: draft.semester,
          tanggal_mulai: draft.tanggal_mulai,
          tanggal_selesai: draft.tanggal_selesai,
          is_aktif: draft.is_aktif,
        },
      };
    }
    case "jurusan": {
      if (!draft.kode_jurusan.trim() || !draft.nama_jurusan.trim())
        return { error: "Kode dan nama jurusan wajib diisi." };
      return {
        kind: draft.kind,
        input: {
          id_jurusan: draft.id,
          kode_jurusan: draft.kode_jurusan.trim().toUpperCase(),
          nama_jurusan: draft.nama_jurusan.trim(),
          deskripsi: draft.deskripsi.trim() || null,
          is_aktif: draft.is_aktif,
        },
      };
    }
    case "rombel": {
      if (!draft.id_tahun_ajaran)
        return { error: "Pilih tahun ajaran rombel ini." };
      if (!draft.nama_rombel.trim())
        return { error: "Nama rombel wajib diisi." };
      const kapasitas = wholeNumberIn(draft.kapasitas, 1, 60);
      if (kapasitas === null)
        return { error: "Kapasitas harus bilangan bulat 1–60." };
      return {
        kind: draft.kind,
        input: {
          id_rombel: draft.id,
          id_tahun_ajaran: draft.id_tahun_ajaran,
          tingkat: Number(draft.tingkat),
          id_jurusan: draft.id_jurusan || null,
          nama_rombel: draft.nama_rombel.trim(),
          id_wali_kelas: draft.id_wali_kelas || null,
          kapasitas,
          ruang_kelas: draft.ruang_kelas.trim() || null,
          is_aktif: draft.is_aktif,
        },
      };
    }
    case "mapel": {
      if (!draft.kode_mapel.trim() || !draft.nama_mapel.trim())
        return { error: "Kode dan nama mata pelajaran wajib diisi." };
      const bebanJam = wholeNumberIn(draft.beban_jam, 1, 10);
      if (bebanJam === null)
        return { error: "Beban jam harus bilangan bulat 1–10 JP." };
      const kkm = wholeNumberIn(draft.kkm, 50, 100);
      if (kkm === null) return { error: "KKM harus bilangan bulat 50–100." };
      return {
        kind: draft.kind,
        input: {
          id_mapel: draft.id,
          kode_mapel: draft.kode_mapel.trim().toUpperCase(),
          nama_mapel: draft.nama_mapel.trim(),
          tingkat: draft.tingkat,
          kelompok: draft.kelompok,
          beban_jam: bebanJam,
          kkm,
          is_aktif: draft.is_aktif,
        },
      };
    }
    case "penugasan": {
      if (
        !draft.id_tahun_ajaran ||
        !draft.id_rombel ||
        !draft.id_mapel ||
        !draft.id_guru
      )
        return { error: "Lengkapi rombel, mata pelajaran, dan guru." };
      return {
        kind: draft.kind,
        input: {
          id_tahun_ajaran: draft.id_tahun_ajaran,
          id_rombel: draft.id_rombel,
          id_mapel: draft.id_mapel,
          id_guru: draft.id_guru,
        },
      };
    }
  }
}

const INPUT =
  "min-h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-400 disabled:opacity-60";
const LABEL = "mb-1 block text-[11px] font-semibold text-slate-400";

type Rows = Record<string, unknown>[];

export interface AcademicFormOptions {
  tahunAjaran: Rows;
  jurusan: Rows;
  rombel: Rows;
  mapel: Rows;
  guru: Rows;
}

function ActiveToggle({
  id,
  checked,
  label,
  hint,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  hint: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-sky-500"
      />
      <span>
        <span className="block text-xs font-bold text-slate-200">{label}</span>
        <span className="block text-[10px] leading-4 text-slate-500">
          {hint}
        </span>
      </span>
    </label>
  );
}

export function AkademikFormFields({
  draft,
  options,
  onChange,
}: {
  draft: AcademicDraft;
  options: AcademicFormOptions;
  onChange: (draft: AcademicDraft) => void;
}) {
  switch (draft.kind) {
    case "tahun_ajaran":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ak-ta-nama" className={LABEL}>
                Tahun ajaran
              </label>
              <input
                id="ak-ta-nama"
                value={draft.nama_tahun}
                onChange={(e) =>
                  onChange({ ...draft, nama_tahun: e.target.value })
                }
                placeholder="2026/2027"
                required
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="ak-ta-semester" className={LABEL}>
                Semester
              </label>
              <select
                id="ak-ta-semester"
                value={draft.semester}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    semester: e.target.value === "Genap" ? "Genap" : "Ganjil",
                  })
                }
                className={INPUT}
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </div>
            <div>
              <label htmlFor="ak-ta-mulai" className={LABEL}>
                Mulai
              </label>
              <input
                id="ak-ta-mulai"
                type="date"
                value={draft.tanggal_mulai}
                onChange={(e) =>
                  onChange({ ...draft, tanggal_mulai: e.target.value })
                }
                required
                className={`${INPUT} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="ak-ta-selesai" className={LABEL}>
                Selesai
              </label>
              <input
                id="ak-ta-selesai"
                type="date"
                value={draft.tanggal_selesai}
                onChange={(e) =>
                  onChange({ ...draft, tanggal_selesai: e.target.value })
                }
                required
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>
          {draft.id ? null : (
            <ActiveToggle
              id="ak-ta-aktif"
              checked={draft.is_aktif === 1}
              label="Langsung jadikan tahun ajaran aktif"
              hint="Tahun ajaran aktif yang lama otomatis dinonaktifkan di semua perangkat. Biarkan mati bila Anda hanya menyiapkan tahun depan."
              onChange={(checked) =>
                onChange({ ...draft, is_aktif: checked ? 1 : 0 })
              }
            />
          )}
        </>
      );
    case "jurusan":
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="ak-jur-kode" className={LABEL}>
                Kode
              </label>
              <input
                id="ak-jur-kode"
                value={draft.kode_jurusan}
                onChange={(e) =>
                  onChange({ ...draft, kode_jurusan: e.target.value })
                }
                placeholder="TKJ"
                autoCapitalize="characters"
                required
                className={`${INPUT} font-mono uppercase`}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="ak-jur-nama" className={LABEL}>
                Nama jurusan
              </label>
              <input
                id="ak-jur-nama"
                value={draft.nama_jurusan}
                onChange={(e) =>
                  onChange({ ...draft, nama_jurusan: e.target.value })
                }
                required
                className={INPUT}
              />
            </div>
          </div>
          <div>
            <label htmlFor="ak-jur-deskripsi" className={LABEL}>
              Deskripsi (opsional)
            </label>
            <input
              id="ak-jur-deskripsi"
              value={draft.deskripsi}
              onChange={(e) =>
                onChange({ ...draft, deskripsi: e.target.value })
              }
              className={INPUT}
            />
          </div>
          {draft.id ? (
            <ActiveToggle
              id="ak-jur-aktif"
              checked={draft.is_aktif === 1}
              label="Jurusan aktif"
              hint="Nonaktifkan alih-alih menghapus bila jurusan masih dipakai rombel."
              onChange={(checked) =>
                onChange({ ...draft, is_aktif: checked ? 1 : 0 })
              }
            />
          ) : null}
        </>
      );
    case "rombel":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ak-rom-ta" className={LABEL}>
                Tahun ajaran
              </label>
              <select
                id="ak-rom-ta"
                value={draft.id_tahun_ajaran}
                onChange={(e) =>
                  onChange({ ...draft, id_tahun_ajaran: e.target.value })
                }
                required
                className={INPUT}
              >
                <option value="">-- Pilih --</option>
                {options.tahunAjaran.map((ta) => (
                  <option
                    key={String(ta.id_tahun_ajaran)}
                    value={String(ta.id_tahun_ajaran)}
                  >
                    {String(ta.nama_tahun)} ({String(ta.semester)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ak-rom-tingkat" className={LABEL}>
                Tingkat
              </label>
              <select
                id="ak-rom-tingkat"
                value={draft.tingkat}
                onChange={(e) =>
                  onChange({ ...draft, tingkat: e.target.value })
                }
                className={INPUT}
              >
                <option value="10">Kelas 10</option>
                <option value="11">Kelas 11</option>
                <option value="12">Kelas 12</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="ak-rom-nama" className={LABEL}>
              Nama rombel
            </label>
            <input
              id="ak-rom-nama"
              value={draft.nama_rombel}
              onChange={(e) =>
                onChange({ ...draft, nama_rombel: e.target.value })
              }
              placeholder="X TKJ 1"
              required
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="ak-rom-jur" className={LABEL}>
              Jurusan
            </label>
            <select
              id="ak-rom-jur"
              value={draft.id_jurusan}
              onChange={(e) =>
                onChange({ ...draft, id_jurusan: e.target.value })
              }
              className={INPUT}
            >
              <option value="">Umum / tanpa jurusan</option>
              {options.jurusan.map((j) => (
                <option key={String(j.id_jurusan)} value={String(j.id_jurusan)}>
                  {String(j.kode_jurusan)} · {String(j.nama_jurusan)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ak-rom-wali" className={LABEL}>
              Wali kelas
            </label>
            <select
              id="ak-rom-wali"
              value={draft.id_wali_kelas}
              onChange={(e) =>
                onChange({ ...draft, id_wali_kelas: e.target.value })
              }
              className={INPUT}
            >
              <option value="">Belum ditentukan</option>
              {options.guru.map((g) => (
                <option key={String(g.id_guru)} value={String(g.id_guru)}>
                  {String(g.nama || g.id_guru)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ak-rom-ruang" className={LABEL}>
                Ruang kelas
              </label>
              <input
                id="ak-rom-ruang"
                value={draft.ruang_kelas}
                onChange={(e) =>
                  onChange({ ...draft, ruang_kelas: e.target.value })
                }
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="ak-rom-kapasitas" className={LABEL}>
                Kapasitas siswa
              </label>
              <input
                id="ak-rom-kapasitas"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                step={1}
                value={draft.kapasitas}
                onChange={(e) =>
                  onChange({ ...draft, kapasitas: e.target.value })
                }
                required
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>
          {draft.id ? (
            <ActiveToggle
              id="ak-rom-aktif"
              checked={draft.is_aktif === 1}
              label="Rombel aktif"
              hint="Nonaktifkan alih-alih menghapus bila rombel masih berisi siswa atau riwayat presensi."
              onChange={(checked) =>
                onChange({ ...draft, is_aktif: checked ? 1 : 0 })
              }
            />
          ) : null}
        </>
      );
    case "mapel":
      return (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="ak-map-kode" className={LABEL}>
                Kode
              </label>
              <input
                id="ak-map-kode"
                value={draft.kode_mapel}
                onChange={(e) =>
                  onChange({ ...draft, kode_mapel: e.target.value })
                }
                placeholder="MTK"
                autoCapitalize="characters"
                required
                className={`${INPUT} font-mono uppercase`}
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="ak-map-kelompok" className={LABEL}>
                Kelompok
              </label>
              <select
                id="ak-map-kelompok"
                value={draft.kelompok}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    kelompok:
                      KELOMPOK_MAPEL.find((k) => k === e.target.value) ??
                      "Wajib",
                  })
                }
                className={INPUT}
              >
                {KELOMPOK_MAPEL.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="ak-map-nama" className={LABEL}>
              Nama mata pelajaran
            </label>
            <input
              id="ak-map-nama"
              value={draft.nama_mapel}
              onChange={(e) =>
                onChange({ ...draft, nama_mapel: e.target.value })
              }
              required
              className={INPUT}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ak-map-beban" className={LABEL}>
                Beban (JP/minggu)
              </label>
              <input
                id="ak-map-beban"
                type="number"
                inputMode="numeric"
                min={1}
                max={10}
                step={1}
                value={draft.beban_jam}
                onChange={(e) =>
                  onChange({ ...draft, beban_jam: e.target.value })
                }
                required
                className={`${INPUT} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="ak-map-kkm" className={LABEL}>
                KKM
              </label>
              <input
                id="ak-map-kkm"
                type="number"
                inputMode="numeric"
                min={50}
                max={100}
                step={1}
                value={draft.kkm}
                onChange={(e) => onChange({ ...draft, kkm: e.target.value })}
                required
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>
          {draft.id ? (
            <ActiveToggle
              id="ak-map-aktif"
              checked={draft.is_aktif === 1}
              label="Mata pelajaran aktif"
              hint="Nonaktifkan alih-alih menghapus bila mapel masih punya penugasan atau riwayat presensi."
              onChange={(checked) =>
                onChange({ ...draft, is_aktif: checked ? 1 : 0 })
              }
            />
          ) : null}
        </>
      );
    case "penugasan": {
      const ta = options.tahunAjaran.find(
        (t) => String(t.id_tahun_ajaran) === draft.id_tahun_ajaran,
      );
      return (
        <>
          <p className="rounded-xl border border-white/10 bg-slate-950/60 p-2.5 text-[11px] text-slate-400">
            Tahun ajaran:{" "}
            <strong className="text-slate-200">
              {ta ? `${String(ta.nama_tahun)} (${String(ta.semester)})` : "-"}
            </strong>{" "}
            — mengikuti filter di tab Rombel.
          </p>
          <div>
            <label htmlFor="ak-pen-rombel" className={LABEL}>
              Rombel
            </label>
            <select
              id="ak-pen-rombel"
              value={draft.id_rombel}
              onChange={(e) =>
                onChange({ ...draft, id_rombel: e.target.value })
              }
              required
              className={INPUT}
            >
              <option value="">-- Pilih rombel --</option>
              {options.rombel.map((r) => (
                <option key={String(r.id_rombel)} value={String(r.id_rombel)}>
                  {String(r.nama_rombel)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ak-pen-mapel" className={LABEL}>
              Mata pelajaran
            </label>
            <select
              id="ak-pen-mapel"
              value={draft.id_mapel}
              onChange={(e) => onChange({ ...draft, id_mapel: e.target.value })}
              required
              className={INPUT}
            >
              <option value="">-- Pilih mapel --</option>
              {options.mapel.map((m) => (
                <option key={String(m.id_mapel)} value={String(m.id_mapel)}>
                  {String(m.kode_mapel)} · {String(m.nama_mapel)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ak-pen-guru" className={LABEL}>
              Guru pengampu
            </label>
            <select
              id="ak-pen-guru"
              value={draft.id_guru}
              onChange={(e) => onChange({ ...draft, id_guru: e.target.value })}
              required
              className={INPUT}
            >
              <option value="">-- Pilih guru --</option>
              {options.guru.map((g) => (
                <option key={String(g.id_guru)} value={String(g.id_guru)}>
                  {String(g.nama || g.id_guru)}
                </option>
              ))}
            </select>
          </div>
        </>
      );
    }
  }
}
