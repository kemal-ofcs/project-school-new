"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  INPUT,
  LABEL,
  pesanGalat,
  TOMBOL,
  TOMBOL_UTAMA,
} from "@/components/kepegawaian/gaya";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { PilihCari } from "@/components/ui/PilihCari";
import {
  muatPengaturanTransfer,
  simpanPengaturanTransfer,
} from "@/lib/gateways/payroll";
import {
  type AksiPengaturan,
  type BankTampil,
  CAKUPAN,
  type FormatTampil,
  ISIAN_TRANSFER,
  type IsianTransfer,
  JENIS_BERKAS,
  type KolomFormat,
  LABEL_ISIAN_TRANSFER,
  MAKS_KOLOM_FORMAT,
  MAKS_PANJANG_BERITA,
  PEMISAH,
  type PengaturanTransfer,
  type RekeningTampil,
} from "@/lib/validations/transfer";

const LABEL_PEMISAH: Record<(typeof PEMISAH)[number], string> = {
  ",": "Koma ( , )",
  ";": "Titik koma ( ; )",
  "\t": "Tab",
  "|": "Garis tegak ( | )",
};
const LABEL_CAKUPAN: Record<(typeof CAKUPAN)[number], string> = {
  semua: "Semua baris",
  sesama: "Sesama bank saja",
  antarbank: "Antarbank saja",
};
const BARIS =
  "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm";

type Sunting =
  | { aksi: "bank"; data: BankTampil | null }
  | { aksi: "rekening"; data: RekeningTampil | null }
  | { aksi: "format"; data: FormatTampil | null };

/**
 * Bank, rekening debet sekolah, dan format berkas transfer (§26.5 nomor 3).
 * Hanya dirender untuk Superadmin (`payroll.config.manage`); butuh koneksi ke
 * database pusat. Bank dan rekening tidak dihapus, cukup dinonaktifkan.
 */
