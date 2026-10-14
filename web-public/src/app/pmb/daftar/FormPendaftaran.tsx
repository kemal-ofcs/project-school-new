"use client";

import Link from "next/link";
import {
  type InputHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  PMB_BERKAS_MAX_BYTE,
  PMB_JENIS_BERKAS,
  PMB_MIME_BERKAS,
} from "@/lib/validations/pmb";
import {
  AGAMA,
  ALAT_TRANSPORTASI,
  JENIS_TINGGAL,
  JENJANG_PENDIDIKAN,
  KEBUTUHAN_KHUSUS,
  KUNCI_DATA_DAPODIK,
  PEKERJAAN,
  PENGHASILAN,
} from "@/lib/validations/pmb-dapodik";

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

const LANGKAH = [
  "Calon siswa",
  "Alamat",
  "Orang tua & wali",
  "Bantuan & kesehatan",
  "Berkas & kirim",
] as const;

/**
 * Draf isian disimpan di `sessionStorage`, bukan `localStorage`: draf tetap
 * selamat bila halaman dimuat ulang, tetapi NIK anak dan orang tua tidak
 * tertinggal di komputer bersama (warnet, komputer sekolah) setelah tab ditutup.
 */
const KUNCI_DRAF = "kos.pmb.draf";

type Kiriman =
  | { keadaan: "kosong" }
  | { keadaan: "mengirim" }
  | { keadaan: "berhasil"; nomor: string; gelombang: string }
  | { keadaan: "gagal"; pesan: string; rincian: string[] };

const KELAS_ISIAN =
  "mt-1 w-full min-h-11 rounded-md border border-garis bg-latar px-3 py-2";

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

function Label({
  htmlFor,
  wajib,
  children,
}: {
  htmlFor: string;
  wajib?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm text-teks-lembut" htmlFor={htmlFor}>
      {children}
      {wajib ? null : <span className="text-xs"> (opsional)</span>}
    </label>
  );
}

function Isian({
  label,
  name,
  wajib = false,
  bantuan,
  ...lain
}: {
  label: string;
  name: string;
  wajib?: boolean;
  bantuan?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} wajib={wajib}>
        {label}
      </Label>
      <input
        className={KELAS_ISIAN}
        id={id}
        name={name}
        required={wajib}
        type="text"
        {...lain}
      />
      {bantuan ? (
        <p className="mt-1 text-teks-lembut text-xs">{bantuan}</p>
      ) : null}
    </div>
  );
}

