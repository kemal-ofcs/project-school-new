"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import { PilihCari } from "@/components/ui/PilihCari";
import { exportToExcel } from "@/lib/client/excel-export";
import { siapkanBerkas } from "@/lib/client/siapkan-berkas";
import {
  ambilBerkasSertifikat,
  type JenisDokumen,
  muatDokumen,
  muatPelatihan,
  muatRekapPelatihan,
  muatRincianPelatihan,
  muatRiwayatPelatihan,
  type OrgKepegawaian,
  simpanPelatihan,
  simpanPeserta,
  simpanSertifikat,
} from "@/lib/gateways/hris";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { MIME_BERKAS_SEKOLAH } from "@/lib/validations/berkas-sekolah";
import {
  type BerkasSertifikatBaris,
  type DaftarPelatihan,
  HASIL_PESERTA,
  type IsiBerkasSertifikat,
  JENIS_PENYELENGGARA,
  JENIS_SERTIFIKAT_BAWAAN,
  type PelatihanBaris,
  type PesertaBaris,
  type RekapPelatihan,
  type RincianPelatihan,
  type RiwayatPelatihan,
} from "@/lib/validations/hr-pelatihan";
import { MAKS_BERKAS_DOKUMEN, MAKS_BYTE_DOKUMEN } from "@/lib/validations/hris";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA, tgl } from "./gaya";
import { PratinjauBerkas } from "./PratinjauBerkas";
import { ModalBatal } from "./TabKontrak";

const BADGE = "rounded-full border border-white/10 px-2 py-0.5 text-xs";
const WARNA_STATUS: Record<string, string> = {
  Dijadwalkan: "text-sky-300",
  Berlangsung: "text-amber-200",
  Selesai: "text-emerald-300",
  Dibatalkan: "text-rose-300",
};
const kb = (byte: number) => Math.ceil(byte / 1024);
const rupiah = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
const rentang = (mulai: string, selesai: string) =>
  mulai === selesai ? tgl(mulai) : `${tgl(mulai)} s.d. ${tgl(selesai)}`;

function Galat({ teks }: { teks?: string | null }) {
  return teks ? (
    <p className="text-sm text-rose-300" role="alert">
      {teks}
    </p>
  ) : null;
}

/**
 * Tab Pelatihan (HRIS Fase 7c, §25.5): daftar per tahun, rincian dengan
 * peserta dan sertifikat, serta rekap jam per pegawai per tahun. Data khusus
 * cloud; status pelatihan diturunkan backend.
 */
