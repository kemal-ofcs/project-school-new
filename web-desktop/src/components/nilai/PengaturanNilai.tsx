"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import {
  getKonfigurasiNilai,
  hapusJenisNilai,
  type JenisNilaiItem,
  type KonfigurasiNilai,
  simpanBobotNilai,
  simpanHariSekolah,
  simpanJenisNilai,
} from "@/lib/gateways/grades";
import type { HariSekolah } from "@/lib/validations/nilai-akhir";

/**
 * Tab Pengaturan Nilai (N2a): jenis penilaian dan bobot nilai akhir, bobot
 * kehadiran, serta Hari Sekolah per unit. Dipakai apa adanya oleh halaman
 * `/nilai` Web/Desktop dan Mobile (disalin lewat `filesToCopy`). Validasi
 * sesungguhnya ada di backend; layar hanya menunjukkan totalnya.
 */

const NAMA_HARI = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];
const KOTAK = "rounded-xl border border-white/10 bg-slate-900/95 p-4";
const INPUT =
  "mt-1 w-full min-h-11 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const TOMBOL_UTAMA =
  "min-h-11 rounded-lg bg-amber-500 px-4 py-2 font-semibold text-slate-950 text-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";
const TOMBOL_KEDUA =
  "min-h-11 rounded-lg border border-white/15 px-3 py-2 text-white text-sm disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const GALAT =
  "rounded-lg border border-rose-500/30 bg-rose-500/20 p-3 text-rose-100 text-sm";

function pesan(error: unknown, cadangan: string): string {
  return error instanceof Error && error.message ? error.message : cadangan;
}

