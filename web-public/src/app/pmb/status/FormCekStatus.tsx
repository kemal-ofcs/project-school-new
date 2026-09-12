"use client";

import { useId, useRef, useState } from "react";

interface StatusPendaftaran {
  nomorPendaftaran: string;
  namaLengkap: string;
  status: string;
  catatanVerifikator: string | null;
  namaGelombang: string;
  tanggalDaftar: string;
  jumlahBerkas: number;
}

type Keadaan =
  | { jenis: "kosong" }
  | { jenis: "mencari" }
  | { jenis: "ketemu"; status: StatusPendaftaran }
  | { jenis: "gagal"; pesan: string };

/** Penjelasan tiap status, supaya pendaftar tahu apa yang harus dilakukan. */
const ARTI_STATUS: Record<string, string> = {
  Baru: "Pendaftaran sudah masuk dan menunggu pemeriksaan berkas oleh panitia.",
  "Berkas Lengkap": "Berkas Anda lengkap dan sedang diverifikasi.",
  Terverifikasi: "Berkas sudah diverifikasi. Menunggu keputusan panitia.",
  Diterima:
    "Selamat, pendaftaran Anda diterima. Silakan hubungi sekolah untuk langkah berikutnya.",
  Ditolak:
    "Pendaftaran tidak dapat dilanjutkan. Silakan hubungi sekolah untuk penjelasannya.",
  Dibatalkan: "Pendaftaran ini dibatalkan.",
  Terdaftar:
    "Anda sudah terdaftar sebagai siswa. Silakan hubungi sekolah bila ada pertanyaan.",
};

