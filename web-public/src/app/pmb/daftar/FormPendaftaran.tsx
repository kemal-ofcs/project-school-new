"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import {
  PMB_BERKAS_MAX_BYTE,
  PMB_JENIS_BERKAS,
  PMB_MIME_BERKAS,
} from "@/lib/validations/pmb";

interface BerkasTerpilih {
  jenis: (typeof PMB_JENIS_BERKAS)[number];
  namaFile: string;
  mime: (typeof PMB_MIME_BERKAS)[number];
  ukuranByte: number;
  kontenBase64: string;
}

const LABEL_BERKAS: Record<(typeof PMB_JENIS_BERKAS)[number], string> = {
  kartu_keluarga: "Kartu Keluarga",
  akta_lahir: "Akta Kelahiran",
  ijazah: "Ijazah / SKL",
  rapor: "Rapor",
  foto: "Pas foto",
  lainnya: "Berkas lain",
};

type Kiriman =
  | { keadaan: "kosong" }
  | { keadaan: "mengirim" }
  | { keadaan: "berhasil"; nomor: string; gelombang: string }
  | { keadaan: "gagal"; pesan: string };

function bacaSebagaiBase64(berkas: File): Promise<string> {
  return new Promise((selesai, gagal) => {
    const pembaca = new FileReader();
    pembaca.onerror = () => gagal(new Error("Berkas tidak dapat dibaca."));
    pembaca.onload = () => {
      const hasil = String(pembaca.result ?? "");
      // `readAsDataURL` menghasilkan `data:<mime>;base64,<isi>`. Yang dikirim
      // hanya bagian isinya — awalannya akan membuat panjang stringnya melewati
      // batas validator tanpa menambah satu byte pun data yang berguna.
      selesai(hasil.slice(hasil.indexOf(",") + 1));
    };
    pembaca.readAsDataURL(berkas);
  });
}

