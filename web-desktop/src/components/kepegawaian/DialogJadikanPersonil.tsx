"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { IsianGuru } from "@/components/personnel/IsianGuru";
import { IsianKaryawan } from "@/components/personnel/IsianKaryawan";
import { Modal } from "@/components/ui/Modal";
import { getDaftarUnit } from "@/lib/gateways/academic";
import type { KaryawanInput } from "@/lib/gateways/employee";
import { jadikanPersonil } from "@/lib/gateways/hris";
import { getDaftarShift } from "@/lib/gateways/shift";
import type { GuruInput } from "@/lib/gateways/teacher";
import {
  type HasilHire,
  idDariPelamar,
  type LowonganBaris,
  type PelamarBaris,
} from "@/lib/validations/hr-rekrutmen";
import {
  firstValidationMessage,
  validateEmployeeDraft,
} from "@/lib/validations/stabilization";
import { pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";
import {
  IsianKontrak,
  kontrakAwal,
  type NilaiKontrak,
  rapikanKontrak,
} from "./TabKontrak";

const lp = (v: string): "L" | "P" => (v === "P" ? "P" : "L");

/**
 * Jadikan personil / Lanjutkan (§25.2.3). Form yang sama dengan halaman Guru
 * atau Karyawan, terisi dari pelamar (nama, HP, L/P) dan lowongan (unit,
 * bagian, jabatan), ditambah kontrak pertama. Id personil diturunkan backend
 * dari id pelamar; di sini hanya ditampilkan.
 */
export function DialogJadikanPersonil({
  pelamar,
  lowongan,
  aksi,
  hariIni,
  onClose,
  onSelesai,
  onGagal,
}: {
  pelamar: PelamarBaris;
  lowongan: LowonganBaris;
  aksi: "jadikan" | "lanjutkan";
  hariIni: string;
  onClose: () => void;
  onSelesai: (hasil: HasilHire) => void;
  /** Klaim bisa sudah tertulis walau langkah sesudahnya gagal: muat ulang. */
  onGagal: () => void;
}) {
  const guru = pelamar.kelompok === "Guru";
  const ids = idDariPelamar(pelamar.id_pelamar, pelamar.kelompok);
  const [shiftList, setShiftList] = useState<Record<string, unknown>[]>([]);
  const [unitList, setUnitList] = useState<Record<string, unknown>[]>([]);
  const [siap, setSiap] = useState(false);
  const [kontrak, setKontrak] = useState<NilaiKontrak>(() =>
    kontrakAwal(pelamar.kelompok, hariIni),
  );
  const [formGuru, setFormGuru] = useState<GuruInput>({
    id_guru: ids.ok ? ids.nilai.id_unik : "",
    nama: pelamar.nama,
    kode_karyawan: "",
    nip: "",
    nuptk: "",
    gelar: "",
    spesialisasi_mapel: "",
    status_kepegawaian: kontrak.status,
    no_hp: pelamar.no_hp,
    email: "",
    lp: lp(pelamar.lp),
    id_shift: 1,
    status_aktif: "Aktif",
    unit: lowongan.unit,
    id_bagian: lowongan.id_bagian,
    id_jabatan: lowongan.id_jabatan,
    id_atasan: "",
    tanggal_mulai_aktif: hariIni,
  });
  const [formKaryawan, setFormKaryawan] = useState<KaryawanInput>({
    id_unik: ids.ok ? ids.nilai.id_unik : "",
    kode_karyawan: ids.ok ? ids.nilai.kode_karyawan : "",
    nama: pelamar.nama,
    divisi: lowongan.bagian,
    jabatan_status: lowongan.jabatan,
    no_hp: pelamar.no_hp,
    lp: lp(pelamar.lp),
    id_shift: 1,
    status_aktif: "Aktif",
    catatan: "",
    tanggal_mulai_aktif: hariIni,
    unit: lowongan.unit,
    email: "",
    id_bagian: lowongan.id_bagian,
    id_jabatan: lowongan.id_jabatan,
    id_atasan: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [galat, setGalat] = useState<string | null>(ids.ok ? null : ids.galat);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    let batal = false;
    Promise.all([getDaftarShift(), getDaftarUnit()])
      .then(([shift, unit]) => {
        if (batal) return;
        setShiftList(shift);
        setUnitList(unit.filter((u) => Number(u.status_aktif) === 1));
        const awal = Number(shift[0]?.id_shift || 1);
        setFormGuru((g) => ({ ...g, id_shift: awal }));
        setFormKaryawan((k) => ({ ...k, id_shift: awal }));
        setSiap(true);
      })
      .catch((error: unknown) => {
        if (!batal) setGalat(pesanGalat(error));
      });
    return () => {
      batal = true;
    };
  }, []);

  const ubahKontrak = (nilai: NilaiKontrak) => {
    setKontrak(nilai);
    // Status guru dicerminkan dari kontrak; isiannya mengikuti.
    setFormGuru((g) => ({ ...g, status_kepegawaian: nilai.status }));
  };

  const personil = () => {
    if (guru) {
      const g = formGuru;
      return {
        nama: g.nama,
        kode_karyawan: g.kode_karyawan ?? "",
        nip: g.nip ?? "",
        nuptk: g.nuptk ?? "",
        gelar: g.gelar ?? "",
        spesialisasi_mapel: g.spesialisasi_mapel ?? "",
        status_kepegawaian: g.status_kepegawaian ?? "",
        no_hp: g.no_hp ?? "",
        lp: g.lp ?? "L",
        id_shift: g.id_shift,
        status_aktif: g.status_aktif === "Nonaktif" ? "Nonaktif" : "Aktif",
        unit: g.unit ?? "",
        email: g.email ?? "",
        id_bagian: g.id_bagian ?? "",
        id_jabatan: g.id_jabatan ?? "",
        id_atasan: g.id_atasan ?? "",
        tanggal_mulai_aktif: g.tanggal_mulai_aktif ?? "",
      } as const;
    }
    const k = formKaryawan;
    return {
      nama: k.nama,
      kode_karyawan: k.kode_karyawan,
      divisi: k.divisi,
      jabatan_status: k.jabatan_status ?? "",
      no_hp: k.no_hp ?? "",
      lp: k.lp,
      id_shift: k.id_shift,
      status_aktif: k.status_aktif ?? "Aktif",
      unit: k.unit ?? "",
      email: k.email ?? "",
      id_bagian: k.id_bagian ?? "",
      id_jabatan: k.id_jabatan ?? "",
      id_atasan: k.id_atasan ?? "",
      tanggal_mulai_aktif: k.tanggal_mulai_aktif ?? "",
      catatan: k.catatan ?? "",
    } as const;
  };

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current || !ids.ok) return;
    if (!guru) {
      const salah = validateEmployeeDraft(formKaryawan);
      setFormErrors(salah);
      if (Object.keys(salah).length > 0) {
        setGalat(firstValidationMessage(salah));
        return;
      }
    }
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    try {
      onSelesai(
        await jadikanPersonil({
          aksi,
          id_pelamar: pelamar.id_pelamar,
          personil: personil(),
          kontrak: rapikanKontrak(kontrak),
        }),
      );
    } catch (error) {
      setGalat(pesanGalat(error));
      onGagal();
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title={
        aksi === "lanjutkan"
          ? `Lanjutkan data personil ${pelamar.nama}`
          : `Jadikan ${guru ? "guru" : "tendik"}: ${pelamar.nama}`
      }
      onClose={onClose}
      hideFooter
      maxWidth="max-w-2xl"
    >
      <form className="space-y-4" onSubmit={(e) => void kirim(e)}>
        <p className="text-xs text-slate-400">
          {aksi === "lanjutkan"
            ? "Pelamar ini sudah diklaim sebagai personil, tetapi datanya belum lengkap. Data yang sudah tersimpan tidak ditulis ulang; yang belum ada dilengkapi."
            : `Lowongan ${lowongan.judul}. Kartu ID dicetak dari menu Kartu ID, akun operator dibuat terpisah, dan data pribadi diisi di rincian pegawai sesudahnya.`}
        </p>
        {!siap && !galat ? (
          <p className="text-sm text-slate-400">Memuat shift dan unit…</p>
        ) : null}
        {siap ? (
          <>
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-semibold text-white">
                Data {guru ? "guru" : "karyawan"}
              </legend>
              {guru ? (
                <IsianGuru
                  formData={formGuru}
                  setFormData={setFormGuru}
                  unitList={unitList}
                  shiftList={shiftList}
                  isEditing={false}
                  idTerkunci
                  statusTerkunci
                  catatanStatus="Mengikuti status kontrak pertama di bawah."
                  sudahKeluar={false}
                />
              ) : (
                <IsianKaryawan
                  formData={formKaryawan}
                  setFormData={setFormKaryawan}
                  formErrors={formErrors}
                  unitList={unitList}
                  shiftList={shiftList}
                  isEditing={false}
                  idTerkunci
                  editId={null}
                  editKeluar={false}
                  rekrutmen
                />
              )}
            </fieldset>
            <fieldset className="space-y-4 border-t border-white/10 pt-4">
              <legend className="mb-2 text-sm font-semibold text-white">
                Kontrak pertama
              </legend>
              <IsianKontrak
                kelompok={pelamar.kelompok}
                nilai={kontrak}
                onChange={ubahKontrak}
              />
            </fieldset>
          </>
        ) : null}
        {galat ? (
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button
            type="submit"
            className={TOMBOL_UTAMA}
            disabled={menyimpan || !siap || !ids.ok}
          >
            {menyimpan
              ? "Menyimpan..."
              : aksi === "lanjutkan"
                ? "Lanjutkan"
                : "Jadikan personil"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