export function PengaturanNilai({
  bolehAtur,
  onBerubah,
}: {
  bolehAtur: boolean;
  onBerubah: (kabar: string) => void;
}) {
  const [data, setData] = useState<KonfigurasiNilai | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setGalatMuat(null);
    try {
      setData(await getKonfigurasiNilai());
    } catch (error) {
      setGalatMuat(pesan(error, "Pengaturan nilai tidak bisa dimuat."));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const berubah = async (kabar: string) => {
    onBerubah(kabar);
    await muat();
  };

  if (galatMuat) {
    return (
      <div className={`${GALAT} space-y-3`}>
        <p>{galatMuat}</p>
        <button
          className={TOMBOL_KEDUA}
          onClick={() => void muat()}
          type="button"
        >
          Coba muat lagi
        </button>
      </div>
    );
  }
  if (!data) {
    return <p className="text-slate-400 text-sm">Memuat pengaturan nilai…</p>;
  }
  return (
    <div className="space-y-6">
      {!bolehAtur ? (
        <p className="text-slate-400 text-sm">
          Pengaturan ini hanya bisa diubah pemegang izin "Atur Jenis & Bobot
          Nilai".
        </p>
      ) : null}
      <PanelBobot bolehAtur={bolehAtur} data={data} onBerubah={berubah} />
      <PanelHariSekolah bolehAtur={bolehAtur} data={data} onBerubah={berubah} />
    </div>
  );
}

// ── Jenis dan bobot ─────────────────────────────────────────────────────────

function PanelBobot({
  data,
  bolehAtur,
  onBerubah,
}: {
  data: KonfigurasiNilai;
  bolehAtur: boolean;
  onBerubah: (kabar: string) => Promise<void>;
}) {
  const [bobot, setBobot] = useState<Record<string, string>>({});
  const [kehadiran, setKehadiran] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [ubah, setUbah] = useState<Partial<JenisNilaiItem> | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    setBobot(
      Object.fromEntries(data.jenis.map((j) => [j.id_jenis, String(j.bobot)])),
    );
    setKehadiran(String(data.bobot_kehadiran));
  }, [data]);

  const angka = (teks: string | undefined) => {
    const n = Number(teks);
    return Number.isFinite(n) ? n : 0;
  };
  const total =
    angka(kehadiran) +
    data.jenis
      .filter((j) => j.is_aktif === 1)
      .reduce((sum, j) => sum + angka(bobot[j.id_jenis]), 0);

  async function simpan(event: FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      await simpanBobotNilai(
        angka(kehadiran),
        data.jenis.map((j) => ({
          id_jenis: j.id_jenis,
          bobot: angka(bobot[j.id_jenis]),
        })),
      );
      await onBerubah("Bobot nilai akhir tersimpan.");
    } catch (error) {
      setGalat(pesan(error, "Bobot tidak bisa disimpan."));
    } finally {
      isSubmittingRef.current = false;
      setSibuk(false);
    }
  }

  return (
    <section className={`${KOTAK} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Jenis penilaian & bobot</h2>
          <p className="text-slate-400 text-sm">
            Bobot jenis aktif ditambah bobot kehadiran wajib tepat 100%. Bobot
            berlaku untuk seluruh sekolah dan mengubah nilai akhir semua siswa.
          </p>
        </div>
        {bolehAtur ? (
          <button
            className={TOMBOL_KEDUA}
            onClick={() =>
              setUbah({ nama: "", urutan: data.jenis.length + 1, is_aktif: 1 })
            }
            type="button"
          >
            Tambah jenis
          </button>
        ) : null}
      </div>

      <form className="space-y-3" onSubmit={simpan}>
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
          {data.jenis.map((j) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              key={j.id_jenis}
            >
              <span className="min-w-0 text-sm">
                <span className="text-white">{j.nama}</span>
                <span className="block text-slate-400 text-xs">
                  {j.is_aktif === 1
                    ? "Aktif"
                    : "Nonaktif, aktifkan dulu untuk memberi bobot"}{" "}
                  · dipakai {j.dipakai} penilaian
                </span>
              </span>
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`bobot-${j.id_jenis}`}>
                  Bobot {j.nama} dalam persen
                </label>
                <input
                  className="min-h-11 w-20 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right text-white"
                  disabled={!bolehAtur || j.is_aktif !== 1}
                  id={`bobot-${j.id_jenis}`}
                  inputMode="numeric"
                  max={100}
                  min={0}
                  onChange={(e) =>
                    setBobot((b) => ({ ...b, [j.id_jenis]: e.target.value }))
                  }
                  type="number"
                  value={bobot[j.id_jenis] ?? ""}
                />
                <span className="text-slate-400 text-sm">%</span>
                {bolehAtur ? (
                  <button
                    aria-label={`Ubah jenis ${j.nama}`}
                    className={TOMBOL_KEDUA}
                    onClick={() => setUbah(j)}
                    type="button"
                  >
                    Ubah
                  </button>
                ) : null}
              </span>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm text-white">Kehadiran</span>
            <span className="flex items-center gap-2">
              <label className="sr-only" htmlFor="bobot-kehadiran">
                Bobot kehadiran dalam persen
              </label>
              <input
                className="min-h-11 w-20 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-right text-white"
                disabled={!bolehAtur}
                id="bobot-kehadiran"
                inputMode="numeric"
                max={100}
                min={0}
                onChange={(e) => setKehadiran(e.target.value)}
                type="number"
                value={kehadiran}
              />
              <span className="text-slate-400 text-sm">%</span>
            </span>
          </li>
        </ul>
        <p
          aria-live="polite"
          className={`text-sm ${total === 100 ? "text-emerald-300" : "text-amber-100"}`}
        >
          Total {total}%
          {total === 100 ? "" : ", rekap nilai akhir belum bisa dihitung"}
        </p>
        {galat ? (
          <p className={GALAT} role="alert">
            {galat}
          </p>
        ) : null}
        {bolehAtur ? (
          <button className={TOMBOL_UTAMA} disabled={sibuk} type="submit">
            {sibuk ? "Menyimpan…" : "Simpan bobot"}
          </button>
        ) : null}
      </form>

      {ubah ? (
        <DialogJenis
          awal={ubah}
          onClose={() => setUbah(null)}
          onTersimpan={async (kabar) => {
            setUbah(null);
            await onBerubah(kabar);
          }}
        />
      ) : null}
    </section>
  );
}

function DialogJenis({
  awal,
  onClose,
  onTersimpan,
}: {
  awal: Partial<JenisNilaiItem>;
  onClose: () => void;
  onTersimpan: (kabar: string) => Promise<void>;
}) {
  const [nama, setNama] = useState(awal.nama ?? "");
  const [urutan, setUrutan] = useState(String(awal.urutan ?? 0));
  const [aktif, setAktif] = useState(awal.is_aktif !== 0);
  const [yakinHapus, setYakinHapus] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const isSubmittingRef = useRef(false);
  const bolehHapus = Boolean(awal.id_jenis) && !awal.bawaan && !awal.dipakai;

  async function jalankan(aksi: () => Promise<unknown>, kabar: string) {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      await aksi();
      await onTersimpan(kabar);
    } catch (error) {
      setGalat(pesan(error, "Jenis tidak bisa disimpan."));
    } finally {
      isSubmittingRef.current = false;
      setSibuk(false);
    }
  }

  return (
    <Modal
      hideFooter
      isOpen
      onClose={onClose}
      title={awal.id_jenis ? `Ubah jenis ${awal.nama}` : "Jenis penilaian baru"}
    >
      <form
        className="space-y-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void jalankan(
            () =>
              simpanJenisNilai({
                id_jenis: awal.id_jenis ?? null,
                nama,
                urutan: Number(urutan),
                is_aktif: aktif,
              }),
            `Jenis ${nama.trim()} tersimpan.`,
          );
        }}
      >
        <div>
          <label className="block text-slate-400 text-xs" htmlFor="jenis-nama">
            Nama jenis
          </label>
          <input
            className={INPUT}
            id="jenis-nama"
            maxLength={40}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Contoh: Proyek"
            required
            value={nama}
          />
        </div>
        <div>
          <label
            className="block text-slate-400 text-xs"
            htmlFor="jenis-urutan"
          >
            Urutan tampil
          </label>
          <input
            className={INPUT}
            id="jenis-urutan"
            inputMode="numeric"
            max={999}
            min={0}
            onChange={(e) => setUrutan(e.target.value)}
            type="number"
            value={urutan}
          />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-white">
          <input
            checked={aktif}
            className="h-5 w-5 accent-amber-500"
            onChange={(e) => setAktif(e.target.checked)}
            type="checkbox"
          />
          Aktif dipakai untuk penilaian baru
        </label>
        {awal.bawaan ? (
          <p className="text-slate-400 text-xs">
            Jenis bawaan tidak bisa dihapus, hanya dinonaktifkan. Jenis yang
            masih berbobot harus diberi bobot 0 dulu sebelum dinonaktifkan.
          </p>
        ) : null}
        {galat ? (
          <p className={GALAT} role="alert">
            {galat}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button className={TOMBOL_UTAMA} disabled={sibuk} type="submit">
            {sibuk ? "Menyimpan…" : "Simpan jenis"}
          </button>
          {bolehHapus ? (
            yakinHapus ? (
              <>
                <button
                  className="min-h-11 rounded-lg bg-rose-600 px-4 py-2 font-semibold text-sm text-white disabled:opacity-60"
                  disabled={sibuk}
                  onClick={() =>
                    void jalankan(
                      () => hapusJenisNilai(String(awal.id_jenis)),
                      `Jenis ${awal.nama} dihapus.`,
                    )
                  }
                  type="button"
                >
                  Ya, hapus jenis ini
                </button>
                <button
                  className={TOMBOL_KEDUA}
                  disabled={sibuk}
                  onClick={() => setYakinHapus(false)}
                  type="button"
                >
                  Jangan hapus
                </button>
              </>
            ) : (
              <button
                className={TOMBOL_KEDUA}
                onClick={() => setYakinHapus(true)}
                type="button"
              >
                Hapus jenis
              </button>
            )
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

// ── Hari Sekolah ────────────────────────────────────────────────────────────

function PilihHari({
  legenda,
  nilai,
  onChange,
  disabled,
}: {
  legenda: string;
  nilai: number[];
  onChange: (hari: number[]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-slate-300 text-sm">{legenda}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {NAMA_HARI.map((nama, indeks) => {
          const hari = indeks + 1;
          const dipilih = nilai.includes(hari);
          return (
            <label
              className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${
                dipilih
                  ? "border-amber-500/60 text-white"
                  : "border-white/10 text-slate-400"
              }`}
              key={nama}
            >
              <input
                checked={dipilih}
                className="h-4 w-4 accent-amber-500"
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...nilai, hari].sort((a, b) => a - b)
                      : nilai.filter((h) => h !== hari),
                  )
                }
                type="checkbox"
              />
              {nama}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PanelHariSekolah({
  data,
  bolehAtur,
  onBerubah,
}: {
  data: KonfigurasiNilai;
  bolehAtur: boolean;
  onBerubah: (kabar: string) => Promise<void>;
}) {
  const [nilai, setNilai] = useState<HariSekolah>(data.hari_sekolah);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => setNilai(data.hari_sekolah), [data]);

  async function simpan(event: FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSibuk(true);
    setGalat(null);
    try {
      await simpanHariSekolah(nilai);
      await onBerubah("Hari Sekolah tersimpan.");
    } catch (error) {
      setGalat(pesan(error, "Hari Sekolah tidak bisa disimpan."));
    } finally {
      isSubmittingRef.current = false;
      setSibuk(false);
    }
  }

  return (
    <section className={`${KOTAK} space-y-4`}>
      <div>
        <h2 className="font-semibold text-white">Hari Sekolah</h2>
        <p className="text-slate-400 text-sm">
          Dipakai menghitung hari efektif siswa untuk nilai akhir dan leger
          kehadiran. Scanner, Generate Alfa, dan payroll tidak membacanya. Libur
          sungguhan tetap diisi di menu Hari Libur.
        </p>
      </div>
      <form className="space-y-4" onSubmit={simpan}>
        <PilihHari
          disabled={!bolehAtur}
          legenda="Bawaan (siswa tanpa unit atau unit yang tidak diatur)"
          nilai={nilai.bawaan}
          onChange={(bawaan) => setNilai((n) => ({ ...n, bawaan }))}
        />
        {data.unit.map((unit) => {
          const khusus = nilai.unit[unit.id_unit];
          return (
            <div
              className="space-y-2 border-white/5 border-t pt-3"
              key={unit.id_unit}
            >
              <label className="flex min-h-11 items-center gap-3 text-sm text-white">
                <input
                  checked={khusus !== undefined}
                  className="h-5 w-5 accent-amber-500"
                  disabled={!bolehAtur}
                  onChange={(e) =>
                    setNilai((n) => {
                      const unitBaru = { ...n.unit };
                      if (e.target.checked)
                        unitBaru[unit.id_unit] = [...n.bawaan];
                      else delete unitBaru[unit.id_unit];
                      return { ...n, unit: unitBaru };
                    })
                  }
                  type="checkbox"
                />
                Unit {unit.nama_unit} punya Hari Sekolah sendiri
              </label>
              {khusus !== undefined ? (
                <PilihHari
                  disabled={!bolehAtur}
                  legenda={`Hari Sekolah unit ${unit.nama_unit}`}
                  nilai={khusus}
                  onChange={(hari) =>
                    setNilai((n) => ({
                      ...n,
                      unit: { ...n.unit, [unit.id_unit]: hari },
                    }))
                  }
                />
              ) : null}
            </div>
          );
        })}
        {galat ? (
          <p className={GALAT} role="alert">
            {galat}
          </p>
        ) : null}
        {bolehAtur ? (
          <button className={TOMBOL_UTAMA} disabled={sibuk} type="submit">
            {sibuk ? "Menyimpan…" : "Simpan Hari Sekolah"}
          </button>
        ) : null}
      </form>
    </section>
  );
}