export function BankTransferCard() {
  const [atur, setAtur] = useState<PengaturanTransfer | null>(null);
  const [sunting, setSunting] = useState<Sunting | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setAtur(await muatPengaturanTransfer());
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const simpan = async (
    aksi: AksiPengaturan,
    id: string | null,
    data: Record<string, unknown>,
    berhasil: string,
  ) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    setGalat(null);
    setKabar(null);
    try {
      await simpanPengaturanTransfer({ aksi, id, data });
      setSunting(null);
      setKabar(berhasil);
      await muat();
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const bankAktif = atur?.bank.filter((b) => b.is_aktif === 1) ?? [];

  return (
    <section className="app-panel rounded-3xl p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-sky-300/20 bg-sky-300/10 text-sky-200">
          <Icon name="download" className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-black text-white">Bank dan transfer</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            Daftar bank untuk isian rekening pegawai, rekening sekolah yang
            dipakai membayar gaji, dan susunan kolom berkas yang diminta
            internet banking.
          </p>
        </div>
      </div>

      {galat && !sunting ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
      {kabar ? (
        <output className="mt-4 block text-sm text-emerald-300">{kabar}</output>
      ) : null}
      {!atur && !galat ? (
        <p className="mt-4 text-sm text-slate-400">Memuat…</p>
      ) : null}

      {atur ? (
        <div className="mt-6 space-y-8">
          <Bagian
            judul="Rekening debet sekolah"
            tambah="Tambah rekening"
            onTambah={() => setSunting({ aksi: "rekening", data: null })}
          >
            {atur.rekening.map((r) => (
              <li key={r.id_rekening} className={BARIS}>
                <span>
                  <span className="font-semibold text-white">
                    {r.nama_bank} {r.no_rekening}
                  </span>
                  <span className="text-slate-400">
                    {" "}
                    · a.n. {r.nama_rekening}
                    {r.keterangan ? ` · ${r.keterangan}` : ""}
                    {r.is_aktif === 1 ? "" : " · nonaktif"}
                  </span>
                  {r.is_aktif === 1 && r.bank_aktif !== 1 ? (
                    <span className="block text-xs text-amber-200">
                      Bank rekening ini nonaktif.
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setSunting({ aksi: "rekening", data: r })}
                >
                  Ubah
                </button>
              </li>
            ))}
            {atur.rekening.length === 0 ? (
              <li className="text-sm text-slate-400">
                Belum ada rekening debet.
              </li>
            ) : null}
          </Bagian>

          <Bagian
            judul="Format berkas bank"
            tambah="Tambah format"
            onTambah={() => setSunting({ aksi: "format", data: null })}
          >
            <li className="text-xs text-slate-400">
              Tanpa format, berkas transfer berupa Excel umum. Buat format dari
              contoh berkas asli bank supaya urutan kolomnya tepat.
            </li>
            {atur.format.map((f) => (
              <li key={f.id_format} className={BARIS}>
                <span>
                  <span className="font-semibold text-white">{f.nama}</span>
                  <span className="text-slate-400">
                    {" "}
                    · {f.jenis.toUpperCase()} · {LABEL_CAKUPAN[f.cakupan]}
                    {f.nama_bank ? ` · ${f.nama_bank}` : ""} ·{" "}
                    {f.kolom?.length ?? 0} kolom
                    {f.is_aktif === 1 ? "" : " · nonaktif"}
                  </span>
                  {!f.kolom ? (
                    <span className="block text-xs text-amber-200">
                      Susunan kolom rusak; simpan ulang formatnya.
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setSunting({ aksi: "format", data: f })}
                >
                  Ubah
                </button>
              </li>
            ))}
          </Bagian>

          <Bagian
            judul="Daftar bank"
            tambah="Tambah bank"
            onTambah={() => setSunting({ aksi: "bank", data: null })}
          >
            {atur.bank.map((b) => (
              <li key={b.id_bank} className={BARIS}>
                <span>
                  <span className="font-semibold text-white">{b.nama}</span>
                  <span className="text-slate-400">
                    {" "}
                    · {b.kode ? `kode ${b.kode}` : "tanpa kode"}
                    {b.is_aktif === 1 ? "" : " · nonaktif"}
                  </span>
                  {b.alias.length > 0 ? (
                    <span className="block text-xs text-slate-400">
                      Juga dikenali: {b.alias.join(", ")}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className={TOMBOL}
                  onClick={() => setSunting({ aksi: "bank", data: b })}
                >
                  Ubah
                </button>
              </li>
            ))}
          </Bagian>
        </div>
      ) : null}

      {sunting?.aksi === "bank" ? (
        <ModalBank
          data={sunting.data}
          menyimpan={menyimpan}
          galat={galat}
          onClose={() => setSunting(null)}
          onSimpan={(data) =>
            simpan(
              "bank",
              sunting.data?.id_bank ?? null,
              data,
              `Bank ${String(data.nama)} disimpan.`,
            )
          }
        />
      ) : null}
      {sunting?.aksi === "rekening" ? (
        <ModalRekening
          data={sunting.data}
          bank={bankAktif}
          menyimpan={menyimpan}
          galat={galat}
          onClose={() => setSunting(null)}
          onSimpan={(data) =>
            simpan(
              "rekening",
              sunting.data?.id_rekening ?? null,
              data,
              "Rekening debet disimpan.",
            )
          }
        />
      ) : null}
      {sunting?.aksi === "format" ? (
        <ModalFormat
          data={sunting.data}
          bank={bankAktif}
          menyimpan={menyimpan}
          galat={galat}
          onClose={() => setSunting(null)}
          onSimpan={(data) =>
            simpan(
              "format",
              sunting.data?.id_format ?? null,
              data,
              `Format ${String(data.nama)} disimpan.`,
            )
          }
        />
      ) : null}
    </section>
  );
}

function Bagian({
  judul,
  tambah,
  onTambah,
  children,
}: {
  judul: string;
  tambah: string;
  onTambah: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">{judul}</h3>
        <button type="button" className={TOMBOL_UTAMA} onClick={onTambah}>
          {tambah}
        </button>
      </div>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function Aktif({
  id,
  nilai,
  ubah,
  label = "Aktif",
}: {
  id: string;
  nilai: boolean;
  ubah: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 text-sm text-slate-200"
    >
      <input
        id={id}
        type="checkbox"
        checked={nilai}
        onChange={(e) => ubah(e.target.checked)}
        className="size-4"
      />
      {label}
    </label>
  );
}

function Tombol({
  menyimpan,
  galat,
  onClose,
}: {
  menyimpan: boolean;
  galat: string | null;
  onClose: () => void;
}) {
  return (
    <>
      {galat ? (
        <p className="text-sm text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={TOMBOL} onClick={onClose}>
          Batal
        </button>
        <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
          {menyimpan ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </>
  );
}

interface PropsModal<T> {
  data: T | null;
  menyimpan: boolean;
  galat: string | null;
  onClose: () => void;
  onSimpan: (data: Record<string, unknown>) => void;
}

function ModalBank({
  data,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: PropsModal<BankTampil>) {
  const [nama, setNama] = useState(data?.nama ?? "");
  const [kode, setKode] = useState(data?.kode ?? "");
  const [alias, setAlias] = useState(data?.alias.join(", ") ?? "");
  const [aktif, setAktif] = useState(data ? data.is_aktif === 1 : true);
  const kirim = (e: FormEvent) => {
    e.preventDefault();
    onSimpan({
      nama,
      kode,
      alias: alias
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      is_aktif: aktif ? 1 : 0,
    });
  };
  return (
    <Modal
      title={data ? "Ubah bank" : "Tambah bank"}
      onClose={onClose}
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label className={LABEL} htmlFor="bank-nama">
            Nama bank
          </label>
          <input
            id="bank-nama"
            required
            maxLength={100}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="bank-kode">
            Kode bank BI (3 digit)
          </label>
          <input
            id="bank-kode"
            inputMode="numeric"
            pattern="[0-9]{3}"
            maxLength={3}
            value={kode}
            onChange={(e) => setKode(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="bank-alias">
            Nama lain, pisahkan dengan koma
          </label>
          <input
            id="bank-alias"
            aria-describedby="bank-alias-ket"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className={INPUT}
          />
          <p id="bank-alias-ket" className="mt-1 text-xs text-slate-400">
            Isian bank pegawai yang ditulis dengan nama ini tetap dikenali. Nama
            lama otomatis menjadi nama lain bila nama bank diganti.
          </p>
        </div>
        <Aktif id="bank-aktif" nilai={aktif} ubah={setAktif} />
        <Tombol menyimpan={menyimpan} galat={galat} onClose={onClose} />
      </form>
    </Modal>
  );
}

function ModalRekening({
  data,
  bank,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: PropsModal<RekeningTampil> & { bank: BankTampil[] }) {
  const [idBank, setIdBank] = useState(data?.id_bank ?? "");
  const [nomor, setNomor] = useState(data?.no_rekening ?? "");
  const [nama, setNama] = useState(data?.nama_rekening ?? "");
  const [keterangan, setKeterangan] = useState(data?.keterangan ?? "");
  const [aktif, setAktif] = useState(data ? data.is_aktif === 1 : true);
  const kirim = (e: FormEvent) => {
    e.preventDefault();
    onSimpan({
      id_bank: idBank,
      no_rekening: nomor,
      nama_rekening: nama,
      keterangan,
      is_aktif: aktif ? 1 : 0,
    });
  };
  const bankLama =
    data && !bank.some((b) => b.id_bank === data.id_bank) ? data : null;
  return (
    <Modal
      title={data ? "Ubah rekening debet" : "Tambah rekening debet"}
      onClose={onClose}
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label className={LABEL} htmlFor="rekening-bank">
            Bank
          </label>
          <PilihCari
            id="rekening-bank"
            required
            value={idBank}
            onChange={(e) => setIdBank(e.target.value)}
            className={INPUT}
          >
            <option value="">Pilih bank</option>
            {bankLama ? (
              <option value={bankLama.id_bank}>
                {`${bankLama.nama_bank || bankLama.id_bank} (nonaktif)`}
              </option>
            ) : null}
            {bank.map((b) => (
              <option key={b.id_bank} value={b.id_bank}>
                {b.nama}
              </option>
            ))}
          </PilihCari>
        </div>
        <div>
          <label className={LABEL} htmlFor="rekening-nomor">
            Nomor rekening
          </label>
          <input
            id="rekening-nomor"
            required
            inputMode="numeric"
            maxLength={30}
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="rekening-nama">
            Nama pemilik rekening
          </label>
          <input
            id="rekening-nama"
            required
            maxLength={100}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="rekening-ket">
            Keterangan (opsional)
          </label>
          <input
            id="rekening-ket"
            maxLength={200}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            className={INPUT}
          />
        </div>
        <Aktif id="rekening-aktif" nilai={aktif} ubah={setAktif} />
        <Tombol menyimpan={menyimpan} galat={galat} onClose={onClose} />
      </form>
    </Modal>
  );
}

const KOLOM_BAWAAN: KolomFormat[] = [
  { isian: "no_rekening", judul: "Rekening", teks: null },
  { isian: "nama_rekening", judul: "Nama", teks: null },
  { isian: "nominal", judul: "Nominal", teks: null },
  { isian: "berita", judul: "Keterangan", teks: null },
];

function ModalFormat({
  data,
  bank,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: PropsModal<FormatTampil> & { bank: BankTampil[] }) {
  const [nama, setNama] = useState(data?.nama ?? "");
  const [idBank, setIdBank] = useState(data?.id_bank ?? "");
  const [jenis, setJenis] = useState<(typeof JENIS_BERKAS)[number]>(
    data?.jenis ?? "csv",
  );
  const [pemisah, setPemisah] = useState(data?.pemisah ?? ",");
  const [judul, setJudul] = useState(data ? data.pakai_judul === 1 : true);
  const [kutip, setKutip] = useState(data?.kutip === 1);
  const [desimal, setDesimal] = useState(data?.desimal === 1);
  const [cakupan, setCakupan] = useState<(typeof CAKUPAN)[number]>(
    data?.cakupan ?? "semua",
  );
  const [maksBerita, setMaksBerita] = useState(
    data?.maks_berita ? String(data.maks_berita) : "",
  );
  const [kolom, setKolom] = useState<KolomFormat[]>(
    data?.kolom ?? KOLOM_BAWAAN,
  );
  const [aktif, setAktif] = useState(data ? data.is_aktif === 1 : true);
  const teks = jenis !== "xlsx";

  const ubahKolom = (i: number, isi: Partial<KolomFormat>) =>
    setKolom((k) => k.map((x, j) => (j === i ? { ...x, ...isi } : x)));
  const geser = (i: number, arah: -1 | 1) =>
    setKolom((k) => {
      const salin = [...k];
      [salin[i], salin[i + arah]] = [salin[i + arah], salin[i]];
      return salin;
    });

  const kirim = (e: FormEvent) => {
    e.preventDefault();
    onSimpan({
      nama,
      id_bank: idBank || null,
      jenis,
      pemisah: teks ? pemisah : null,
      pakai_judul: judul ? 1 : 0,
      kutip: teks && kutip ? 1 : 0,
      desimal: teks && desimal ? 1 : 0,
      cakupan,
      kolom: kolom.map((k) => ({
        isian: k.isian,
        judul: k.judul,
        teks: k.isian === "teks_tetap" ? (k.teks ?? "") : null,
      })),
      maks_berita: maksBerita === "" ? null : Number(maksBerita),
      is_aktif: aktif ? 1 : 0,
    });
  };

  return (
    <Modal
      title={data ? "Ubah format berkas" : "Tambah format berkas"}
      onClose={onClose}
      maxWidth="max-w-3xl"
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="format-nama">
              Nama format
            </label>
            <input
              id="format-nama"
              required
              maxLength={100}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="format-bank">
              Untuk bank (opsional)
            </label>
            <PilihCari
              id="format-bank"
              value={idBank}
              onChange={(e) => setIdBank(e.target.value)}
              className={INPUT}
            >
              <option value="">Semua bank</option>
              {bank.map((b) => (
                <option key={b.id_bank} value={b.id_bank}>
                  {b.nama}
                </option>
              ))}
            </PilihCari>
          </div>
          <div>
            <label className={LABEL} htmlFor="format-jenis">
              Jenis berkas
            </label>
            <select
              id="format-jenis"
              value={jenis}
              onChange={(e) =>
                setJenis(e.target.value as (typeof JENIS_BERKAS)[number])
              }
              className={INPUT}
            >
              {JENIS_BERKAS.map((j) => (
                <option key={j} value={j}>
                  {j.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {teks ? (
            <div>
              <label className={LABEL} htmlFor="format-pemisah">
                Pemisah kolom
              </label>
              <select
                id="format-pemisah"
                value={pemisah}
                onChange={(e) => setPemisah(e.target.value)}
                className={INPUT}
              >
                {PEMISAH.map((p) => (
                  <option key={p} value={p}>
                    {LABEL_PEMISAH[p]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className={LABEL} htmlFor="format-cakupan">
              Baris yang dimuat
            </label>
            <select
              id="format-cakupan"
              value={cakupan}
              onChange={(e) =>
                setCakupan(e.target.value as (typeof CAKUPAN)[number])
              }
              className={INPUT}
            >
              {CAKUPAN.map((c) => (
                <option key={c} value={c}>
                  {LABEL_CAKUPAN[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="format-berita">
              Panjang berita maksimal (opsional)
            </label>
            <input
              id="format-berita"
              type="number"
              min={1}
              max={MAKS_PANJANG_BERITA}
              value={maksBerita}
              onChange={(e) => setMaksBerita(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <Aktif
            id="format-judul"
            nilai={judul}
            ubah={setJudul}
            label="Baris judul kolom"
          />
          {teks ? (
            <>
              <Aktif
                id="format-kutip"
                nilai={kutip}
                ubah={setKutip}
                label="Teks diberi tanda kutip"
              />
              <Aktif
                id="format-desimal"
                nilai={desimal}
                ubah={setDesimal}
                label="Nominal dengan .00"
              />
            </>
          ) : null}
          <Aktif id="format-aktif" nilai={aktif} ubah={setAktif} />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-300">
            Kolom berkas, urut dari kiri
          </legend>
          {kolom.map((k, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: urutan kolom adalah identitasnya
              key={i}
              className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <select
                aria-label={`Isian kolom ${i + 1}`}
                value={k.isian}
                onChange={(e) =>
                  ubahKolom(i, { isian: e.target.value as IsianTransfer })
                }
                className={INPUT}
              >
                {ISIAN_TRANSFER.map((s) => (
                  <option key={s} value={s}>
                    {LABEL_ISIAN_TRANSFER[s]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Judul kolom ${i + 1}`}
                required
                maxLength={60}
                value={k.judul}
                onChange={(e) => ubahKolom(i, { judul: e.target.value })}
                className={INPUT}
              />
              {k.isian === "teks_tetap" ? (
                <input
                  aria-label={`Teks tetap kolom ${i + 1}`}
                  maxLength={100}
                  value={k.teks ?? ""}
                  onChange={(e) => ubahKolom(i, { teks: e.target.value })}
                  className={INPUT}
                />
              ) : (
                <span aria-hidden="true" />
              )}
              <span className="flex gap-1">
                <button
                  type="button"
                  className={TOMBOL}
                  aria-label={`Geser kolom ${i + 1} ke kiri`}
                  disabled={i === 0}
                  onClick={() => geser(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={TOMBOL}
                  aria-label={`Geser kolom ${i + 1} ke kanan`}
                  disabled={i === kolom.length - 1}
                  onClick={() => geser(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={TOMBOL}
                  aria-label={`Hapus kolom ${i + 1}`}
                  disabled={kolom.length === 1}
                  onClick={() => setKolom((x) => x.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
          <button
            type="button"
            className={TOMBOL}
            disabled={kolom.length >= MAKS_KOLOM_FORMAT}
            onClick={() =>
              setKolom((x) => [
                ...x,
                { isian: "nama_karyawan", judul: "Kolom", teks: null },
              ])
            }
          >
            Tambah kolom
          </button>
        </fieldset>
        <Tombol menyimpan={menyimpan} galat={galat} onClose={onClose} />
      </form>
    </Modal>
  );
}
