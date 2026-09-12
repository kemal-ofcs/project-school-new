"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { FeedbackBanner } from "@/components/ui/FeedbackBanner";
import { Modal } from "@/components/ui/Modal";
import { canAccessArea, hasPermission } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { getDaftarRombel } from "@/lib/gateways/academic";
import {
  daftarGelombangPmb,
  daftarPendaftarPmb,
  getBerkasPendaftarPmb,
  getDetailPendaftarPmb,
  hapusPendaftarPmb,
  jadikanSiswaDariPmb,
  type PmbFileContent,
  type PmbRegistrantDetail,
  type PmbRegistrantItem,
  type PmbWave,
  ubahStatusPendaftarPmb,
} from "@/lib/gateways/pmb";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { PMB_STATUS_MANUAL } from "@/types/pmb";

interface Rombel {
  id_rombel: string;
  nama_rombel: string;
}

/**
 * Tinjauan PMB di ponsel.
 *
 * Paritas penuh dengan halaman Desktop: meninjau pendaftar, membuka berkas satu
 * per satu, mengubah status verifikasi, menghapus, dan mengangkat pendaftar
 * menjadi siswa. Panitia PMB sering bertugas di meja pendaftaran dengan ponsel,
 * bukan laptop.
 *
 * Ketiga tabelnya CLOUD-ONLY, jadi halaman ini MENUNTUT JARINGAN — dan wajib
 * mengatakannya saat gagal, bukan menampilkan daftar kosong. Daftar kosong yang
 * sebenarnya kegagalan tidak bisa dibedakan dari "belum ada pendaftar", dan
 * panitia akan menyimpulkan yang salah tepat pada hari pendaftaran dibuka.
 *
 * `konten_base64` tidak pernah ikut daftar maupun detail: satu berkas sampai
 * 500 KB, dan halaman ini dibuka lewat paket data.
 */