export function FormPendaftaran({ jurusan }: { jurusan: string[] }) {
  const id = useId();
  const [berkas, setBerkas] = useState<BerkasTerpilih[]>([]);
  const [kiriman, setKiriman] = useState<Kiriman>({ keadaan: "kosong" });
  const [galatBerkas, setGalatBerkas] = useState<string | null>(null);

  /**
   * Penjaga klik ganda.
   *
   * `useRef`, bukan state: state baru terlihat setelah render berikutnya,
   * sehingga dua klik cepat pada tombol kirim sama-sama membaca `false` dan
   * mengirim dua pendaftaran. Aturan yang sama ditegakkan mesin di panel admin
   * lewat `audit:ui-guard`, dan berlaku di sini karena alasan yang identik —
   * hanya saja akibatnya lebih terlihat: dua nomor pendaftaran untuk satu anak.
   */
  const isSubmittingRef = useRef(false);

  async function pilihBerkas(
    jenis: (typeof PMB_JENIS_BERKAS)[number],
    daftar: FileList | null,
  ) {
    const dipilih = daftar?.[0];
    if (!dipilih) return;

    setGalatBerkas(null);

    if (dipilih.size > PMB_BERKAS_MAX_BYTE) {
      setGalatBerkas(
        `${LABEL_BERKAS[jenis]} berukuran ${Math.round(dipilih.size / 1024)} KB, melebihi batas ${Math.round(PMB_BERKAS_MAX_BYTE / 1024)} KB.`,
      );
      return;
    }

    if (!PMB_MIME_BERKAS.includes(dipilih.type as never)) {
      setGalatBerkas(
        `${LABEL_BERKAS[jenis]} harus berupa JPG, PNG, WEBP, atau PDF.`,
      );
      return;
    }

    try {
      const kontenBase64 = await bacaSebagaiBase64(dipilih);
      setBerkas((sebelumnya) => [
        ...sebelumnya.filter((item) => item.jenis !== jenis),
        {
          jenis,
          namaFile: dipilih.name.slice(0, 180),
          mime: dipilih.type as (typeof PMB_MIME_BERKAS)[number],
          ukuranByte: dipilih.size,
          kontenBase64,
        },
      ]);
    } catch (error) {
      // Tidak didiamkan: pengguna harus tahu berkasnya tidak jadi terlampir,
      // karena kalau tidak ia akan mengirim pendaftaran yang tampak lengkap di
      // layarnya dan tiba di panitia tanpa berkas.
      setGalatBerkas(
        error instanceof Error ? error.message : "Berkas tidak dapat dibaca.",
      );
    }
  }

  async function kirim(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setKiriman({ keadaan: "mengirim" });

    try {
      const data = new FormData(peristiwa.currentTarget);
      const ambil = (nama: string) => String(data.get(nama) ?? "").trim();

      const jawaban = await fetch("/api/pmb/daftar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          namaLengkap: ambil("namaLengkap"),
          nisn: ambil("nisn"),
          jenisKelamin: ambil("jenisKelamin"),
          tempatLahir: ambil("tempatLahir"),
          tanggalLahir: ambil("tanggalLahir"),
          asalSekolah: ambil("asalSekolah"),
          alamat: ambil("alamat"),
          namaWali: ambil("namaWali"),
          noWhatsappWali: ambil("noWhatsappWali"),
          emailWali: ambil("emailWali") || null,
          pilihanJurusan: ambil("pilihanJurusan"),
          berkas,
        }),
      });

      const isi = await jawaban.json();
      if (!jawaban.ok) {
        setKiriman({
          keadaan: "gagal",
          pesan: String(isi?.message ?? "Pendaftaran gagal dikirim."),
        });
        return;
      }

      setKiriman({
        keadaan: "berhasil",
        nomor: String(isi.nomorPendaftaran),
        gelombang: String(isi.namaGelombang ?? ""),
      });
    } catch (error) {
      console.error("[web-public] pengiriman pendaftaran gagal:", error);
      setKiriman({
        keadaan: "gagal",
        pesan:
          "Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.",
      });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  if (kiriman.keadaan === "berhasil") {
    return (
      <div className="rounded-lg border border-aksen p-6">
        <h2 className="font-semibold text-xl">Pendaftaran terkirim</h2>
        <p className="mt-3 text-sm text-teks-lembut leading-relaxed">
          Simpan nomor pendaftaran berikut. Nomor ini diperlukan untuk memeriksa
          status pendaftaran, dan tidak dikirim ulang lewat pesan apa pun.
        </p>
        <p className="mt-4 select-all rounded-md bg-latar-lembut px-4 py-3 font-mono font-semibold text-2xl tracking-wider">
          {kiriman.nomor}
        </p>
        {kiriman.gelombang ? (
          <p className="mt-3 text-sm text-teks-lembut">
            Gelombang: {kiriman.gelombang}
          </p>
        ) : null}
        <p className="mt-5 text-sm">
          <Link className="text-aksen hover:underline" href="/pmb/status">
            Periksa status pendaftaran
          </Link>
        </p>
      </div>
    );
  }

  const mengirim = kiriman.keadaan === "mengirim";

  return (
    <form className="space-y-8" onSubmit={kirim}>
      <fieldset className="space-y-4" disabled={mengirim}>
        <legend className="font-semibold text-lg">Data calon siswa</legend>

        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-nama`}
          >
            Nama lengkap
          </label>
          <input
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
            id={`${id}-nama`}
            maxLength={120}
            name="namaLengkap"
            required
            type="text"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-nisn`}
            >
              NISN <span className="text-xs">(opsional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              id={`${id}-nisn`}
              inputMode="numeric"
              maxLength={20}
              name="nisn"
              type="text"
            />
          </div>
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-kelamin`}
            >
              Jenis kelamin
            </label>
            <select
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              defaultValue=""
              id={`${id}-kelamin`}
              name="jenisKelamin"
              required
            >
              <option disabled value="">
                Pilih
              </option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-tempat-lahir`}
            >
              Tempat lahir
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              id={`${id}-tempat-lahir`}
              maxLength={80}
              name="tempatLahir"
              type="text"
            />
          </div>
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-tanggal-lahir`}
            >
              Tanggal lahir
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              id={`${id}-tanggal-lahir`}
              name="tanggalLahir"
              required
              type="date"
            />
          </div>
        </div>

        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-asal-sekolah`}
          >
            Asal sekolah
          </label>
          <input
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
            id={`${id}-asal-sekolah`}
            maxLength={120}
            name="asalSekolah"
            type="text"
          />
        </div>

        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-alamat`}
          >
            Alamat tempat tinggal
          </label>
          <textarea
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
            id={`${id}-alamat`}
            maxLength={255}
            name="alamat"
            rows={2}
          />
        </div>

        {jurusan.length > 0 ? (
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-jurusan`}
            >
              Pilihan program keahlian
            </label>
            <select
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              defaultValue=""
              id={`${id}-jurusan`}
              name="pilihanJurusan"
            >
              <option value="">Belum menentukan</option>
              {jurusan.map((nama) => (
                <option key={nama} value={nama}>
                  {nama}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4" disabled={mengirim}>
        <legend className="font-semibold text-lg">Data wali</legend>

        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-nama-wali`}
          >
            Nama orang tua / wali
          </label>
          <input
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
            id={`${id}-nama-wali`}
            maxLength={120}
            name="namaWali"
            required
            type="text"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-wa-wali`}
            >
              Nomor WhatsApp wali
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              id={`${id}-wa-wali`}
              inputMode="tel"
              name="noWhatsappWali"
              required
              type="tel"
            />
            <p className="mt-1 text-teks-lembut text-xs">
              Contoh: 081200000000. Nomor ini dipakai sekolah untuk menghubungi
              Anda.
            </p>
          </div>
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-email-wali`}
            >
              Surel wali <span className="text-xs">(opsional)</span>
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
              id={`${id}-email-wali`}
              maxLength={120}
              name="emailWali"
              type="email"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={mengirim}>
        <legend className="font-semibold text-lg">Berkas persyaratan</legend>
        <p className="text-sm text-teks-lembut leading-relaxed">
          Format JPG, PNG, WEBP, atau PDF. Maksimal{" "}
          {Math.round(PMB_BERKAS_MAX_BYTE / 1024)} KB per berkas. Berkas yang
          belum siap dapat menyusul lewat panitia.
        </p>

        {PMB_JENIS_BERKAS.filter((jenis) => jenis !== "lainnya").map(
          (jenis) => {
            const terlampir = berkas.find((item) => item.jenis === jenis);
            return (
              <div key={jenis}>
                <label
                  className="block text-sm text-teks-lembut"
                  htmlFor={`${id}-${jenis}`}
                >
                  {LABEL_BERKAS[jenis]}
                </label>
                <input
                  accept={PMB_MIME_BERKAS.join(",")}
                  className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-sm"
                  id={`${id}-${jenis}`}
                  name={`berkas-${jenis}`}
                  onChange={(peristiwa) =>
                    pilihBerkas(jenis, peristiwa.currentTarget.files)
                  }
                  type="file"
                />
                {terlampir ? (
                  <p className="mt-1 text-teks-lembut text-xs">
                    Terlampir: {terlampir.namaFile} (
                    {Math.round(terlampir.ukuranByte / 1024)} KB)
                  </p>
                ) : null}
              </div>
            );
          },
        )}

        {galatBerkas ? (
          <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm">
            {galatBerkas}
          </p>
        ) : null}
      </fieldset>

      {kiriman.keadaan === "gagal" ? (
        <p className="rounded-md border border-garis bg-latar-lembut p-4 text-sm leading-relaxed">
          {kiriman.pesan}
        </p>
      ) : null}

      <button
        className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks disabled:opacity-60 sm:w-auto"
        disabled={mengirim}
        type="submit"
      >
        {mengirim ? "Mengirim…" : "Kirim pendaftaran"}
      </button>
    </form>
  );
}
