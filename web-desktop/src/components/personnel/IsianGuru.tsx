"use client";

import type { Dispatch, SetStateAction } from "react";
import { IsianOrganisasi } from "@/components/personnel/IsianOrganisasi";
import { PilihCari } from "@/components/ui/PilihCari";
import type { GuruInput } from "@/lib/gateways/teacher";
import { shiftLabel } from "@/lib/validations/personnel";

/**
 * Isian form Guru/PTK. Dipakai halaman Guru dan Jadikan personil
 * (Kepegawaian → Rekrutmen), supaya tidak ada form guru kedua.
 */
export function IsianGuru({
  formData,
  setFormData,
  unitList,
  shiftList,
  isEditing,
  idTerkunci = isEditing,
  statusTerkunci,
  catatanStatus = "Mengikuti kontrak terakhir. Ubah lewat Kepegawaian → Kontrak.",
  sudahKeluar,
}: {
  formData: GuruInput;
  setFormData: Dispatch<SetStateAction<GuruInput>>;
  unitList: Record<string, unknown>[];
  shiftList: Record<string, unknown>[];
  isEditing: boolean;
  /** ID tidak bisa diketik: sedang mengedit, atau dibuat dari id pelamar. */
  idTerkunci?: boolean;
  statusTerkunci: boolean;
  catatanStatus?: string;
  sudahKeluar: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="guru-id"
            className="block text-xs font-semibold text-slate-300"
          >
            ID Unik
          </label>
          <input
            id="guru-id"
            type="text"
            value={formData.id_guru || ""}
            readOnly={idTerkunci}
            disabled={idTerkunci}
            placeholder="Kosongkan untuk otomatis"
            onChange={(e) =>
              setFormData({ ...formData, id_guru: e.target.value })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed disabled:text-slate-400"
          />
          <p className="mt-1 text-xs text-slate-500">
            {idTerkunci
              ? "ID unik kunci absensi, kartu, dan QR."
              : "Boleh diisi sendiri. Dikosongkan berarti dibuatkan sistem."}
          </p>
        </div>
        <div>
          <label
            htmlFor="guru-kode"
            className="block text-xs font-semibold text-slate-300"
          >
            Kode Karyawan / PTK
          </label>
          <input
            id="guru-kode"
            type="text"
            value={formData.kode_karyawan || ""}
            placeholder="Kosongkan untuk otomatis (NIP/ID)"
            onChange={(e) =>
              setFormData({
                ...formData,
                kode_karyawan: e.target.value,
              })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-slate-500">
            Kode personil di data induk & kartu nama.
          </p>
        </div>
      </div>
      <div>
        <label
          htmlFor="guru-unit"
          className="block text-xs font-semibold text-slate-300"
        >
          Unit
        </label>
        <PilihCari
          id="guru-unit"
          value={formData.unit || ""}
          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        >
          <option value="">Tidak ditentukan</option>
          {unitList.map((u) => (
            <option
              key={String(u.id_unit)}
              value={String(u.nama_unit)}
              className="bg-slate-900"
            >
              {String(u.nama_unit)}
            </option>
          ))}
        </PilihCari>
      </div>
      <IsianOrganisasi
        idAwalan="guru"
        idKaryawan={formData.id_guru ?? ""}
        nilai={{
          id_bagian: formData.id_bagian ?? "",
          id_jabatan: formData.id_jabatan ?? "",
          id_atasan: formData.id_atasan ?? "",
        }}
        onChange={({ id_bagian, id_jabatan, id_atasan }) =>
          setFormData((lama) => ({
            ...lama,
            id_bagian,
            id_jabatan,
            id_atasan,
          }))
        }
        bawaanGuru={!isEditing}
        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        labelClassName="block text-xs font-semibold text-slate-300"
      />
      <div>
        <label
          htmlFor="guru-tmt"
          className="block text-xs font-semibold text-slate-300"
        >
          TMT (Tanggal Mulai Tugas)
        </label>
        <input
          id="guru-tmt"
          type="date"
          value={formData.tanggal_mulai_aktif ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              tanggal_mulai_aktif: e.target.value,
            })
          }
          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
        {unitList.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            Belum ada unit. Tambahkan lewat Akademik → Unit.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label
            htmlFor="guru-nama"
            className="block text-xs font-semibold text-slate-300"
          >
            Nama Lengkap (tanpa gelar)
          </label>
          <input
            id="guru-nama"
            type="text"
            required
            value={formData.nama}
            onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="guru-gelar"
            className="block text-xs font-semibold text-slate-300"
          >
            Gelar (cth: S.Pd.)
          </label>
          <input
            id="guru-gelar"
            type="text"
            value={formData.gelar || ""}
            onChange={(e) =>
              setFormData({ ...formData, gelar: e.target.value })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="guru-nip"
            className="block text-xs font-semibold text-slate-300"
          >
            NIP (Nomor Induk Pegawai)
          </label>
          <input
            id="guru-nip"
            type="text"
            value={formData.nip || ""}
            onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="guru-nuptk"
            className="block text-xs font-semibold text-slate-300"
          >
            NUPTK
          </label>
          <input
            id="guru-nuptk"
            type="text"
            value={formData.nuptk || ""}
            onChange={(e) =>
              setFormData({ ...formData, nuptk: e.target.value })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="guru-mapel"
            className="block text-xs font-semibold text-slate-300"
          >
            Spesialisasi Mata Pelajaran
          </label>
          <input
            id="guru-mapel"
            type="text"
            placeholder="cth: Pemrograman Web"
            value={formData.spesialisasi_mapel || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                spesialisasi_mapel: e.target.value,
              })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="guru-status-peg"
            className="block text-xs font-semibold text-slate-300"
          >
            Status Kepegawaian
          </label>
          <select
            id="guru-status-peg"
            disabled={statusTerkunci}
            aria-describedby={
              statusTerkunci ? "guru-status-terkunci" : undefined
            }
            value={formData.status_kepegawaian || "Honorer"}
            onChange={(e) =>
              setFormData({
                ...formData,
                status_kepegawaian: e.target.value,
              })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="PNS" className="bg-slate-900 text-slate-100">
              PNS
            </option>
            <option value="PPPK" className="bg-slate-900 text-slate-100">
              PPPK
            </option>
            <option value="GTY" className="bg-slate-900 text-slate-100">
              GTY (Tetap Yayasan)
            </option>
            <option value="GTT" className="bg-slate-900 text-slate-100">
              GTT (Tidak Tetap)
            </option>
            <option value="Honorer" className="bg-slate-900 text-slate-100">
              Honorer
            </option>
            <option value="Kontrak" className="bg-slate-900 text-slate-100">
              Kontrak
            </option>
          </select>
          {statusTerkunci ? (
            <p
              id="guru-status-terkunci"
              className="mt-1 text-xs text-slate-400"
            >
              {catatanStatus}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="guru-lp"
            className="block text-xs font-semibold text-slate-300"
          >
            Jenis Kelamin
          </label>
          <select
            id="guru-lp"
            value={formData.lp || "L"}
            onChange={(e) => setFormData({ ...formData, lp: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="L" className="bg-slate-900 text-slate-100">
              Laki-laki
            </option>
            <option value="P" className="bg-slate-900 text-slate-100">
              Perempuan
            </option>
          </select>
        </div>
        <div>
          <label
            htmlFor="guru-shift"
            className="block text-xs font-semibold text-slate-300"
          >
            Shift / Jam Scan
          </label>
          <PilihCari
            id="guru-shift"
            value={formData.id_shift || 1}
            onChange={(e) =>
              setFormData({
                ...formData,
                id_shift: Number(e.target.value),
              })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            {shiftList.map((s) => (
              <option
                key={Number(s.id_shift)}
                value={Number(s.id_shift)}
                className="bg-slate-900 text-slate-100"
              >
                {shiftLabel(s)}
              </option>
            ))}
          </PilihCari>
        </div>
        <div>
          <label
            htmlFor="guru-status-aktif"
            className="block text-xs font-semibold text-slate-300"
          >
            Status Keaktifan
          </label>
          <select
            id="guru-status-aktif"
            disabled={sudahKeluar}
            aria-describedby={sudahKeluar ? "guru-status-keluar" : undefined}
            value={formData.status_aktif || "Aktif"}
            onChange={(e) =>
              setFormData({ ...formData, status_aktif: e.target.value })
            }
            className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="Aktif" className="bg-slate-900 text-slate-100">
              Aktif
            </option>
            <option value="Nonaktif" className="bg-slate-900 text-slate-100">
              Nonaktif
            </option>
          </select>
          {sudahKeluar ? (
            <p id="guru-status-keluar" className="mt-1 text-xs text-slate-400">
              Guru ini sudah keluar. Batalkan proses keluarnya di Kepegawaian
              untuk mengaktifkannya lagi.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label
          htmlFor="guru-wa"
          className="block text-xs font-semibold text-slate-300"
        >
          No. WhatsApp / HP
        </label>
        <input
          id="guru-wa"
          type="text"
          placeholder="08123456789"
          value={formData.no_hp || ""}
          onChange={(e) => setFormData({ ...formData, no_hp: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>

      <div>
        <label
          htmlFor="guru-email"
          className="block text-xs font-semibold text-slate-300"
        >
          Email
        </label>
        <input
          id="guru-email"
          type="email"
          autoComplete="off"
          placeholder="nama@sekolah.sch.id"
          value={formData.email || ""}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>
    </>
  );
}