export function FormCekStatus({ mode }: { mode: "otp" | "tanggal_lahir" }) {
  const id = useId();
  const [keadaan, setKeadaan] = useState<Keadaan>({ jenis: "kosong" });
  const [kodeTerkirim, setKodeTerkirim] = useState<string | null>(null);

  /**
   * Minta kode ke nomor wali yang dicatat saat mendaftar.
   *
   * Hanya dipakai pada mode `otp`. Modenya ditentukan server — lihat
   * `pilihModeCekStatus` — karena jalur cadangan tanggal lahir harus tetap ada
   * untuk sekolah yang belum menyambungkan gateway WhatsApp. Tanpa cadangan
   * itu, situs PMB akan menerima pendaftaran tetapi tidak pernah bisa
   * memberitahu hasilnya.
   */
  async function mintaKode() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setKeadaan({ jenis: "mencari" });
    try {
      const nomor = (
        document.getElementById(`${id}-nomor`) as HTMLInputElement | null
      )?.value?.trim();
      const jawaban = await fetch("/api/pmb/status/minta-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomorPendaftaran: nomor }),
      });
      const isi = await jawaban.json();
      if (!jawaban.ok) {
        setKeadaan({
          jenis: "gagal",
          pesan: String(isi?.message ?? "Kode gagal dikirim."),
        });
        return;
      }
      setKodeTerkirim(
        isi.nomorTersamar
          ? `Kode dikirim ke ${isi.nomorTersamar}.`
          : "Jika nomor pendaftaran tersebut terdaftar, kode telah dikirim ke nomor WhatsApp wali.",
      );
      setKeadaan({ jenis: "kosong" });
    } catch (error) {
      console.error("[web-public] permintaan kode status gagal:", error);
      setKeadaan({
        jenis: "gagal",
        pesan: "Tidak dapat menghubungi server. Periksa koneksi Anda.",
      });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // Penjaga klik ganda, `useRef` bukan state — state baru terlihat setelah
  // render berikutnya, sehingga dua klik cepat sama-sama membaca `false`. Di
  // sini akibatnya bukan data ganda melainkan jatah rate limit yang habis dua
  // kali lebih cepat daripada yang diniatkan.
  const isSubmittingRef = useRef(false);

  async function cari(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setKeadaan({ jenis: "mencari" });

    try {
      const data = new FormData(peristiwa.currentTarget);
      const jawaban = await fetch("/api/pmb/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nomorPendaftaran: String(data.get("nomorPendaftaran") ?? "").trim(),
          tanggalLahir: String(data.get("tanggalLahir") ?? "").trim(),
          kode: String(data.get("kode") ?? "").trim(),
        }),
      });

      const isi = await jawaban.json();
      if (!jawaban.ok) {
        setKeadaan({
          jenis: "gagal",
          pesan: String(isi?.message ?? "Pendaftaran tidak ditemukan."),
        });
        return;
      }

      setKeadaan({ jenis: "ketemu", status: isi.status });
    } catch (error) {
      console.error("[web-public] cek status gagal:", error);
      setKeadaan({
        jenis: "gagal",
        pesan:
          "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.",
      });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  const mencari = keadaan.jenis === "mencari";

  return (
    <div className="space-y-8">
      <form className="space-y-4" onSubmit={cari}>
        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-nomor`}
          >
            Nomor pendaftaran
          </label>
          <input
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 font-mono tracking-wider"
            disabled={mencari}
            id={`${id}-nomor`}
            maxLength={40}
            name="nomorPendaftaran"
            placeholder="PMB-2026-XXXXXX"
            required
            type="text"
          />
        </div>

        {mode === "otp" ? (
          <>
            <button
              className="rounded-md border border-garis px-4 py-2 text-sm disabled:opacity-60"
              disabled={mencari}
              onClick={mintaKode}
              type="button"
            >
              Kirim kode ke WhatsApp wali
            </button>
            {kodeTerkirim ? (
              <p className="text-sm text-teks-lembut leading-relaxed">
                {kodeTerkirim}
              </p>
            ) : null}
            <div>
              <label
                className="block text-sm text-teks-lembut"
                htmlFor={`${id}-kode`}
              >
                Kode enam digit
              </label>
              <input
                autoComplete="one-time-code"
                className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-center font-mono text-xl tracking-[0.4em]"
                disabled={mencari}
                id={`${id}-kode`}
                inputMode="numeric"
                maxLength={6}
                name="kode"
                pattern="[0-9]{6}"
                required
                type="text"
              />
            </div>
          </>
        ) : (
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-tanggal`}
            >
              Tanggal lahir calon siswa
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              disabled={mencari}
              id={`${id}-tanggal`}
              name="tanggalLahir"
              required
              type="date"
            />
          </div>
        )}

        <button
          className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks disabled:opacity-60 sm:w-auto"
          disabled={mencari}
          type="submit"
        >
          {mencari ? "Mencari…" : "Periksa status"}
        </button>
      </form>

      {keadaan.jenis === "gagal" ? (
        <p className="rounded-md border border-garis bg-latar-lembut p-4 text-sm leading-relaxed">
          {keadaan.pesan}
        </p>
      ) : null}

      {keadaan.jenis === "ketemu" ? (
        <div className="rounded-lg border border-garis p-6">
          <p className="font-mono text-sm text-teks-lembut tracking-wider">
            {keadaan.status.nomorPendaftaran}
          </p>
          <h2 className="mt-1 font-semibold text-xl">
            {keadaan.status.namaLengkap}
          </h2>

          <p className="mt-4 inline-block rounded-full bg-aksen px-3 py-1 font-medium text-aksen-teks text-sm">
            {keadaan.status.status}
          </p>
          <p className="mt-3 text-sm text-teks-lembut leading-relaxed">
            {ARTI_STATUS[keadaan.status.status] ??
              "Silakan hubungi sekolah untuk penjelasan status ini."}
          </p>

          {keadaan.status.catatanVerifikator ? (
            <div className="mt-5 rounded-md bg-latar-lembut p-4">
              <p className="font-medium text-sm">Catatan panitia</p>
              <p className="mt-1 text-sm text-teks-lembut leading-relaxed">
                {keadaan.status.catatanVerifikator}
              </p>
            </div>
          ) : null}

          <dl className="mt-5 space-y-1 text-sm text-teks-lembut">
            {keadaan.status.namaGelombang ? (
              <div className="flex gap-2">
                <dt>Gelombang:</dt>
                <dd>{keadaan.status.namaGelombang}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt>Berkas terlampir:</dt>
              <dd>{keadaan.status.jumlahBerkas}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
