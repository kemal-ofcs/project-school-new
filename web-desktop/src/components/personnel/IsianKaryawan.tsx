"use client";

import type { Dispatch, SetStateAction } from "react";
import { IsianOrganisasi } from "@/components/personnel/IsianOrganisasi";
import { PilihCari } from "@/components/ui/PilihCari";
import type { KaryawanInput } from "@/lib/gateways/employee";
import { PESAN_SUDAH_KELUAR } from "@/lib/validations/hr-keluar";

/**
 * Isian form Karyawan. Dipakai halaman Karyawan dan Jadikan personil
 * (Kepegawaian → Rekrutmen), supaya tidak ada form karyawan kedua.
 * `rekrutmen` menyembunyikan jenis personil, tanggal daftar, dan tanggal
 * selesai aktif, yang tidak dibawa jalur Jadikan personil.
 */
export function IsianKaryawan({
  formData,
  setFormData,
  formErrors,
  unitList,
  shiftList,
  isEditing,
  idTerkunci = isEditing,
  editId,
  editKeluar,
  rekrutmen = false,
}: {
  formData: KaryawanInput;
  setFormData: Dispatch<SetStateAction<KaryawanInput>>;
  formErrors: Record<string, string>;
  unitList: Record<string, unknown>[];
  shiftList: Record<string, unknown>[];
  isEditing: boolean;
  idTerkunci?: boolean;
  editId: string | null;
  editKeluar: boolean;
  rekrutmen?: boolean;
}) {
  return (
    <>
      {/* ID & Kode */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="employee-id"
            className="text-slate-400 block mb-1 font-semibold"
          >
            ID Unik / NIK:
          </label>
          <input
            id="employee-id"
            type="text"
            disabled={idTerkunci}
            value={formData.id_unik}
            onChange={(e) =>
              setFormData({ ...formData, id_unik: e.target.value })
            }
            aria-invalid={!!formErrors.id_unik}
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label
            htmlFor="employee-code"
            className="text-slate-400 block mb-1 font-semibold"
          >
            Kode Karyawan:
          </label>
          <input
            id="employee-code"
            type="text"
            value={formData.kode_karyawan}
            onChange={(e) =>
              setFormData({ ...formData, kode_karyawan: e.target.value })
            }
            aria-invalid={!!formErrors.kode_karyawan}
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Nama Lengkap */}
      <div>
        <label
          htmlFor="employee-name"
          className="text-slate-400 block mb-1 font-semibold"
        >
          Nama Lengkap Karyawan:
        </label>
        <input
          id="employee-name"
          type="text"
          value={formData.nama}
          onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
          placeholder="Masukkan nama lengkap..."
          aria-invalid={!!formErrors.nama}
          className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
        />
      </div>

      {/* Bagian, Jabatan, Atasan (master Kepegawaian) & Unit */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <IsianOrganisasi
          idAwalan="employee"
          idKaryawan={editId ?? formData.id_unik}
          nilai={{
            id_bagian: formData.id_bagian ?? "",
            id_jabatan: formData.id_jabatan ?? "",
            id_atasan: formData.id_atasan ?? "",
          }}
          onChange={(org) =>
            setFormData((lama) => ({
              ...lama,
              ...org,
              divisi: org.divisi || lama.divisi,
              jabatan_status: org.jabatan_status || lama.jabatan_status,
            }))
          }
          bagianWajib={!isEditing}
          className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          labelClassName="text-slate-400 block mb-1 font-semibold"
        />
        <div>
          <label
            htmlFor="employee-unit"
            className="text-slate-400 block mb-1 font-semibold"
          >
            Unit:
          </label>
          <PilihCari
            id="employee-unit"
            value={formData.unit || ""}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          >
            <option value="">Tidak ditentukan</option>
            {unitList.map((u) => (
              <option key={String(u.id_unit)} value={String(u.nama_unit)}>
                {String(u.nama_unit)}
              </option>
            ))}
          </PilihCari>
        </div>
      </div>

      {/* Gender, Shift & Personil */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="employee-gender"
            className="text-slate-400 block mb-1 font-semibold"
          >
            Jenis Kelamin:
          </label>
          <select
            id="employee-gender"
            value={formData.lp}
            onChange={(e) =>
              setFormData({
                ...formData,
                lp: e.target.value as "L" | "P",
              })
            }
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          >
            <option value="L">Laki-laki (L)</option>
            <option value="P">Perempuan (P)</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="employee-shift"
            className="text-slate-400 block mb-1 font-semibold"
          >
            Shift Kerja:
          </label>
          <PilihCari
            id="employee-shift"
            value={formData.id_shift}
            onChange={(e) =>
              setFormData({
                ...formData,
                id_shift: Number(e.target.value),
              })
            }
            aria-invalid={!!formErrors.id_shift}
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          >
            {shiftList.map((s) => (
              <option key={String(s.id_shift)} value={Number(s.id_shift)}>
                {String(s.nama_shift)} ({String(s.jam_masuk)} -{" "}
                {String(s.jam_pulang)})
              </option>
            ))}
          </PilihCari>
        </div>
        {!rekrutmen ? (
          <div>
            <label
              htmlFor="employee-personnel"
              className="text-slate-400 block mb-1 font-semibold"
            >
              Jenis Personil:
            </label>
            <select
              id="employee-personnel"
              value={formData.jenis_personil || "Pegawai"}
              onChange={(e) =>
                setFormData({ ...formData, jenis_personil: e.target.value })
              }
              className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
            >
              <option value="Pegawai">Pegawai</option>
              <option value="Kontrak">Kontrak</option>
              <option value="Magang">Magang</option>
              <option value="Harian">Harian</option>
            </select>
          </div>
        ) : null}
      </div>

      {/* No HP, Status Aktif & Tanggal Daftar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label
            htmlFor="employee-phone"
            className="mb-1 block text-slate-400 font-semibold"
          >
            Nomor HP:
          </label>
          <input
            id="employee-phone"
            type="tel"
            value={formData.no_hp}
            onChange={(event) =>
              setFormData({ ...formData, no_hp: event.target.value })
            }
            placeholder="08xxxxxxxxxx"
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          />
        </div>
        <div>
          <label
            htmlFor="employee-status"
            className="mb-1 block text-slate-400 font-semibold"
          >
            Status Keaktifan:
          </label>
          <select
            id="employee-status"
            disabled={editKeluar}
            title={editKeluar ? PESAN_SUDAH_KELUAR : undefined}
            value={formData.status_aktif || "Aktif"}
            onChange={(e) =>
              setFormData({
                ...formData,
                status_aktif: e.target.value as "Aktif" | "Nonaktif",
              })
            }
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          >
            <option value="Aktif">Aktif</option>
            <option value="Nonaktif">Nonaktif</option>
          </select>
        </div>
        {!rekrutmen ? (
          <div>
            <label
              htmlFor="employee-reg-date"
              className="mb-1 block text-slate-400 font-semibold"
            >
              Tgl Daftar / Bergabung:
            </label>
            <input
              id="employee-reg-date"
              type="date"
              value={formData.tanggal_daftar || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tanggal_daftar: e.target.value,
                })
              }
              className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
            />
          </div>
        ) : null}
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="employee-email"
          className="mb-1 block text-slate-400 font-semibold"
        >
          Email:
        </label>
        <input
          id="employee-email"
          type="email"
          autoComplete="off"
          value={formData.email ?? ""}
          onChange={(event) =>
            setFormData({ ...formData, email: event.target.value })
          }
          placeholder="nama@sekolah.sch.id"
          aria-invalid={!!formErrors.email}
          className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
        />
      </div>

      {/* Tanggal Mulai & Selesai Aktif */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="employee-start-date"
            className="mb-1 block text-slate-400 font-semibold"
          >
            TMT (Tanggal Mulai Tugas):
          </label>
          <input
            id="employee-start-date"
            type="date"
            value={formData.tanggal_mulai_aktif || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                tanggal_mulai_aktif: e.target.value,
              })
            }
            className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
          />
        </div>
        {!rekrutmen ? (
          <div>
            <label
              htmlFor="employee-end-date"
              className="mb-1 block text-slate-400 font-semibold"
            >
              Tanggal Selesai Aktif (Opsional):
            </label>
            <input
              id="employee-end-date"
              type="date"
              value={formData.tanggal_selesai_aktif || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  tanggal_selesai_aktif: e.target.value,
                })
              }
              className="min-h-10 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white outline-none focus:border-sky-500"
            />
          </div>
        ) : null}
      </div>

      {/* Catatan */}
      <div>
        <label
          htmlFor="employee-notes"
          className="mb-1 block text-slate-400 font-semibold"
        >
          Catatan:
        </label>
        <textarea
          id="employee-notes"
          value={formData.catatan}
          onChange={(event) =>
            setFormData({ ...formData, catatan: event.target.value })
          }
          rows={2}
          placeholder="Catatan tambahan karyawan..."
          className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-500"
        />
      </div>
    </>
  );
}
