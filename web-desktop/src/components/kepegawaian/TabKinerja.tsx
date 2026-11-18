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
  muatTemplateKinerja,
  simpanPengaturanKinerja,
  simpanTemplateKinerja,
} from "@/lib/gateways/hris";
import {
  type DataTemplateKinerja,
  KELOMPOK_KINERJA,
  type PengaturanKinerja,
  type TemplateDraft,
  type TemplateKinerja,
  TIPE_ASPEK,
  TIPE_KHUSUS_GURU,
  TIPE_MANUAL,
  TOTAL_BOBOT,
  validasiTemplate,
} from "@/lib/validations/hr-kinerja";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";
import { DaftarPenilaianKinerja } from "./PenilaianKinerja";

/**
 * Tab Kinerja di `/kepegawaian` (HRIS Fase 5, §23.5): penilaian per periode
 * (5b, `PenilaianKinerja.tsx`), lalu template per kelompok dan pengaturan
 * (ambang skor otomatis, predikat, rentang tanpa KBM). Data penilaian dan
 * template cloud-only; menyunting template butuh `hr.performance.config`.
 */
export function TabKinerja({
  bolehAtur,
  bolehNilai,
  bolehPutus,
  bolehLihat,
  onPesan,
  onGalat,
}: {
  bolehAtur: boolean;
  /** `hr.performance.assess`. */
  bolehNilai: boolean;
  /** `hr.performance.finalize`. */
  bolehPutus: boolean;
  /** `hr.performance.view`. */
  bolehLihat: boolean;
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
}) {
  const [data, setData] = useState<DataTemplateKinerja | null>(null);
  const [sunting, setSunting] = useState<TemplateKinerja | "baru" | null>(null);

  const muat = useCallback(async () => {
    try {
      setData(await muatTemplateKinerja());
    } catch (error) {
      onGalat(pesanGalat(error));
    }
  }, [onGalat]);

  useEffect(() => {
    void muat();
  }, [muat]);

  if (!data)
    return <p className="text-sm text-slate-400">Memuat template kinerja…</p>;

  return (
    <div className="space-y-8">
      {bolehNilai || bolehPutus || bolehLihat ? (
        <DaftarPenilaianKinerja
          template={data.template}
          bolehNilai={bolehNilai}
          bolehPutus={bolehPutus}
          onPesan={onPesan}
          onGalat={onGalat}
        />
      ) : null}
      <section aria-labelledby="judul-template-kinerja" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="judul-template-kinerja"
            className="text-base font-semibold text-white"
          >
            Template penilaian
          </h2>
          {bolehAtur ? (
            <button
              type="button"
              className={TOMBOL_UTAMA}
              onClick={() => setSunting("baru")}
            >
              Tambah template
            </button>
          ) : null}
        </div>
        <p className="text-sm text-slate-400">
          Satu template bawaan per kelompok dipakai saat penilaian dibuat;
          penilai boleh memilih template aktif lain dari kelompok yang sama.
          Bobot aspek aktif berjumlah 100. Mengubah template tidak mengubah
          penilaian yang sudah dibuat.
        </p>
        {KELOMPOK_KINERJA.map((kelompok) => (
          <div key={kelompok} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-300">{kelompok}</h3>
            {data.template
              .filter((t) => t.kelompok === kelompok)
              .map((t) => (
                <KartuTemplate
                  key={t.id_template}
                  template={t}
                  onUbah={bolehAtur ? () => setSunting(t) : undefined}
                />
              ))}
          </div>
        ))}
      </section>

      <PengaturanKinerjaForm
        awal={data.pengaturan}
        bolehAtur={bolehAtur}
        onTersimpan={(pengaturan) => {
          setData((lama) => (lama ? { ...lama, pengaturan } : lama));
          onPesan("Pengaturan kinerja disimpan.");
        }}
        onGalat={onGalat}
      />

      {sunting ? (
        <ModalTemplate
          awal={sunting === "baru" ? null : sunting}
          onClose={() => setSunting(null)}
          onTersimpan={async () => {
            setSunting(null);
            onPesan("Template kinerja disimpan.");
            await muat();
          }}
          onGalat={onGalat}
        />
      ) : null}
    </div>
  );
}