export function TabPelatihan({
  org,
  bolehKelola,
  bolehJenisDokumen,
  onPesan,
  onGalat,
}: {
  org: OrgKepegawaian;
  bolehKelola: boolean;
  /** `hr.document.view` atau `hr.org.manage`: daftar jenis dokumen terbaca. */
  bolehJenisDokumen: boolean;
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
}) {
  const [tampilan, setTampilan] = useState<"daftar" | "rekap">("daftar");
  const [tahun, setTahun] = useState(() => String(new Date().getFullYear()));
  const tahunIni = new Date().getFullYear();
  const pilihanTahun = Array.from({ length: 7 }, (_, i) =>
    String(tahunIni + 1 - i),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex gap-2">
          <legend className="sr-only">Tampilan pelatihan</legend>
          {(
            [
              ["daftar", "Daftar pelatihan"],
              ["rekap", "Rekap jam"],
            ] as const
          ).map(([kunci, label]) => (
            <button
              key={kunci}
              type="button"
              aria-pressed={tampilan === kunci}
              onClick={() => setTampilan(kunci)}
              className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${
                tampilan === kunci
                  ? "bg-sky-700 text-on-accent"
                  : "border border-white/10 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <div>
          <label htmlFor="pelatihan-tahun" className={LABEL}>
            Tahun
          </label>
          <select
            id="pelatihan-tahun"
            value={tahun}
            onChange={(e) => setTahun(e.target.value)}
            className={INPUT}
          >
            {pilihanTahun.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      {tampilan === "daftar" ? (
        <DaftarPelatihanTahun
          key={tahun}
          tahun={tahun}
          org={org}
          bolehKelola={bolehKelola}
          bolehJenisDokumen={bolehJenisDokumen}
          onPesan={onPesan}
        />
      ) : (
        <RekapJam tahun={tahun} org={org} onPesan={onPesan} onGalat={onGalat} />
      )}
    </div>
  );
}

function DaftarPelatihanTahun({
  tahun,
  org,
  bolehKelola,
  bolehJenisDokumen,
  onPesan,
}: {
  tahun: string;
  org: OrgKepegawaian;
  bolehKelola: boolean;
  bolehJenisDokumen: boolean;
  onPesan: (pesan: string) => void;
}) {
  const [data, setData] = useState<DaftarPelatihan | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [sunting, setSunting] = useState<PelatihanBaris | "baru" | null>(null);
  const [buka, setBuka] = useState<string | null>(null);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatPelatihan(tahun));
      setGalatMuat(null);
    } catch (error) {
      setGalatMuat(pesanGalat(error));
    }
  }, [tahun]);

  useEffect(() => {
    void muat();
  }, [muat]);

  if (galatMuat) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300" role="alert">
          {galatMuat}
        </p>
        <button type="button" className={TOMBOL} onClick={() => void muat()}>
          Coba lagi
        </button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-slate-400">Memuat pelatihan…</p>;

  const dialog = sunting ? (
    <FormPelatihan
      awal={sunting === "baru" ? null : sunting}
      hariIni={data.hari_ini}
      menyimpan={menyimpan}
      galat={galatForm}
      onClose={() => {
        setSunting(null);
        setGalatForm(null);
      }}
      onSimpan={async (draft) => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setMenyimpan(true);
        setGalatForm(null);
        try {
          await simpanPelatihan({ aksi: "simpan", ...draft });
          onPesan(`Pelatihan "${draft.nama}" disimpan.`);
          setSunting(null);
          await muat();
        } catch (error) {
          setGalatForm(pesanGalat(error));
        } finally {
          isSubmittingRef.current = false;
          setMenyimpan(false);
        }
      }}
    />
  ) : buka ? (
    <RincianPelatihanModal
      idPelatihan={buka}
      org={org}
      bolehKelola={bolehKelola}
      bolehJenisDokumen={bolehJenisDokumen}
      onClose={() => setBuka(null)}
      onUbah={(p) => {
        setBuka(null);
        setSunting(p);
      }}
      onBerubah={muat}
    />
  ) : null;

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          {data.pelatihan.length} pelatihan yang mulai atau selesai di tahun{" "}
          {data.tahun}.
        </p>
        {bolehKelola ? (
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => setSunting("baru")}
          >
            Tambah pelatihan
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-900 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-3 py-2">Pelatihan</th>
              <th className="px-3 py-2">Tanggal</th>
              <th className="px-3 py-2">Jam</th>
              <th className="px-3 py-2">Peserta</th>
              <th className="px-3 py-2">Biaya</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.pelatihan.map((p) => (
              <tr key={p.id_pelatihan} className="text-slate-200">
                <td className="px-3 py-2">
                  <span className="font-semibold text-white">{p.nama}</span>
                  <span className="block text-xs text-slate-400">
                    {p.jenis_penyelenggara}
                    {p.penyelenggara ? ` · ${p.penyelenggara}` : ""}
                    {p.lokasi ? ` · ${p.lokasi}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {rentang(p.tanggal_mulai, p.tanggal_selesai)}
                </td>
                <td className="px-3 py-2">{p.jumlah_jam}</td>
                <td className="px-3 py-2">{p.jumlah_peserta}</td>
                <td className="px-3 py-2">{rupiah(p.biaya)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`${BADGE} ${WARNA_STATUS[p.status] ?? "text-slate-300"}`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    aria-label={`Rincian ${p.nama}`}
                    onClick={() => setBuka(p.id_pelatihan)}
                  >
                    Rincian
                  </button>
                </td>
              </tr>
            ))}
            {data.pelatihan.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-slate-400">
                  Belum ada pelatihan di tahun ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface IsianPelatihan {
  id_pelatihan: string;
  nama: string;
  jenis_penyelenggara: string;
  penyelenggara: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  lokasi: string;
  jumlah_jam: number;
  biaya: number;
  keterangan: string;
}

function FormPelatihan({
  awal,
  hariIni,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: {
  awal: PelatihanBaris | null;
  hariIni: string;
  menyimpan: boolean;
  galat: string | null;
  onClose: () => void;
  onSimpan: (draft: IsianPelatihan) => void;
}) {
  const [n, setN] = useState<IsianPelatihan>({
    id_pelatihan: awal?.id_pelatihan ?? "",
    nama: awal?.nama ?? "",
    jenis_penyelenggara: awal?.jenis_penyelenggara ?? "Internal",
    penyelenggara: awal?.penyelenggara ?? "",
    tanggal_mulai: awal?.tanggal_mulai ?? hariIni,
    tanggal_selesai: awal?.tanggal_selesai ?? hariIni,
    lokasi: awal?.lokasi ?? "",
    jumlah_jam: awal?.jumlah_jam ?? 1,
    biaya: awal?.biaya ?? 0,
    keterangan: awal?.keterangan ?? "",
  });
  const ubah = <K extends keyof IsianPelatihan>(k: K, v: IsianPelatihan[K]) =>
    setN((lama) => ({ ...lama, [k]: v }));
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan(n);
  };
  return (
    <Modal
      title={awal ? "Ubah pelatihan" : "Tambah pelatihan"}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-xl"
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={kirim}>
        <div className="sm:col-span-2">
          <label htmlFor="plt-nama" className={LABEL}>
            Nama pelatihan
          </label>
          <input
            id="plt-nama"
            required
            maxLength={150}
            value={n.nama}
            onChange={(e) => ubah("nama", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="plt-jenis" className={LABEL}>
            Jenis penyelenggara
          </label>
          <select
            id="plt-jenis"
            value={n.jenis_penyelenggara}
            onChange={(e) => ubah("jenis_penyelenggara", e.target.value)}
            className={INPUT}
          >
            {JENIS_PENYELENGGARA.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="plt-penyelenggara" className={LABEL}>
            Nama lembaga (opsional)
          </label>
          <input
            id="plt-penyelenggara"
            maxLength={100}
            value={n.penyelenggara}
            onChange={(e) => ubah("penyelenggara", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="plt-mulai" className={LABEL}>
            Tanggal mulai
          </label>
          <input
            id="plt-mulai"
            type="date"
            required
            value={n.tanggal_mulai}
            onChange={(e) => ubah("tanggal_mulai", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="plt-selesai" className={LABEL}>
            Tanggal selesai
          </label>
          <input
            id="plt-selesai"
            type="date"
            required
            min={n.tanggal_mulai}
            value={n.tanggal_selesai}
            onChange={(e) => ubah("tanggal_selesai", e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="plt-jam" className={LABEL}>
            Jam pelatihan per peserta
          </label>
          <input
            id="plt-jam"
            type="number"
            required
            min={1}
            max={1000}
            value={n.jumlah_jam}
            onChange={(e) => ubah("jumlah_jam", Number(e.target.value))}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="plt-biaya" className={LABEL}>
            Biaya total (Rp)
          </label>
          <input
            id="plt-biaya"
            type="number"
            min={0}
            max={1_000_000_000}
            value={n.biaya}
            onChange={(e) => ubah("biaya", Number(e.target.value))}
            className={INPUT}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="plt-lokasi" className={LABEL}>
            Lokasi (opsional)
          </label>
          <input
            id="plt-lokasi"
            maxLength={100}
            value={n.lokasi}
            onChange={(e) => ubah("lokasi", e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="plt-keterangan" className={LABEL}>
            Keterangan (opsional)
          </label>
          <textarea
            id="plt-keterangan"
            rows={3}
            maxLength={2000}
            value={n.keterangan}
            onChange={(e) => ubah("keterangan", e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className="text-xs text-slate-400 sm:col-span-2">
          Biaya hanya dicatat; pembukuannya tetap lewat jurnal manual.
        </p>
        <div className="sm:col-span-2">
          <Galat teks={galat} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

type SubPeserta =
  | { jenis: "batal" }
  | { jenis: "hasil"; peserta: PesertaBaris }
  | { jenis: "sertifikat"; peserta: PesertaBaris };

function RincianPelatihanModal({
  idPelatihan,
  org,
  bolehKelola,
  bolehJenisDokumen,
  onClose,
  onUbah,
  onBerubah,
}: {
  idPelatihan: string;
  org: OrgKepegawaian;
  bolehKelola: boolean;
  bolehJenisDokumen: boolean;
  onClose: () => void;
  onUbah: (pelatihan: PelatihanBaris) => void;
  onBerubah: () => Promise<void>;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const [data, setData] = useState<RincianPelatihan | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const [calon, setCalon] = useState<Set<string>>(() => new Set());
  const [cariCalon, setCariCalon] = useState("");
  const [dipilih, setDipilih] = useState<Set<string>>(() => new Set());
  const [sub, setSub] = useState<SubPeserta | null>(null);
  const [dibuka, setDibuka] = useState<IsiBerkasSertifikat | null>(null);
  const isSubmittingRef = useRef(false);

  const muat = useCallback(async () => {
    try {
      setData(await muatRincianPelatihan(idPelatihan));
      setGalatMuat(null);
    } catch (error) {
      setGalatMuat(pesanGalat(error));
    }
  }, [idPelatihan]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (
    kunci: string,
    aksi: () => Promise<string | null>,
    tulis = true,
  ) => {
    if (isSubmittingRef.current) return false;
    isSubmittingRef.current = true;
    setProses(kunci);
    setKabar(null);
    setGalat(null);
    try {
      const pesan = await aksi();
      if (tulis) await Promise.all([muat(), onBerubah()]);
      if (pesan) setKabar(pesan);
      return true;
    } catch (error) {
      setGalat(pesanGalat(error));
      return false;
    } finally {
      isSubmittingRef.current = false;
      setProses(null);
    }
  };

  const tutupSub = () => {
    setSub(null);
    setGalat(null);
  };

  if (sub?.jenis === "batal" && data) {
    return (
      <ModalBatal
        judul={`Batalkan "${data.pelatihan.nama}"?`}
        menyimpan={proses !== null}
        galat={galat}
        onClose={tutupSub}
        onBatal={async (alasan) => {
          if (
            await jalankan("batal", async () => {
              await simpanPelatihan({
                aksi: "batal",
                id_pelatihan: idPelatihan,
                alasan,
              });
              return "Pelatihan dibatalkan.";
            })
          )
            setSub(null);
        }}
      />
    );
  }
  if (sub?.jenis === "hasil") {
    return (
      <ModalHasil
        peserta={sub.peserta}
        menyimpan={proses !== null}
        galat={galat}
        onClose={tutupSub}
        onSimpan={async (hasil, catatan) => {
          if (
            await jalankan("hasil", async () => {
              await simpanPeserta({
                aksi: "hasil",
                id_peserta: sub.peserta.id_peserta,
                hasil,
                catatan,
              });
              return `Hasil ${sub.peserta.nama} disimpan.`;
            })
          )
            setSub(null);
        }}
      />
    );
  }
  if (sub?.jenis === "sertifikat") {
    return (
      <FormSertifikat
        peserta={sub.peserta}
        bolehJenisDokumen={bolehJenisDokumen}
        menyimpan={proses !== null}
        galat={galat}
        onClose={tutupSub}
        onSimpan={async (draft) => {
          if (
            await jalankan("sertifikat", async () => {
              await simpanSertifikat({
                aksi: "simpan",
                id_peserta: sub.peserta.id_peserta,
                ...draft,
              });
              return `Sertifikat ${sub.peserta.nama} disimpan. Berkasnya bisa diunggah sekarang.`;
            })
          )
            setSub(null);
        }}
      />
    );
  }

  const p = data?.pelatihan;
  const dibatalkan = p?.status === "Dibatalkan";
  const bolehUbah = bolehKelola && !dibatalkan;
  const sudah = new Set(data?.peserta.map((x) => x.id_karyawan));
  const calonPeserta = org.pegawai.filter(
    (x) => x.status_aktif === "Aktif" && !sudah.has(x.id_unik),
  );
  const jumlahPeserta = data?.peserta.length ?? 0;
  const kata = cariCalon.trim().toLowerCase();
  const calonTampil = kata
    ? calonPeserta.filter((x) =>
        `${x.nama} ${x.unit ?? ""}`.toLowerCase().includes(kata),
      )
    : calonPeserta;
  const pesertaDipilih = (data?.peserta ?? []).filter((x) =>
    dipilih.has(x.id_peserta),
  );
  const ubahPilihan = (
    set: (fn: (lama: Set<string>) => Set<string>) => void,
    ids: string[],
    pilih: boolean,
  ) =>
    set((lama) => {
      const baru = new Set(lama);
      for (const id of ids) {
        if (pilih) baru.add(id);
        else baru.delete(id);
      }
      return baru;
    });

  // Aksi peserta yang sudah ada dipanggil satu per satu: tanpa SQL baru, dan
  // yang gagal (mis. bersertifikat) dilaporkan per nama tanpa menahan sisanya.
  const massal = (
    kunci: string,
    daftar: { id: string; nama: string }[],
    satu: (id: string) => Promise<unknown>,
    kataKerja: string,
  ) =>
    jalankan(kunci, async () => {
      const gagal: string[] = [];
      for (const x of daftar) {
        try {
          await satu(x.id);
        } catch (error) {
          gagal.push(`${x.nama}: ${pesanGalat(error)}`);
        }
      }
      setCalon(new Set());
      setDipilih(new Set());
      if (gagal.length > 0)
        setGalat(`Gagal ${gagal.length}. ${gagal.join("; ")}`);
      const berhasil = daftar.length - gagal.length;
      return berhasil > 0 ? `${berhasil} peserta ${kataKerja}.` : null;
    });

  const unggah = (peserta: PesertaBaris, masukan: HTMLInputElement) => {
    const file = masukan.files?.[0];
    // Dikosongkan supaya memilih berkas yang sama lagi tetap memicu onChange.
    masukan.value = "";
    if (!file) return;
    void jalankan(`unggah-${peserta.id_peserta}`, async () => {
      const siap = await siapkanBerkas(file, MAKS_BYTE_DOKUMEN);
      if (!siap.ok) throw new Error(siap.pesan);
      await simpanSertifikat({
        aksi: "berkas_tambah",
        id_peserta: peserta.id_peserta,
        nama_berkas: siap.berkas.namaFile,
        mime_type: siap.berkas.mime,
        data_base64: siap.berkas.kontenBase64,
      });
      return `${siap.berkas.namaFile} tersimpan (${kb(siap.berkas.ukuranByte)} KB).`;
    });
  };

  const buang = async (
    judul: string,
    keterangan: string,
    kunci: string,
    aksi: () => Promise<unknown>,
  ) => {
    const setuju = await konfirmasi({
      title: judul,
      description: keterangan,
      confirmLabel: "Hapus",
      tone: "danger",
    });
    if (!setuju) return;
    await jalankan(kunci, async () => {
      await aksi();
      setDibuka(null);
      return null;
    });
  };

  return (
    <Modal
      title={p ? p.nama : "Rincian pelatihan"}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5 text-sm">
        {dialogKonfirmasi}
        {galatMuat ? (
          <div className="space-y-2">
            <p className="text-rose-300" role="alert">
              {galatMuat}
            </p>
            <button
              type="button"
              className={TOMBOL}
              onClick={() => void muat()}
            >
              Coba lagi
            </button>
          </div>
        ) : null}
        {!data && !galatMuat ? <p className="text-slate-400">Memuat…</p> : null}
        {kabar ? (
          <output className="block text-emerald-300">{kabar}</output>
        ) : null}
        <Galat teks={galat} />
        {p && data ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {(
                  [
                    ["Status", p.status],
                    [
                      "Penyelenggara",
                      `${p.jenis_penyelenggara}${p.penyelenggara ? ` · ${p.penyelenggara}` : ""}`,
                    ],
                    ["Tanggal", rentang(p.tanggal_mulai, p.tanggal_selesai)],
                    ["Lokasi", p.lokasi || "-"],
                    ["Jam per peserta", String(p.jumlah_jam)],
                    [
                      "Biaya",
                      jumlahPeserta > 0
                        ? `${rupiah(p.biaya)} · ${rupiah(Math.round(p.biaya / jumlahPeserta))} per peserta`
                        : rupiah(p.biaya),
                    ],
                    ["Keterangan", p.keterangan || "-"],
                    ...(dibatalkan
                      ? ([
                          [
                            "Dibatalkan",
                            `${p.dibatalkan_oleh}: ${p.alasan_batal}`,
                          ],
                        ] as const)
                      : []),
                  ] as const
                ).map(([label, nilai]) => (
                  <div key={label}>
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="whitespace-pre-line text-white">{nilai}</dd>
                  </div>
                ))}
              </dl>
              {bolehUbah ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => onUbah(p)}
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setSub({ jenis: "batal" })}
                  >
                    Batalkan
                  </button>
                </div>
              ) : null}
            </div>

            <section aria-labelledby="judul-peserta" className="space-y-3">
              <h3 id="judul-peserta" className="font-semibold text-white">
                Peserta ({jumlahPeserta})
              </h3>
              {bolehUbah ? (
                <fieldset className="space-y-2">
                  <legend className={LABEL}>
                    Tambah peserta (pegawai aktif)
                  </legend>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      aria-label="Cari calon peserta"
                      placeholder="Cari nama atau unit"
                      value={cariCalon}
                      onChange={(e) => setCariCalon(e.target.value)}
                      className={`${INPUT} min-w-48 flex-1`}
                    />
                    <button
                      type="button"
                      className={TOMBOL}
                      disabled={calonTampil.length === 0}
                      onClick={() =>
                        ubahPilihan(
                          setCalon,
                          calonTampil.map((x) => x.id_unik),
                          !calonTampil.every((x) => calon.has(x.id_unik)),
                        )
                      }
                    >
                      {calonTampil.length > 0 &&
                      calonTampil.every((x) => calon.has(x.id_unik))
                        ? "Batal pilih semua"
                        : "Pilih semua"}
                    </button>
                  </div>
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-2">
                    {calonTampil.length === 0 ? (
                      <li className="text-slate-400">
                        {calonPeserta.length === 0
                          ? "Semua pegawai aktif sudah menjadi peserta."
                          : "Tidak ada pegawai yang cocok."}
                      </li>
                    ) : null}
                    {calonTampil.map((x) => (
                      <li key={x.id_unik}>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={calon.has(x.id_unik)}
                            onChange={(e) =>
                              ubahPilihan(
                                setCalon,
                                [x.id_unik],
                                e.target.checked,
                              )
                            }
                          />
                          <span className="text-white">{x.nama}</span>
                          {x.unit ? (
                            <span className="text-slate-400">· {x.unit}</span>
                          ) : null}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    data-konfirmasi
                    className={TOMBOL_UTAMA}
                    disabled={proses !== null || calon.size === 0}
                    onClick={() =>
                      void massal(
                        "tambah",
                        calonPeserta
                          .filter((x) => calon.has(x.id_unik))
                          .map((x) => ({ id: x.id_unik, nama: x.nama })),
                        (id) =>
                          simpanPeserta({
                            aksi: "tambah",
                            id_pelatihan: idPelatihan,
                            id_karyawan: id,
                          }),
                        "ditambahkan",
                      )
                    }
                  >
                    Tambah {calon.size > 0 ? `${calon.size} ` : ""}peserta
                  </button>
                </fieldset>
              ) : null}
              {bolehKelola && jumlahPeserta > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={pesertaDipilih.length === jumlahPeserta}
                      onChange={(e) =>
                        ubahPilihan(
                          setDipilih,
                          data.peserta.map((x) => x.id_peserta),
                          e.target.checked,
                        )
                      }
                    />
                    Pilih semua peserta
                  </label>
                  <button
                    type="button"
                    data-konfirmasi
                    className={TOMBOL}
                    disabled={proses !== null || pesertaDipilih.length === 0}
                    onClick={() =>
                      void massal(
                        "lulus",
                        pesertaDipilih.map((x) => ({
                          id: x.id_peserta,
                          nama: x.nama,
                        })),
                        (id) =>
                          simpanPeserta({
                            aksi: "hasil",
                            id_peserta: id,
                            hasil: "Lulus",
                            // Catatan lama dipertahankan; aksi `hasil` menimpanya.
                            catatan:
                              data.peserta.find((x) => x.id_peserta === id)
                                ?.catatan ?? "",
                          }),
                        "ditandai Lulus",
                      )
                    }
                  >
                    Lulus ({pesertaDipilih.length})
                  </button>
                  <button
                    type="button"
                    className={TOMBOL}
                    disabled={proses !== null || pesertaDipilih.length === 0}
                    onClick={async () => {
                      const bisa = pesertaDipilih.filter((x) => !x.id_dokumen);
                      const bersertifikat = pesertaDipilih.length - bisa.length;
                      const setuju = await konfirmasi({
                        title: `Keluarkan ${bisa.length} peserta dari pelatihan?`,
                        description: `Baris pesertanya dihapus; riwayat pelatihan pegawainya ikut hilang.${bersertifikat > 0 ? ` ${bersertifikat} peserta bersertifikat dilewati; hapus sertifikatnya dulu bila memang harus keluar.` : ""}`,
                        confirmLabel: "Keluarkan",
                        tone: "danger",
                      });
                      if (!setuju || bisa.length === 0) return;
                      await massal(
                        "keluarkan",
                        bisa.map((x) => ({ id: x.id_peserta, nama: x.nama })),
                        (id) =>
                          simpanPeserta({ aksi: "lepas", id_peserta: id }),
                        "dikeluarkan",
                      );
                    }}
                  >
                    Keluarkan ({pesertaDipilih.length})
                  </button>
                </div>
              ) : null}
              <ul className="space-y-2">
                {data.peserta.map((x) => {
                  const berkas = data.berkas.filter(
                    (b) => b.id_dokumen === x.id_dokumen,
                  );
                  return (
                    <li
                      key={x.id_peserta}
                      className="space-y-2 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span>
                          {bolehKelola ? (
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${x.nama}`}
                              className="mr-2 align-middle"
                              checked={dipilih.has(x.id_peserta)}
                              onChange={(e) =>
                                ubahPilihan(
                                  setDipilih,
                                  [x.id_peserta],
                                  e.target.checked,
                                )
                              }
                            />
                          ) : null}
                          <span className="font-semibold text-white">
                            {x.nama}
                          </span>
                          <span className="text-slate-400">
                            {x.unit ? ` · ${x.unit}` : ""} ·{" "}
                            {x.hasil || "Hasil belum dicatat"}
                          </span>
                          {x.catatan ? (
                            <span className="block text-xs text-slate-400">
                              {x.catatan}
                            </span>
                          ) : null}
                        </span>
                        {bolehKelola ? (
                          <span className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={TOMBOL}
                              onClick={() =>
                                setSub({ jenis: "hasil", peserta: x })
                              }
                            >
                              Hasil
                            </button>
                            <button
                              type="button"
                              className={TOMBOL}
                              onClick={() =>
                                setSub({ jenis: "sertifikat", peserta: x })
                              }
                            >
                              {x.id_dokumen
                                ? "Ubah sertifikat"
                                : "Tambah sertifikat"}
                            </button>
                            {!x.id_dokumen ? (
                              <button
                                type="button"
                                className={TOMBOL}
                                disabled={proses !== null}
                                onClick={() =>
                                  void buang(
                                    `Lepas ${x.nama} dari pelatihan?`,
                                    "Baris peserta ini dihapus; riwayat pelatihan pegawainya ikut hilang.",
                                    `lepas-${x.id_peserta}`,
                                    () =>
                                      simpanPeserta({
                                        aksi: "lepas",
                                        id_peserta: x.id_peserta,
                                      }),
                                  )
                                }
                              >
                                Lepas
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      {x.id_dokumen ? (
                        <Sertifikat
                          peserta={x}
                          berkas={berkas}
                          bolehUbah={bolehKelola}
                          proses={proses}
                          onLihat={(id) =>
                            void jalankan(
                              id,
                              async () => {
                                setDibuka(await ambilBerkasSertifikat(id));
                                return null;
                              },
                              false,
                            )
                          }
                          onUnggah={(masukan) => unggah(x, masukan)}
                          onHapusBerkas={(b) =>
                            void buang(
                              `Hapus ${b.nama_berkas}?`,
                              "Berkas ini dihapus permanen; data sertifikatnya tetap.",
                              `hapus-${b.id_berkas}`,
                              () =>
                                simpanSertifikat({
                                  aksi: "berkas_hapus",
                                  id_peserta: x.id_peserta,
                                  id_berkas: b.id_berkas,
                                }),
                            )
                          }
                          onHapus={() =>
                            void buang(
                              `Hapus sertifikat ${x.nama}?`,
                              `Sertifikat dan ${berkas.length} berkasnya dihapus permanen, juga dari tab Dokumen pegawai.`,
                              `hapus-${x.id_dokumen}`,
                              () =>
                                simpanSertifikat({
                                  aksi: "hapus",
                                  id_peserta: x.id_peserta,
                                }),
                            )
                          }
                        />
                      ) : null}
                    </li>
                  );
                })}
                {data.peserta.length === 0 ? (
                  <li className="text-slate-400">Belum ada peserta.</li>
                ) : null}
              </ul>
              {dibuka ? (
                <PratinjauBerkas
                  berkas={dibuka}
                  onTutup={() => setDibuka(null)}
                />
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

function Sertifikat({
  peserta: x,
  berkas,
  bolehUbah,
  proses,
  onLihat,
  onUnggah,
  onHapusBerkas,
  onHapus,
}: {
  peserta: PesertaBaris;
  berkas: BerkasSertifikatBaris[];
  bolehUbah: boolean;
  proses: string | null;
  onLihat: (idBerkas: string) => void;
  onUnggah?: (masukan: HTMLInputElement) => void;
  onHapusBerkas?: (berkas: BerkasSertifikatBaris) => void;
  onHapus?: () => void;
}) {
  return (
    <div className="space-y-1 border-t border-white/10 pt-2 text-xs text-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Sertifikat {x.jenis_dokumen}
          {x.nomor ? ` · ${x.nomor}` : ""} · terbit {tgl(x.tanggal_terbit)}
          {x.tanggal_kedaluwarsa
            ? ` · berlaku s.d. ${tgl(x.tanggal_kedaluwarsa)}`
            : ""}
        </span>
        {bolehUbah ? (
          <span className="flex flex-wrap gap-2">
            {berkas.length < MAKS_BERKAS_DOKUMEN && onUnggah ? (
              <label
                className={`${TOMBOL} relative inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-sky-500 ${proses !== null ? "pointer-events-none opacity-60" : ""}`}
              >
                {proses === `unggah-${x.id_peserta}`
                  ? "Mengunggah..."
                  : "Unggah berkas"}
                <input
                  type="file"
                  accept={MIME_BERKAS_SEKOLAH.join(",")}
                  className="sr-only"
                  disabled={proses !== null}
                  onChange={(e) => onUnggah(e.currentTarget)}
                />
              </label>
            ) : null}
            {onHapus ? (
              <button
                type="button"
                className={TOMBOL}
                disabled={proses !== null}
                onClick={onHapus}
              >
                Hapus sertifikat
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      <ul className="space-y-1">
        {berkas.map((b) => (
          <li
            key={b.id_berkas}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="break-all">
              {b.nama_berkas} · {kb(b.ukuran_byte)} KB
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className={TOMBOL}
                disabled={proses !== null}
                onClick={() => onLihat(b.id_berkas)}
              >
                {proses === b.id_berkas ? "Memuat..." : "Lihat"}
              </button>
              {bolehUbah && onHapusBerkas ? (
                <button
                  type="button"
                  className={TOMBOL}
                  disabled={proses !== null}
                  onClick={() => onHapusBerkas(b)}
                >
                  Hapus berkas
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModalHasil({
  peserta,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: {
  peserta: PesertaBaris;
  menyimpan: boolean;
  galat: string | null;
  onClose: () => void;
  onSimpan: (hasil: string, catatan: string) => void;
}) {
  const [hasil, setHasil] = useState(peserta.hasil);
  const [catatan, setCatatan] = useState(peserta.catatan);
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan(hasil, catatan);
  };
  return (
    <Modal title={`Hasil ${peserta.nama}`} onClose={onClose} hideFooter>
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label htmlFor="hasil-peserta" className={LABEL}>
            Hasil
          </label>
          <select
            id="hasil-peserta"
            value={hasil}
            onChange={(e) => setHasil(e.target.value)}
            className={INPUT}
          >
            <option value="">Belum dicatat</option>
            {HASIL_PESERTA.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hasil-catatan" className={LABEL}>
            Catatan (opsional)
          </label>
          <textarea
            id="hasil-catatan"
            rows={2}
            maxLength={1000}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <p className="text-xs text-slate-400">
          Peserta Tidak Hadir tidak dihitung di rekap jam.
        </p>
        <Galat teks={galat} />
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FormSertifikat({
  peserta,
  bolehJenisDokumen,
  menyimpan,
  galat,
  onClose,
  onSimpan,
}: {
  peserta: PesertaBaris;
  bolehJenisDokumen: boolean;
  menyimpan: boolean;
  galat: string | null;
  onClose: () => void;
  onSimpan: (draft: {
    id_jenis: string;
    nomor: string;
    tanggal_terbit: string;
    tanggal_kedaluwarsa: string;
    catatan: string;
  }) => void;
}) {
  const [jenis, setJenis] = useState<JenisDokumen[]>([]);
  const [idJenis, setIdJenis] = useState(
    peserta.id_jenis || JENIS_SERTIFIKAT_BAWAAN,
  );
  const [nomor, setNomor] = useState(peserta.nomor);
  const [terbit, setTerbit] = useState(
    peserta.tanggal_terbit || peserta.tanggal_selesai,
  );
  const [kedaluwarsa, setKedaluwarsa] = useState(peserta.tanggal_kedaluwarsa);
  const [catatan, setCatatan] = useState(
    peserta.id_dokumen ? peserta.catatan_dokumen : peserta.nama_pelatihan,
  );
  useEffect(() => {
    // Daftar jenis butuh izin dokumen; tanpanya jenis bawaan yang dipakai.
    if (!bolehJenisDokumen) return;
    muatDokumen()
      .then((d) => setJenis(d.jenis))
      .catch(() => setJenis([]));
  }, [bolehJenisDokumen]);
  const pilihan = jenis.filter(
    (j) => j.is_aktif === 1 || j.id_jenis === idJenis,
  );
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan({
      id_jenis: idJenis,
      nomor,
      tanggal_terbit: terbit,
      tanggal_kedaluwarsa: kedaluwarsa,
      catatan,
    });
  };
  return (
    <Modal
      title={`Sertifikat ${peserta.nama}`}
      onClose={onClose}
      hideFooter
      maxWidth="max-w-xl"
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={kirim}>
        <div>
          <label htmlFor="srt-jenis" className={LABEL}>
            Jenis dokumen
          </label>
          {pilihan.length > 0 ? (
            <select
              id="srt-jenis"
              value={idJenis}
              onChange={(e) => setIdJenis(e.target.value)}
              className={INPUT}
            >
              {pilihan.map((j) => (
                <option key={j.id_jenis} value={j.id_jenis}>
                  {j.nama}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="srt-jenis"
              readOnly
              value={peserta.jenis_dokumen || "Sertifikat Pelatihan"}
              className={INPUT}
            />
          )}
        </div>
        <div>
          <label htmlFor="srt-nomor" className={LABEL}>
            Nomor (opsional)
          </label>
          <input
            id="srt-nomor"
            maxLength={80}
            value={nomor}
            onChange={(e) => setNomor(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="srt-terbit" className={LABEL}>
            Tanggal terbit
          </label>
          <input
            id="srt-terbit"
            type="date"
            required
            value={terbit}
            onChange={(e) => setTerbit(e.target.value)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="srt-kedaluwarsa" className={LABEL}>
            Berlaku sampai (opsional)
          </label>
          <input
            id="srt-kedaluwarsa"
            type="date"
            min={terbit}
            value={kedaluwarsa}
            onChange={(e) => setKedaluwarsa(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="srt-catatan" className={LABEL}>
            Catatan
          </label>
          <input
            id="srt-catatan"
            maxLength={500}
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            className={INPUT}
          />
        </div>
        <p className="text-xs text-slate-400 sm:col-span-2">
          Sertifikat tampil di tab Dokumen pegawai dan ikut pengingat
          kedaluwarsa. Berkas pindaian diunggah sesudah sertifikat tersimpan.
        </p>
        <div className="sm:col-span-2">
          <Galat teks={galat} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RekapJam({
  tahun,
  org,
  onPesan,
  onGalat,
}: {
  tahun: string;
  org: OrgKepegawaian;
  onPesan: (pesan: string) => void;
  onGalat: (pesan: string) => void;
}) {
  const [kelompok, setKelompok] = useState<"" | "Guru" | "Tendik">("");
  const [unit, setUnit] = useState("");
  const [data, setData] = useState<RekapPelatihan | null>(null);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const daftarUnit = [
    ...new Set(org.pegawai.map((p) => p.unit).filter(Boolean)),
  ].sort();

  useEffect(() => {
    let batal = false;
    setData(null);
    muatRekapPelatihan({ tahun, kelompok, unit })
      .then((r) => {
        if (!batal) {
          setData(r);
          setGalatMuat(null);
        }
      })
      .catch((error: unknown) => {
        if (!batal) setGalatMuat(pesanGalat(error));
      });
    return () => {
      batal = true;
    };
  }, [tahun, kelompok, unit]);

  const ekspor = async () => {
    if (!data) return;
    try {
      const hasil = await exportToExcel(
        `rekap-jam-pelatihan-${data.tahun}${unit ? `-${unit}` : ""}`,
        "Rekap Jam",
        [
          "Nama",
          "Kelompok",
          "Unit",
          "Jumlah pelatihan",
          "Total jam",
          ...JENIS_PENYELENGGARA.map((j) => `Jam ${j}`),
        ],
        data.rekap.map((r) => [
          r.nama,
          r.kelompok,
          r.unit,
          r.jumlah_pelatihan,
          r.total_jam,
          ...JENIS_PENYELENGGARA.map((j) => r.jam_per_jenis[j] ?? 0),
        ]),
      );
      if (!hasil.cancelled) {
        if (hasil.sukses) onPesan(`Rekap jam pelatihan ${data.tahun} diunduh.`);
        else onGalat("Berkas rekap gagal disimpan.");
      }
    } catch (error) {
      onGalat(pesanGalat(error));
    }
  };

  return (
    <div className="space-y-4">
      <form
        data-tanpa-konfirmasi
        onSubmit={(e) => e.preventDefault()}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <select
          aria-label="Saring guru atau tendik"
          value={kelompok}
          onChange={(e) =>
            setKelompok(e.target.value as "" | "Guru" | "Tendik")
          }
          className={INPUT}
        >
          <option value="">Guru dan tendik</option>
          <option value="Guru">Guru</option>
          <option value="Tendik">Tendik</option>
        </select>
        <PilihCari
          aria-label="Saring unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className={INPUT}
        >
          <option value="">Semua unit</option>
          {daftarUnit.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </PilihCari>
        <button
          type="button"
          className={TOMBOL}
          disabled={!data || data.rekap.length === 0}
          onClick={() => void ekspor()}
        >
          Ekspor Excel
        </button>
      </form>
      <p className="text-xs text-slate-400">
        Tahun dihitung dari tanggal selesai pelatihan. Yang dihitung hanya
        pelatihan yang tidak dibatalkan dan sudah selesai, tanpa peserta Tidak
        Hadir.
      </p>
      {galatMuat ? (
        <p className="text-sm text-rose-300" role="alert">
          {galatMuat}
        </p>
      ) : !data ? (
        <p className="text-sm text-slate-400">Memuat rekap…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2">Nama</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">Pelatihan</th>
                <th className="px-3 py-2">Total jam</th>
                {JENIS_PENYELENGGARA.map((j) => (
                  <th key={j} className="px-3 py-2">
                    {j}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.rekap.map((r) => (
                <tr key={r.id_karyawan} className="text-slate-200">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-white">{r.nama}</span>
                    <span className="block text-xs text-slate-400">
                      {r.kelompok}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.unit || "-"}</td>
                  <td className="px-3 py-2">{r.jumlah_pelatihan}</td>
                  <td className="px-3 py-2 font-semibold text-white">
                    {r.total_jam}
                  </td>
                  {JENIS_PENYELENGGARA.map((j) => (
                    <td key={j} className="px-3 py-2">
                      {r.jam_per_jenis[j] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
              {data.rekap.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + JENIS_PENYELENGGARA.length}
                    className="px-3 py-4 text-slate-400"
                  >
                    Belum ada jam pelatihan di tahun ini.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Tab Pelatihan di rincian pegawai (`hr.training.view`): baca saja. */
export function RiwayatPelatihanPegawai({
  idKaryawan,
}: {
  idKaryawan: string;
}) {
  const [data, setData] = useState<RiwayatPelatihan | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [proses, setProses] = useState<string | null>(null);
  const [dibuka, setDibuka] = useState<IsiBerkasSertifikat | null>(null);

  useEffect(() => {
    muatRiwayatPelatihan(idKaryawan)
      .then(setData)
      .catch((error: unknown) => setGalat(pesanGalat(error)));
  }, [idKaryawan]);

  const lihat = async (id: string) => {
    setProses(id);
    try {
      setDibuka(await ambilBerkasSertifikat(id));
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      setProses(null);
    }
  };

  if (!data && !galat) return <p className="text-sm text-slate-400">Memuat…</p>;
  return (
    <div className="space-y-3 text-sm">
      <Galat teks={galat} />
      {data ? (
        <ul className="space-y-2">
          {data.peserta.map((x) => (
            <li
              key={x.id_peserta}
              className="space-y-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2"
            >
              <span className="font-semibold text-white">
                {x.nama_pelatihan}
              </span>
              <span className="text-slate-400">
                {" "}
                · {x.jenis_penyelenggara} ·{" "}
                {rentang(x.tanggal_mulai, x.tanggal_selesai)} · {x.jumlah_jam}{" "}
                jam · {x.hasil || "hasil belum dicatat"}
                {x.dibatalkan_pada ? " · pelatihan dibatalkan" : ""}
              </span>
              {x.id_dokumen ? (
                <Sertifikat
                  peserta={x}
                  berkas={data.berkas.filter(
                    (b) => b.id_dokumen === x.id_dokumen,
                  )}
                  bolehUbah={false}
                  proses={proses}
                  onLihat={(id) => void lihat(id)}
                />
              ) : null}
            </li>
          ))}
          {data.peserta.length === 0 ? (
            <li className="text-slate-400">Belum pernah ikut pelatihan.</li>
          ) : null}
        </ul>
      ) : null}
      {dibuka ? (
        <PratinjauBerkas berkas={dibuka} onTutup={() => setDibuka(null)} />
      ) : null}
      <p className="text-xs text-slate-400">
        Pelatihan dan sertifikat dicatat di Kepegawaian → Pelatihan.
      </p>
    </div>
  );
}
