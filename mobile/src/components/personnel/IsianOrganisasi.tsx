"use client";

import { useEffect, useRef, useState } from "react";
import { PilihCari } from "@/components/ui/PilihCari";
import { muatOrgKepegawaian, type OrgKepegawaian } from "@/lib/gateways/hris";
import { kunciNama } from "@/lib/validations/hris";

export interface NilaiOrganisasi {
  id_bagian: string;
  id_jabatan: string;
  id_atasan: string;
}

/** Pilihan beserta nama sekarang, supaya teks `divisi`/`jabatan_status` form ikut. */
export interface PerubahanOrganisasi extends NilaiOrganisasi {
  divisi: string;
  jabatan_status: string;
}

interface IsianOrganisasiProps {
  idAwalan: string;
  /** Pegawai yang disunting; dikecualikan dari pilihan atasan. */
  idKaryawan: string;
  nilai: NilaiOrganisasi;
  onChange: (perubahan: PerubahanOrganisasi) => void;
  /** Guru baru: pilih "Tenaga Pengajar"/"Guru" bila keduanya ada (Q-19). */
  bawaanGuru?: boolean;
  bagianWajib?: boolean;
  className: string;
  labelClassName: string;
}

/**
 * Bagian, jabatan, dan atasan langsung dari master Kepegawaian (HRIS Fase 1a).
 * Master nonaktif hanya muncul bila sedang dipegang orang ini.
 */
export function IsianOrganisasi({
  idAwalan,
  idKaryawan,
  nilai,
  onChange,
  bawaanGuru = false,
  bagianWajib = false,
  className,
  labelClassName,
}: IsianOrganisasiProps) {
  const [org, setOrg] = useState<OrgKepegawaian | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const nilaiRef = useRef(nilai);
  nilaiRef.current = nilai;
  const bawaanDipasang = useRef(false);

  useEffect(() => {
    let aktif = true;
    muatOrgKepegawaian()
      .then((data) => {
        if (aktif) setOrg(data);
      })
      .catch(() => {
        if (aktif) setGalat("Daftar bagian dan jabatan belum bisa dimuat.");
      });
    return () => {
      aktif = false;
    };
  }, []);

  const namaBagian = (id: string) =>
    org?.bagian.find((b) => b.id_bagian === id)?.nama ?? "";
  const namaJabatan = (id: string) =>
    org?.jabatan.find((j) => j.id_jabatan === id)?.nama ?? "";

  const ubah = (sebagian: Partial<NilaiOrganisasi>) => {
    const baru = { ...nilaiRef.current, ...sebagian };
    onChangeRef.current({
      ...baru,
      divisi: namaBagian(baru.id_bagian),
      jabatan_status: namaJabatan(baru.id_jabatan),
    });
  };

  useEffect(() => {
    if (!org || !bawaanGuru || bawaanDipasang.current) return;
    bawaanDipasang.current = true;
    if (nilaiRef.current.id_bagian) return;
    const bagian = org.bagian.find(
      (b) => b.is_aktif === 1 && kunciNama(b.nama) === "tenaga pengajar",
    );
    const jabatan = org.jabatan.find(
      (j) => j.is_aktif === 1 && kunciNama(j.nama) === "guru",
    );
    if (!bagian || !jabatan) return;
    onChangeRef.current({
      ...nilaiRef.current,
      id_bagian: bagian.id_bagian,
      id_jabatan: jabatan.id_jabatan,
      divisi: bagian.nama,
      jabatan_status: jabatan.nama,
    });
  }, [org, bawaanGuru]);

  const bagian = (org?.bagian ?? []).filter(
    (b) => b.is_aktif === 1 || b.id_bagian === nilai.id_bagian,
  );
  const jabatan = (org?.jabatan ?? []).filter(
    (j) => j.is_aktif === 1 || j.id_jabatan === nilai.id_jabatan,
  );
  const atasan = (org?.pegawai ?? []).filter(
    (p) =>
      p.id_unik !== idKaryawan &&
      (p.status_aktif === "Aktif" || p.id_unik === nilai.id_atasan),
  );

  return (
    <>
      <div>
        <label htmlFor={`${idAwalan}-bagian`} className={labelClassName}>
          Bagian{bagianWajib ? " *" : ""}:
        </label>
        <PilihCari
          id={`${idAwalan}-bagian`}
          value={nilai.id_bagian}
          required={bagianWajib}
          onChange={(e) => ubah({ id_bagian: e.target.value })}
          className={className}
        >
          <option value="">
            {org && bagian.length === 0
              ? "Belum ada bagian (atur di Kepegawaian)"
              : "Pilih bagian"}
          </option>
          {bagian.map((b) => (
            <option key={b.id_bagian} value={b.id_bagian}>
              {b.is_aktif === 1 ? b.nama : `${b.nama} (nonaktif)`}
            </option>
          ))}
        </PilihCari>
        {galat ? <p className="mt-1 text-xs text-amber-200">{galat}</p> : null}
      </div>
      <div>
        <label htmlFor={`${idAwalan}-jabatan`} className={labelClassName}>
          Jabatan:
        </label>
        <PilihCari
          id={`${idAwalan}-jabatan`}
          value={nilai.id_jabatan}
          onChange={(e) => ubah({ id_jabatan: e.target.value })}
          className={className}
        >
          <option value="">Tidak ditentukan</option>
          {jabatan.map((j) => (
            <option key={j.id_jabatan} value={j.id_jabatan}>
              {j.is_aktif === 1 ? j.nama : `${j.nama} (nonaktif)`}
            </option>
          ))}
        </PilihCari>
      </div>
      <div>
        <label htmlFor={`${idAwalan}-atasan`} className={labelClassName}>
          Atasan langsung:
        </label>
        <PilihCari
          id={`${idAwalan}-atasan`}
          value={nilai.id_atasan}
          onChange={(e) => ubah({ id_atasan: e.target.value })}
          className={className}
        >
          <option value="">Tidak ada</option>
          {atasan.map((p) => (
            <option key={p.id_unik} value={p.id_unik}>
              {p.nama}
              {p.jabatan_status ? ` · ${p.jabatan_status}` : ""}
            </option>
          ))}
        </PilihCari>
      </div>
    </>
  );
}