export default function PmbMobilePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const isHydrated = useHydrated();
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const id = useId();

  const [galat, setGalat] = useState("");
  const [kabar, setKabar] = useState("");
  const [memuat, setMemuat] = useState(false);

  const [gelombang, setGelombang] = useState<PmbWave[]>([]);
  const [pendaftar, setPendaftar] = useState<PmbRegistrantItem[]>([]);
  const [rombel, setRombel] = useState<Rombel[]>([]);

  const [filterStatus, setFilterStatus] = useState("Semua");
  const [pencarian, setPencarian] = useState("");

  const [detail, setDetail] = useState<PmbRegistrantDetail | null>(null);
  const [berkasDibuka, setBerkasDibuka] = useState<PmbFileContent | null>(null);
  const [modalPromosi, setModalPromosi] = useState<PmbRegistrantItem | null>(
    null,
  );

  // Penjaga klik ganda. Paling mahal pada "Jadikan Siswa": dua permintaan
  // berarti dua baris `master_data`, dua kartu identitas, dan dua token QR
  // untuk satu anak.
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    // Mobile memakai static export dan TIDAK punya rute `/forbidden`.
    if (isHydrated && isAuthenticated && !canAccessArea(user, "pmb")) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, isHydrated, user, router]);

  const muatData = useCallback(async () => {
    setMemuat(true);
    setGalat("");
    try {
      const [hasilPendaftar, hasilGelombang] = await Promise.all([
        daftarPendaftarPmb({
          status: filterStatus,
          search: pencarian || null,
        }),
        daftarGelombangPmb(),
      ]);
      setPendaftar(hasilPendaftar.items);
      setGelombang(hasilGelombang.items);
    } catch (error) {
      setGalat(
        error instanceof Error
          ? `${error.message} — halaman PMB membaca data langsung dari cloud dan memerlukan jaringan.`
          : "Gagal memuat data PMB. Halaman ini memerlukan jaringan.",
      );
      setPendaftar([]);
    } finally {
      setMemuat(false);
    }
  }, [filterStatus, pencarian]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) void muatData();
  }, [authLoading, isAuthenticated, muatData]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      getDaftarRombel()
        .then((hasil) => setRombel(hasil as unknown as Rombel[]))
        .catch((error) => {
          // Rombel hanya dipakai modal promosi. Kegagalannya tidak menjatuhkan
          // halaman, tetapi tidak didiamkan: modalnya akan mengatakan kosong.
          console.error("[pmb] gagal memuat daftar rombel:", error);
        });
    }
  }, [authLoading, isAuthenticated]);

  const bukaDetail = useCallback(async (idPendaftar: string) => {
    setGalat("");
    try {
      setDetail(await getDetailPendaftarPmb(idPendaftar));
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Detail gagal dimuat.");
    }
  }, []);

  async function bukaBerkas(idBerkas: string) {
    setGalat("");
    try {
      setBerkasDibuka(await getBerkasPendaftarPmb(idBerkas));
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Berkas gagal dimuat.");
    }
  }

  async function ubahStatus(idPendaftar: string, status: string) {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat("");
    try {
      await ubahStatusPendaftarPmb({ idPendaftar, status });
      setKabar(`Status diubah menjadi "${status}".`);
      await muatData();
      if (detail?.pendaftar.id_pendaftar === idPendaftar) {
        setDetail(await getDetailPendaftarPmb(idPendaftar));
      }
    } catch (error) {
      setGalat(error instanceof Error ? error.message : "Status gagal diubah.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function hapusPendaftar(item: PmbRegistrantItem) {
    const setuju = await konfirmasi({
      title: "Hapus pendaftar ini?",
      description: (
        <>
          Seluruh berkas identitas <strong>{item.nama_lengkap}</strong> — kartu
          keluarga, akta kelahiran, ijazah — ikut terhapus permanen. Berkas itu
          diunggah keluarganya dan tidak tersimpan di tempat lain mana pun di
          sistem ini.
        </>
      ),
      preserved:
        "Gelombang pendaftaran dan data pendaftar lain tidak terpengaruh.",
      confirmLabel: "Hapus permanen",
      tone: "danger",
    });
    if (!setuju) return;

    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat("");
    try {
      await hapusPendaftarPmb(item.id_pendaftar);
      setKabar("Pendaftar dihapus.");
      setDetail(null);
      await muatData();
    } catch (error) {
      setGalat(
        error instanceof Error ? error.message : "Pendaftar gagal dihapus.",
      );
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function promosikan(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (!modalPromosi) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat("");

    try {
      const data = new FormData(peristiwa.currentTarget);
      await jadikanSiswaDariPmb({
        idPendaftar: modalPromosi.id_pendaftar,
        idRombel: String(data.get("idRombel") ?? "").trim(),
        angkatan: Number(data.get("angkatan") ?? 0) || null,
      });
      setKabar(`${modalPromosi.nama_lengkap} kini terdaftar sebagai siswa.`);
      setModalPromosi(null);
      setDetail(null);
      await muatData();
    } catch (error) {
      setGalat(
        error instanceof Error
          ? error.message
          : "Pendaftar gagal diangkat menjadi siswa.",
      );
    } finally {
      isSubmittingRef.current = false;
    }
  }

  if (authLoading || !isAuthenticated) {
    return (
      <MobileAppShell>
        <p className="text-slate-400 text-sm">Memuat…</p>
      </MobileAppShell>
    );
  }

  const bolehKelola = hasPermission(user, "pmb.manage");
  const bolehHapus = hasPermission(user, "pmb.delete");
  const bolehAngkat =
    hasPermission(user, "pmb.promote") &&
    hasPermission(user, "students.manage");

  return (
    <MobileAppShell>
      <div className="space-y-4 pb-24">
        <header>
          <h1 className="font-bold text-white text-xl">
            Penerimaan Peserta Didik Baru
          </h1>
          <p className="mt-1 text-slate-400 text-xs leading-relaxed">
            Meninjau calon siswa yang mendaftar lewat situs sekolah. Data PMB
            berada di cloud dan memerlukan jaringan.
          </p>
          {gelombang.length > 0 ? (
            <p className="mt-2 text-slate-500 text-xs">
              {gelombang.filter((g) => g.is_aktif).length > 0
                ? `Gelombang aktif: ${gelombang.find((g) => g.is_aktif)?.nama}`
                : "Tidak ada gelombang yang sedang dibuka."}
            </p>
          ) : null}
        </header>

        {galat ? (
          <FeedbackBanner
            message={galat}
            onClose={() => setGalat("")}
            type="error"
          />
        ) : null}
        {kabar ? (
          <FeedbackBanner
            message={kabar}
            onClose={() => setKabar("")}
            type="success"
          />
        ) : null}

        <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/95 p-4">
          <div>
            <label
              className="block text-slate-400 text-xs"
              htmlFor={`${id}-status`}
            >
              Filter status
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              id={`${id}-status`}
              onChange={(e) => setFilterStatus(e.target.value)}
              value={filterStatus}
            >
              <option value="Semua">Semua status</option>
              {PMB_STATUS_MANUAL.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
              <option value="Terdaftar">Terdaftar</option>
            </select>
          </div>
          <div>
            <label
              className="block text-slate-400 text-xs"
              htmlFor={`${id}-cari`}
            >
              Cari nama atau nomor pendaftaran
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              id={`${id}-cari`}
              onChange={(e) => setPencarian(e.target.value)}
              type="search"
              value={pencarian}
            />
          </div>
        </section>

        <section className="space-y-2">
          {memuat ? (
            <p className="text-slate-400 text-sm">Memuat pendaftar…</p>
          ) : pendaftar.length === 0 && !galat ? (
            <p className="rounded-2xl border border-white/10 border-dashed p-4 text-slate-400 text-sm">
              Belum ada pendaftar yang cocok dengan filter ini.
            </p>
          ) : (
            pendaftar.map((item) => (
              <button
                className="w-full rounded-2xl border border-white/10 bg-slate-900/95 p-4 text-left"
                key={item.id_pendaftar}
                onClick={() => void bukaDetail(item.id_pendaftar)}
                type="button"
              >
                <p className="font-mono text-slate-500 text-xs">
                  {item.nomor_pendaftaran}
                </p>
                <p className="mt-1 font-semibold text-sm text-white">
                  {item.nama_lengkap}
                </p>
                <p className="mt-1 text-slate-400 text-xs">
                  {item.nama_gelombang} · {item.jumlah_berkas} berkas ·{" "}
                  {item.status}
                </p>
              </button>
            ))
          )}
        </section>
      </div>

      <Modal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title={detail?.pendaftar.nama_lengkap ?? "Detail Pendaftar"}
      >
        {detail ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-y-1 text-slate-300 text-xs">
              <dt className="text-slate-500">Nomor</dt>
              <dd className="font-mono">
                {detail.pendaftar.nomor_pendaftaran}
              </dd>
              <dt className="text-slate-500">NISN</dt>
              <dd>{detail.pendaftar.nisn || "—"}</dd>
              <dt className="text-slate-500">Asal sekolah</dt>
              <dd>{detail.pendaftar.asal_sekolah || "—"}</dd>
              <dt className="text-slate-500">Wali</dt>
              <dd>{detail.pendaftar.nama_wali}</dd>
              <dt className="text-slate-500">WhatsApp</dt>
              <dd>{detail.pendaftar.no_whatsapp_wali}</dd>
              <dt className="text-slate-500">Status</dt>
              <dd>{detail.pendaftar.status}</dd>
            </dl>

            <div>
              <h2 className="font-semibold text-white text-xs uppercase">
                Berkas
              </h2>
              {detail.berkas.length === 0 ? (
                <p className="mt-1 text-slate-400 text-xs">
                  Tidak ada berkas diunggah.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {detail.berkas.map((berkas) => (
                    <li key={berkas.id_berkas}>
                      <button
                        className="w-full rounded-xl border border-white/15 px-3 py-2 text-left text-white text-xs"
                        onClick={() => void bukaBerkas(berkas.id_berkas)}
                        type="button"
                      >
                        {berkas.jenis} · {berkas.nama_file} (
                        {Math.round(berkas.ukuran_byte / 1024)} KB)
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {bolehKelola ? (
              <div>
                <label
                  className="block text-slate-400 text-xs"
                  htmlFor={`${id}-ubah-status`}
                >
                  Ubah status verifikasi
                </label>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  id={`${id}-ubah-status`}
                  onChange={(e) =>
                    void ubahStatus(
                      detail.pendaftar.id_pendaftar,
                      e.target.value,
                    )
                  }
                  value={detail.pendaftar.status}
                >
                  {PMB_STATUS_MANUAL.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              {bolehAngkat && detail.pendaftar.status === "Diterima" ? (
                <button
                  className="w-full rounded-xl bg-emerald-500 px-3 py-2.5 font-semibold text-slate-950 text-xs"
                  onClick={() => {
                    setModalPromosi(detail.pendaftar);
                    setDetail(null);
                  }}
                  type="button"
                >
                  Jadikan Siswa
                </button>
              ) : null}
              {bolehHapus && detail.pendaftar.status !== "Terdaftar" ? (
                <button
                  className="w-full rounded-xl border border-rose-500/40 px-3 py-2.5 text-rose-300 text-xs"
                  onClick={() => void hapusPendaftar(detail.pendaftar)}
                  type="button"
                >
                  Hapus Pendaftar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={berkasDibuka !== null}
        onClose={() => setBerkasDibuka(null)}
        title={berkasDibuka?.nama_file ?? "Berkas"}
      >
        {berkasDibuka ? (
          berkasDibuka.mime === "application/pdf" ? (
            <p className="text-slate-300 text-sm">
              Berkas PDF ({Math.round(berkasDibuka.ukuran_byte / 1024)} KB).
              Pratinjau PDF tidak tersedia di jendela ini.
            </p>
          ) : (
            // biome-ignore lint/performance/noImgElement: sumbernya data URI dari cloud, bukan aset statis yang bisa dioptimalkan
            <img
              alt={`Berkas ${berkasDibuka.jenis}`}
              className="w-full rounded-xl"
              src={`data:${berkasDibuka.mime};base64,${berkasDibuka.konten_base64}`}
            />
          )
        ) : null}
      </Modal>

      <Modal
        isOpen={modalPromosi !== null}
        onClose={() => setModalPromosi(null)}
        title="Jadikan Siswa"
      >
        <form className="space-y-4 text-sm" onSubmit={promosikan}>
          <p className="text-slate-300 text-xs leading-relaxed">
            {modalPromosi?.nama_lengkap} akan dibuatkan data induk, data siswa,
            kartu identitas, dan token QR absensi. Datanya tersebar ke seluruh
            perangkat lewat sinkronisasi.
          </p>
          <div>
            <label
              className="block text-slate-400 text-xs"
              htmlFor={`${id}-rombel`}
            >
              Rombel tujuan
            </label>
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
              id={`${id}-rombel`}
              name="idRombel"
              required
            >
              <option value="">Pilih rombel</option>
              {rombel.map((item) => (
                <option key={item.id_rombel} value={item.id_rombel}>
                  {item.nama_rombel}
                </option>
              ))}
            </select>
            {rombel.length === 0 ? (
              <p className="mt-1 text-amber-300 text-xs">
                Daftar rombel belum termuat. Pastikan jaringan tersedia lalu
                buka ulang jendela ini.
              </p>
            ) : null}
          </div>
          <div>
            <label
              className="block text-slate-400 text-xs"
              htmlFor={`${id}-angkatan`}
            >
              Angkatan
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white"
              defaultValue={new Date().getFullYear()}
              id={`${id}-angkatan`}
              name="angkatan"
              type="number"
            />
          </div>
          <button
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950"
            type="submit"
          >
            Buat data siswa
          </button>
        </form>
      </Modal>

      {dialogKonfirmasi}
    </MobileAppShell>
  );
}