function KartuTemplate({
  template: t,
  onUbah,
}: {
  template: TemplateKinerja;
  onUbah?: () => void;
}) {
  const aktif = t.aspek.filter((a) => a.is_aktif === 1);
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">
            {t.nama}
            {t.is_bawaan === 1 ? (
              <span className="ml-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs text-sky-200">
                Bawaan
              </span>
            ) : null}
            {t.is_aktif === 1 ? null : (
              <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                Nonaktif
              </span>
            )}
          </p>
          {t.keterangan ? (
            <p className="text-sm text-slate-400">{t.keterangan}</p>
          ) : null}
        </div>
        {onUbah ? (
          <button type="button" className={TOMBOL} onClick={onUbah}>
            Ubah
          </button>
        ) : null}
      </div>
      <ul className="mt-3 space-y-1 text-sm text-slate-300">
        {aktif.map((a) => (
          <li key={a.id_aspek} className="flex justify-between gap-3">
            <span>
              {a.nama}
              {a.tipe === TIPE_MANUAL ? null : (
                <span className="ml-2 text-xs text-slate-400">{a.tipe}</span>
              )}
            </span>
            <span className="tabular-nums text-slate-400">{a.bobot}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

type AspekForm = {
  id_aspek?: string;
  nama: string;
  tipe: string;
  bobot: string;
  panduan: string;
  is_aktif: boolean;
};

function ModalTemplate({
  awal,
  onClose,
  onTersimpan,
  onGalat,
}: {
  awal: TemplateKinerja | null;
  onClose: () => void;
  onTersimpan: () => Promise<void>;
  onGalat: (pesan: string) => void;
}) {
  const [nama, setNama] = useState(awal?.nama ?? "");
  const [kelompok, setKelompok] = useState<string>(awal?.kelompok ?? "Guru");
  const [keterangan, setKeterangan] = useState(awal?.keterangan ?? "");
  const [bawaan, setBawaan] = useState(awal?.is_bawaan === 1);
  const [aktif, setAktif] = useState(awal ? awal.is_aktif === 1 : true);
  const [aspek, setAspek] = useState<AspekForm[]>(
    awal
      ? awal.aspek.map((a) => ({
          id_aspek: a.id_aspek,
          nama: a.nama,
          tipe: a.tipe,
          bobot: String(a.bobot),
          panduan: a.panduan,
          is_aktif: a.is_aktif === 1,
        }))
      : [
          {
            nama: "",
            tipe: TIPE_MANUAL,
            bobot: "100",
            panduan: "",
            is_aktif: true,
          },
        ],
  );
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const total = aspek
    .filter((a) => a.is_aktif)
    .reduce((n, a) => n + (Number.parseInt(a.bobot, 10) || 0), 0);
  const tipeBoleh = TIPE_ASPEK.filter(
    (t) => kelompok === "Guru" || !TIPE_KHUSUS_GURU.includes(t),
  );
  const ubahAspek = (i: number, isi: Partial<AspekForm>) =>
    setAspek((lama) => lama.map((a, j) => (j === i ? { ...a, ...isi } : a)));

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const draft: TemplateDraft = {
      id_template: awal?.id_template,
      nama,
      kelompok,
      keterangan,
      is_bawaan: bawaan,
      is_aktif: aktif,
      aspek: aspek.map((a) => ({
        id_aspek: a.id_aspek,
        nama: a.nama,
        tipe: a.tipe,
        // Bukan bilangan bulat = NaN, ditolak `validasiTemplate` di bawah.
        bobot: /^\d+$/.test(a.bobot.trim())
          ? Number(a.bobot.trim())
          : Number.NaN,
        panduan: a.panduan,
        is_aktif: a.is_aktif,
      })),
    };
    // Aturan yang sama dengan backend, supaya pesannya sama di semua build.
    const cek = validasiTemplate(draft);
    if (!cek.ok) {
      onGalat(cek.galat);
      return;
    }
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await simpanTemplateKinerja(draft);
      await onTersimpan();
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <Modal
      title={awal ? "Ubah template kinerja" : "Tambah template kinerja"}
      onClose={onClose}
      maxWidth="max-w-3xl"
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="kinerja-nama" className={LABEL}>
              Nama template
            </label>
            <input
              id="kinerja-nama"
              required
              maxLength={100}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="kinerja-kelompok" className={LABEL}>
              Kelompok
            </label>
            <select
              id="kinerja-kelompok"
              value={kelompok}
              disabled={awal !== null}
              aria-describedby={awal ? "kinerja-kelompok-catatan" : undefined}
              onChange={(e) => setKelompok(e.target.value)}
              className={INPUT}
            >
              {KELOMPOK_KINERJA.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            {awal ? (
              <p
                id="kinerja-kelompok-catatan"
                className="mt-1 text-xs text-slate-400"
              >
                Kelompok tidak bisa diubah setelah template dibuat.
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <label htmlFor="kinerja-keterangan" className={LABEL}>
            Keterangan
          </label>
          <input
            id="kinerja-keterangan"
            maxLength={1000}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-slate-200">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={bawaan}
              onChange={(e) => setBawaan(e.target.checked)}
            />
            Bawaan untuk {kelompok}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={aktif}
              onChange={(e) => setAktif(e.target.checked)}
            />
            Aktif
          </label>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-300">
            Aspek · total bobot aktif{" "}
            <span
              className={
                total === TOTAL_BOBOT ? "text-emerald-300" : "text-amber-200"
              }
            >
              {total}
            </span>{" "}
            dari {TOTAL_BOBOT}
          </legend>
          {aspek.map((a, i) => {
            const label = a.nama.trim() || `aspek ${i + 1}`;
            return (
              <div
                key={a.id_aspek ?? `baru-${i}`}
                className="space-y-2 rounded-xl border border-white/10 p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_14rem_6rem]">
                  <input
                    aria-label={`Nama ${label}`}
                    required
                    maxLength={100}
                    value={a.nama}
                    onChange={(e) => ubahAspek(i, { nama: e.target.value })}
                    className={INPUT}
                  />
                  <select
                    aria-label={`Tipe ${label}`}
                    value={a.tipe}
                    disabled={a.id_aspek !== undefined}
                    onChange={(e) => ubahAspek(i, { tipe: e.target.value })}
                    className={INPUT}
                  >
                    {tipeBoleh.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`Bobot ${label}`}
                    inputMode="numeric"
                    required
                    value={a.bobot}
                    onChange={(e) => ubahAspek(i, { bobot: e.target.value })}
                    className={INPUT}
                  />
                </div>
                <textarea
                  aria-label={`Panduan penilai untuk ${label}`}
                  rows={2}
                  maxLength={1000}
                  placeholder="Panduan untuk penilai (rubrik)"
                  value={a.panduan}
                  onChange={(e) => ubahAspek(i, { panduan: e.target.value })}
                  className={`${INPUT} py-2`}
                />
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-200">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.is_aktif}
                      onChange={(e) =>
                        ubahAspek(i, { is_aktif: e.target.checked })
                      }
                    />
                    Aktif
                  </label>
                  {a.id_aspek === undefined ? (
                    <button
                      type="button"
                      className={TOMBOL}
                      onClick={() =>
                        setAspek((lama) => lama.filter((_, j) => j !== i))
                      }
                    >
                      Buang aspek
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      Aspek tersimpan tidak bisa dihapus; nonaktifkan saja.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className={TOMBOL}
            onClick={() =>
              setAspek((lama) => [
                ...lama,
                {
                  nama: "",
                  tipe: TIPE_MANUAL,
                  bobot: "",
                  panduan: "",
                  is_aktif: true,
                },
              ])
            }
          >
            Tambah aspek
          </button>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            {menyimpan ? "Menyimpan…" : "Simpan template"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Angka layar ↔ simpanan bilangan bulat, tanpa float: persen satu desimal ke
// permil (95,5 → 955), nilai dua desimal ke ×100 (91,25 → 9125).

function keBulat(teks: string, desimal: number, maks: number): number | null {
  const t = teks.trim().replace(",", ".");
  const pola = new RegExp(`^(\\d{1,3})(?:\\.(\\d{1,${desimal}}))?$`);
  const cocok = pola.exec(t);
  if (!cocok) return null;
  const hasil =
    Number(cocok[1]) * 10 ** desimal +
    Number((cocok[2] ?? "").padEnd(desimal, "0"));
  return hasil > maks ? null : hasil;
}

function dariBulat(n: number, desimal: number): string {
  const satuan = 10 ** desimal;
  const sisa = n % satuan;
  const bulat = Math.floor(n / satuan);
  return sisa === 0
    ? String(bulat)
    : `${bulat},${String(sisa).padStart(desimal, "0").replace(/0+$/, "")}`;
}

/** Urutan isi `hr_kinerja_ambang`: (a₅, a₄, a₃, a₂). */
const SKOR_AMBANG = [5, 4, 3, 2] as const;

type BarisPredikat = { nilai: string; nama: string };
type BarisRentang = { mulai: string; selesai: string; nama: string };

function PengaturanKinerjaForm({
  awal,
  bolehAtur,
  onTersimpan,
  onGalat,
}: {
  awal: PengaturanKinerja;
  bolehAtur: boolean;
  onTersimpan: (pengaturan: PengaturanKinerja) => void;
  onGalat: (pesan: string) => void;
}) {
  const [ambang, setAmbang] = useState(() =>
    awal.ambang.map((a) => dariBulat(a, 1)),
  );
  const [predikat, setPredikat] = useState<BarisPredikat[]>(() =>
    awal.predikat.map((p) => ({ nilai: dariBulat(p.ambang, 2), nama: p.nama })),
  );
  const [rentang, setRentang] = useState<BarisRentang[]>(() =>
    awal.tanpa_kbm.map((r) => ({ ...r })),
  );
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const kirim = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const permil = ambang.map((a) => keBulat(a, 1, 1000));
    if (permil.some((p) => p === null)) {
      onGalat(
        "Ambang skor diisi persen 0 sampai 100, paling banyak satu angka di belakang koma.",
      );
      return;
    }
    const x100 = predikat.map((p) => keBulat(p.nilai, 2, 10000));
    if (x100.some((p) => p === null)) {
      onGalat(
        "Nilai minimal predikat diisi 0 sampai 100, paling banyak dua angka di belakang koma.",
      );
      return;
    }
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      onTersimpan(
        await simpanPengaturanKinerja({
          ambang: permil.join(","),
          predikat: predikat.map((p, i) => `${x100[i]}:${p.nama}`).join("|"),
          tanpa_kbm: rentang
            .map((r) => `${r.mulai}..${r.selesai}:${r.nama}`)
            .join("|"),
        }),
      );
    } catch (error) {
      onGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <section aria-labelledby="judul-pengaturan-kinerja" className="space-y-3">
      <h2
        id="judul-pengaturan-kinerja"
        className="text-base font-semibold text-white"
      >
        Pengaturan kinerja
      </h2>
      <form className="space-y-6" onSubmit={kirim}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-300">
            Ambang skor aspek otomatis
          </legend>
          <p className="text-sm text-slate-400">
            Persentase capaian (misalnya kehadiran tepat waktu) yang dibutuhkan
            untuk setiap skor. Di bawah ambang skor 2, skornya 1.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            {SKOR_AMBANG.map((skor, i) => (
              <div key={skor}>
                <label htmlFor={`kinerja-ambang-${skor}`} className={LABEL}>
                  Skor {skor} bila ≥ (%)
                </label>
                <input
                  id={`kinerja-ambang-${skor}`}
                  inputMode="decimal"
                  required
                  disabled={!bolehAtur}
                  value={ambang[i]}
                  onChange={(e) =>
                    setAmbang((lama) =>
                      lama.map((x, j) => (j === i ? e.target.value : x)),
                    )
                  }
                  className={INPUT}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-300">
            Predikat nilai akhir
          </legend>
          <p className="text-sm text-slate-400">
            Dari yang tertinggi; baris terakhir bernilai 0. Penilaian yang sudah
            final memakai predikat saat difinalkan.
          </p>
          {predikat.map((p, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: baris predikat tidak ber-id
              key={i}
              className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
            >
              <input
                aria-label={`Nilai minimal predikat ${i + 1}`}
                inputMode="decimal"
                required
                disabled={!bolehAtur}
                value={p.nilai}
                onChange={(e) =>
                  setPredikat((lama) =>
                    lama.map((x, j) =>
                      j === i ? { ...x, nilai: e.target.value } : x,
                    ),
                  )
                }
                className={INPUT}
              />
              <input
                aria-label={`Nama predikat ${i + 1}`}
                required
                maxLength={50}
                disabled={!bolehAtur}
                value={p.nama}
                onChange={(e) =>
                  setPredikat((lama) =>
                    lama.map((x, j) =>
                      j === i ? { ...x, nama: e.target.value } : x,
                    ),
                  )
                }
                className={INPUT}
              />
              {bolehAtur && predikat.length > 2 ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() =>
                    setPredikat((lama) => lama.filter((_, j) => j !== i))
                  }
                >
                  Hapus
                </button>
              ) : null}
            </div>
          ))}
          {bolehAtur && predikat.length < 7 ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() =>
                setPredikat((lama) => [...lama, { nilai: "0", nama: "" }])
              }
            >
              Tambah predikat
            </button>
          ) : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-300">
            Rentang tanpa KBM terjadwal
          </legend>
          <p className="text-sm text-slate-400">
            Minggu ujian, class meeting, atau MPLS. Jam pelajaran di tanggal ini
            tidak dihitung sebagai jam yang wajib berpresensi. Absensi gerbang
            tidak terpengaruh. Paling panjang 31 hari per rentang.
          </p>
          {rentang.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada rentang.</p>
          ) : null}
          {rentang.map((r, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: baris rentang tidak ber-id
              key={i}
              className="grid gap-2 sm:grid-cols-[10rem_10rem_1fr_auto]"
            >
              <input
                type="date"
                aria-label={`Tanggal mulai rentang ${i + 1}`}
                required
                disabled={!bolehAtur}
                value={r.mulai}
                onChange={(e) =>
                  setRentang((lama) =>
                    lama.map((x, j) =>
                      j === i ? { ...x, mulai: e.target.value } : x,
                    ),
                  )
                }
                className={INPUT}
              />
              <input
                type="date"
                aria-label={`Tanggal selesai rentang ${i + 1}`}
                required
                disabled={!bolehAtur}
                value={r.selesai}
                onChange={(e) =>
                  setRentang((lama) =>
                    lama.map((x, j) =>
                      j === i ? { ...x, selesai: e.target.value } : x,
                    ),
                  )
                }
                className={INPUT}
              />
              <input
                aria-label={`Nama rentang ${i + 1}`}
                required
                maxLength={50}
                placeholder="PAS Ganjil"
                disabled={!bolehAtur}
                value={r.nama}
                onChange={(e) =>
                  setRentang((lama) =>
                    lama.map((x, j) =>
                      j === i ? { ...x, nama: e.target.value } : x,
                    ),
                  )
                }
                className={INPUT}
              />
              {bolehAtur ? (
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() =>
                    setRentang((lama) => lama.filter((_, j) => j !== i))
                  }
                >
                  Hapus
                </button>
              ) : null}
            </div>
          ))}
          {bolehAtur && rentang.length < 30 ? (
            <button
              type="button"
              className={TOMBOL}
              onClick={() =>
                setRentang((lama) => [
                  ...lama,
                  { mulai: "", selesai: "", nama: "" },
                ])
              }
            >
              Tambah rentang
            </button>
          ) : null}
        </fieldset>

        {bolehAtur ? (
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            {menyimpan ? "Menyimpan…" : "Simpan pengaturan kinerja"}
          </button>
        ) : null}
      </form>
    </section>
  );
}