function Pilihan({
  label,
  name,
  daftar,
  wajib = false,
  bawaan = "",
}: {
  label: string;
  name: string;
  daftar: readonly string[];
  wajib?: boolean;
  bawaan?: string;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} wajib={wajib}>
        {label}
      </Label>
      <select
        className={KELAS_ISIAN}
        defaultValue={bawaan}
        id={id}
        name={name}
        required={wajib}
      >
        {bawaan ? null : <option value="">Pilih</option>}
        {daftar.map((nilai) => (
          <option key={nilai} value={nilai}>
            {nilai}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Enam isian yang sama untuk ayah, ibu, dan wali. */
function OrangTua({
  awalan,
  judul,
  namaWajib = false,
  aksi,
}: {
  awalan: "ayah" | "ibu" | "wali";
  judul: string;
  namaWajib?: boolean;
  aksi?: ReactNode;
}) {
  const tahunIni = new Date().getFullYear();
  return (
    <div className="space-y-4 rounded-lg border border-garis p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{judul}</h3>
        {aksi}
      </div>
      <Isian
        label={namaWajib ? "Nama ibu kandung" : "Nama"}
        maxLength={120}
        name={`${awalan}Nama`}
        wajib={namaWajib}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Isian
          inputMode="numeric"
          label="Tahun lahir"
          max={tahunIni}
          min={1900}
          name={`${awalan}TahunLahir`}
          type="number"
        />
        <Isian
          inputMode="numeric"
          label="NIK"
          maxLength={16}
          name={`${awalan}Nik`}
          pattern="\d{16}"
          title="16 angka sesuai KTP"
        />
      </div>
      <Pilihan
        daftar={JENJANG_PENDIDIKAN}
        label="Pendidikan terakhir"
        name={`${awalan}Pendidikan`}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Pilihan
          daftar={PEKERJAAN}
          label="Pekerjaan"
          name={`${awalan}Pekerjaan`}
        />
        <Pilihan
          daftar={PENGHASILAN}
          label="Penghasilan per bulan"
          name={`${awalan}Penghasilan`}
        />
      </div>
    </div>
  );
}

export function FormPendaftaran({ jurusan }: { jurusan: string[] }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [langkah, setLangkah] = useState(0);
  const [ringkasan, setRingkasan] = useState<[string, string][]>([]);
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

  // Pulihkan draf saat halaman dibuka ulang di tab yang sama.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const draf = JSON.parse(sessionStorage.getItem(KUNCI_DRAF) ?? "{}");
      for (const [nama, nilai] of Object.entries(draf)) {
        const elemen = form.elements.namedItem(nama);
        if (
          elemen instanceof HTMLInputElement ||
          elemen instanceof HTMLSelectElement ||
          elemen instanceof HTMLTextAreaElement
        ) {
          if (elemen.type !== "file") elemen.value = String(nilai);
        }
      }
    } catch {
      // Penyimpanan diblokir atau draf rusak: formulir tetap bisa diisi.
    }
  }, []);

  function simpanDraf() {
    const form = formRef.current;
    if (!form) return;
    try {
      const draf: Record<string, string> = {};
      for (const [nama, nilai] of new FormData(form)) {
        if (typeof nilai === "string") draf[nama] = nilai;
      }
      sessionStorage.setItem(KUNCI_DRAF, JSON.stringify(draf));
    } catch {
      // Tanpa penyimpanan, draf hanya hidup selama halaman terbuka.
    }
  }

  function bagianLangkah(indeks: number) {
    return formRef.current?.querySelector<HTMLFieldSetElement>(
      `fieldset[data-langkah="${indeks}"]`,
    );
  }

  /** Validasi bawaan browser untuk satu langkah; fokus ke isian pertama yang salah. */
  function langkahSah(indeks: number): boolean {
    const bagian = bagianLangkah(indeks);
    if (!bagian) return true;
    for (const elemen of Array.from(bagian.elements)) {
      if (
        (elemen instanceof HTMLInputElement ||
          elemen instanceof HTMLSelectElement ||
          elemen instanceof HTMLTextAreaElement) &&
        !elemen.checkValidity()
      ) {
        elemen.reportValidity();
        return false;
      }
    }
    return true;
  }

  function pindah(ke: number) {
    if (ke === LANGKAH.length - 1) setRingkasan(susunRingkasan());
    setLangkah(ke);
    formRef.current?.scrollIntoView({ block: "start" });
  }

  function lanjut() {
    if (langkahSah(langkah)) pindah(langkah + 1);
  }

  function susunRingkasan(): [string, string][] {
    const form = formRef.current;
    if (!form) return [];
    const data = new FormData(form);
    const ambil = (nama: string) => String(data.get(nama) ?? "").trim() || "—";
    return [
      ["Nama", ambil("namaLengkap")],
      ["Tanggal lahir", ambil("tanggalLahir")],
      ["NIK", ambil("nik")],
      [
        "Alamat",
        `${ambil("alamat")}, ${ambil("kelurahan")}, ${ambil("kecamatan")}`,
      ],
      ["Nama ibu kandung", ambil("ibuNama")],
      ["WhatsApp orang tua/wali", ambil("noWhatsappWali")],
    ];
  }

  function salinKeWali(dari: "ayah" | "ibu") {
    const form = formRef.current;
    if (!form) return;
    for (const akhiran of [
      "Nama",
      "TahunLahir",
      "Nik",
      "Pendidikan",
      "Pekerjaan",
      "Penghasilan",
    ]) {
      const asal = form.elements.namedItem(`${dari}${akhiran}`);
      const tujuan = form.elements.namedItem(`wali${akhiran}`);
      if (
        (asal instanceof HTMLInputElement ||
          asal instanceof HTMLSelectElement) &&
        (tujuan instanceof HTMLInputElement ||
          tujuan instanceof HTMLSelectElement)
      ) {
        tujuan.value = asal.value;
      }
    }
    simpanDraf();
  }

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

    // Langkah yang salah dibuka lagi, lalu isiannya ditunjuk.
    for (let indeks = 0; indeks < LANGKAH.length; indeks++) {
      const bagian = bagianLangkah(indeks);
      const salah = bagian
        ? Array.from(bagian.elements).find(
            (elemen) =>
              (elemen instanceof HTMLInputElement ||
                elemen instanceof HTMLSelectElement ||
                elemen instanceof HTMLTextAreaElement) &&
              !elemen.checkValidity(),
          )
        : undefined;
      if (salah) {
        setLangkah(indeks);
        setTimeout(() => (salah as HTMLInputElement).reportValidity(), 0);
        return;
      }
    }

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
          dataDapodik: Object.fromEntries(
            KUNCI_DATA_DAPODIK.map((kunci) => [kunci, ambil(kunci)]),
          ),
        }),
      });

      const isi = await jawaban.json();
      if (!jawaban.ok) {
        const rincian = Array.isArray(isi?.detail)
          ? isi.detail.map((d: { message?: string }) => String(d.message ?? ""))
          : [];
        setKiriman({
          keadaan: "gagal",
          pesan: String(isi?.message ?? "Pendaftaran gagal dikirim."),
          rincian: rincian.filter(Boolean),
        });
        return;
      }

      try {
        sessionStorage.removeItem(KUNCI_DRAF);
      } catch {
        // Draf yang tersisa akan hilang sendiri saat tab ditutup.
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
        rincian: [],
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
  const terakhir = langkah === LANGKAH.length - 1;

  return (
    <form
      // Header situs lengket setinggi ±72px; tanpa jarak ini judul langkah
      // tertutup header setiap kali pindah langkah.
      className="scroll-mt-24 space-y-8"
      noValidate
      onInput={simpanDraf}
      onSubmit={kirim}
      ref={formRef}
    >
      <nav aria-label="Langkah pendaftaran">
        <p className="text-sm text-teks-lembut">
          Langkah {langkah + 1} dari {LANGKAH.length}
        </p>
        <ol className="mt-2 flex gap-1.5">
          {LANGKAH.map((nama, indeks) => (
            <li
              aria-current={indeks === langkah ? "step" : undefined}
              className={`h-1.5 flex-1 rounded-full ${indeks <= langkah ? "bg-aksen" : "bg-garis"}`}
              key={nama}
              title={nama}
            >
              <span className="sr-only">{nama}</span>
            </li>
          ))}
        </ol>
        <h2 className="mt-4 font-semibold text-xl">{LANGKAH[langkah]}</h2>
      </nav>

      <fieldset
        className="space-y-4"
        data-langkah="0"
        disabled={mengirim}
        hidden={langkah !== 0}
      >
        <legend className="sr-only">{LANGKAH[0]}</legend>
        <Isian label="Nama lengkap" maxLength={120} name="namaLengkap" wajib />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${id}-kelamin`} wajib>
              Jenis kelamin
            </Label>
            <select
              className={KELAS_ISIAN}
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
          <Pilihan daftar={AGAMA} label="Agama" name="agama" wajib />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian
            bantuan="16 angka, tertera di Kartu Keluarga."
            inputMode="numeric"
            label="NIK calon siswa"
            maxLength={16}
            name="nik"
            pattern="\d{16}"
            title="16 angka sesuai Kartu Keluarga"
            wajib
          />
          <Isian inputMode="numeric" label="NISN" maxLength={20} name="nisn" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian label="Tempat lahir" maxLength={80} name="tempatLahir" wajib />
          <Isian label="Tanggal lahir" name="tanggalLahir" type="date" wajib />
        </div>
        <Isian
          label="No registrasi akta lahir"
          maxLength={40}
          name="noAktaLahir"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian
            inputMode="numeric"
            label="Anak ke-"
            max={20}
            min={1}
            name="anakKe"
            type="number"
          />
          <Isian
            inputMode="numeric"
            label="Jumlah saudara kandung"
            max={20}
            min={0}
            name="jumlahSaudara"
            type="number"
          />
        </div>
        <Pilihan
          bawaan="Tidak ada"
          daftar={KEBUTUHAN_KHUSUS}
          label="Kebutuhan khusus"
          name="kebutuhanKhusus"
          wajib
        />
        <Isian label="Sekolah asal" maxLength={120} name="asalSekolah" />
        {jurusan.length > 0 ? (
          <div>
            <Label htmlFor={`${id}-jurusan`}>Pilihan program keahlian</Label>
            <select
              className={KELAS_ISIAN}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian
            inputMode="tel"
            label="Nomor HP calon siswa"
            name="hpSiswa"
            type="tel"
          />
          <Isian
            label="Email calon siswa"
            maxLength={120}
            name="emailSiswa"
            type="email"
          />
        </div>
      </fieldset>

      <fieldset
        className="space-y-4"
        data-langkah="1"
        disabled={mengirim}
        hidden={langkah !== 1}
      >
        <legend className="sr-only">{LANGKAH[1]}</legend>
        <Isian
          bantuan="Nama jalan, blok, dan nomor rumah."
          label="Alamat"
          maxLength={255}
          name="alamat"
          wajib
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Isian
            inputMode="numeric"
            label="RT"
            maxLength={3}
            name="rt"
            pattern="\d{1,3}"
          />
          <Isian
            inputMode="numeric"
            label="RW"
            maxLength={3}
            name="rw"
            pattern="\d{1,3}"
          />
          <div className="col-span-2">
            <Isian label="Dusun" maxLength={80} name="dusun" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian
            label="Kelurahan / desa"
            maxLength={80}
            name="kelurahan"
            wajib
          />
          <Isian label="Kecamatan" maxLength={80} name="kecamatan" wajib />
        </div>
        <Isian
          inputMode="numeric"
          label="Kode pos"
          maxLength={5}
          name="kodePos"
          pattern="\d{5}"
          title="5 angka"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Pilihan
            daftar={JENIS_TINGGAL}
            label="Tinggal bersama"
            name="jenisTinggal"
          />
          <Pilihan
            daftar={ALAT_TRANSPORTASI}
            label="Alat transportasi ke sekolah"
            name="transportasi"
          />
        </div>
        <Isian
          inputMode="decimal"
          label="Jarak rumah ke sekolah (km)"
          max={500}
          min={0}
          name="jarakKm"
          step="0.1"
          type="number"
        />
      </fieldset>

      <fieldset
        className="space-y-6"
        data-langkah="2"
        disabled={mengirim}
        hidden={langkah !== 2}
      >
        <legend className="sr-only">{LANGKAH[2]}</legend>
        <div className="space-y-4">
          <h3 className="font-semibold">Kontak yang dapat dihubungi sekolah</h3>
          <Isian
            label="Nama orang tua / wali"
            maxLength={120}
            name="namaWali"
            wajib
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Isian
              bantuan="Contoh: 081200000000. Pemberitahuan pendaftaran dikirim ke nomor ini."
              inputMode="tel"
              label="Nomor WhatsApp"
              name="noWhatsappWali"
              type="tel"
              wajib
            />
            <Isian
              label="Email"
              maxLength={120}
              name="emailWali"
              type="email"
            />
          </div>
        </div>
        <Isian
          bantuan="16 angka di bagian atas Kartu Keluarga."
          inputMode="numeric"
          label="Nomor Kartu Keluarga"
          maxLength={16}
          name="noKk"
          pattern="\d{16}"
          title="16 angka"
        />
        <OrangTua awalan="ayah" judul="Data ayah" />
        <OrangTua awalan="ibu" judul="Data ibu" namaWajib />
        <OrangTua
          aksi={
            <div className="flex gap-2">
              <button
                className="min-h-11 rounded-md border border-garis px-3 text-sm"
                onClick={() => salinKeWali("ayah")}
                type="button"
              >
                Sama dengan ayah
              </button>
              <button
                className="min-h-11 rounded-md border border-garis px-3 text-sm"
                onClick={() => salinKeWali("ibu")}
                type="button"
              >
                Sama dengan ibu
              </button>
            </div>
          }
          awalan="wali"
          judul="Data wali"
        />
      </fieldset>

      <fieldset
        className="space-y-6"
        data-langkah="3"
        disabled={mengirim}
        hidden={langkah !== 3}
      >
        <legend className="sr-only">{LANGKAH[3]}</legend>
        <div className="space-y-4">
          <h3 className="font-semibold">Bantuan pemerintah</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Pilihan
              bawaan="Tidak"
              daftar={["Tidak", "Ya"]}
              label="Penerima KPS/PKH"
              name="kps"
              wajib
            />
            <Isian label="Nomor KPS/PKH" maxLength={40} name="noKps" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Pilihan
              bawaan="Tidak"
              daftar={["Tidak", "Ya"]}
              label="Penerima KIP"
              name="kip"
              wajib
            />
            <Isian label="Nomor KIP" maxLength={40} name="noKip" />
          </div>
          <Isian label="Nama tertera di KIP" maxLength={120} name="namaKip" />
          <Isian label="Nomor KKS" maxLength={40} name="noKks" />
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Data kesehatan</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Isian
              inputMode="decimal"
              label="Berat badan (kg)"
              max={200}
              min={1}
              name="beratKg"
              step="0.1"
              type="number"
            />
            <Isian
              inputMode="decimal"
              label="Tinggi badan (cm)"
              max={250}
              min={30}
              name="tinggiCm"
              step="0.1"
              type="number"
            />
            <Isian
              inputMode="decimal"
              label="Lingkar kepala (cm)"
              max={80}
              min={20}
              name="lingkarKepalaCm"
              step="0.1"
              type="number"
            />
          </div>
        </div>
      </fieldset>

      <fieldset
        className="space-y-4"
        data-langkah="4"
        disabled={mengirim}
        hidden={langkah !== 4}
      >
        <legend className="sr-only">{LANGKAH[4]}</legend>
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
                <Label htmlFor={`${id}-${jenis}`}>{LABEL_BERKAS[jenis]}</Label>
                <input
                  accept={PMB_MIME_BERKAS.join(",")}
                  className={`${KELAS_ISIAN} text-sm`}
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

        <div className="rounded-lg border border-garis p-4">
          <h3 className="font-semibold">Periksa sebelum mengirim</h3>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            {ringkasan.map(([label, nilai]) => (
              <div className="contents" key={label}>
                <dt className="text-teks-lembut">{label}</dt>
                <dd className="font-medium wrap-break-word">{nilai}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-teks-lembut text-xs leading-relaxed">
          Data ini dipakai sekolah untuk seleksi penerimaan dan pendataan
          peserta didik di DAPODIK, dan hanya dapat dibuka panitia penerimaan.
        </p>
      </fieldset>

      {kiriman.keadaan === "gagal" ? (
        <div
          className="rounded-md border border-garis bg-latar-lembut p-4 text-sm leading-relaxed"
          role="alert"
        >
          <p>{kiriman.pesan}</p>
          {kiriman.rincian.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {kiriman.rincian.map((pesan) => (
                <li key={pesan}>{pesan}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {langkah > 0 ? (
          <button
            className="min-h-12 rounded-md border border-garis px-5 font-medium"
            disabled={mengirim}
            onClick={() => pindah(langkah - 1)}
            type="button"
          >
            Kembali
          </button>
        ) : (
          <span />
        )}
        {terakhir ? (
          <button
            className="min-h-12 rounded-md bg-aksen px-5 font-medium text-aksen-teks disabled:opacity-60"
            disabled={mengirim}
            type="submit"
          >
            {mengirim ? "Mengirim…" : "Kirim pendaftaran"}
          </button>
        ) : (
          <button
            className="min-h-12 rounded-md bg-aksen px-5 font-medium text-aksen-teks"
            onClick={lanjut}
            type="button"
          >
            Lanjut ke {LANGKAH[langkah + 1].toLowerCase()}
          </button>
        )}
      </div>
    </form>
  );
}
