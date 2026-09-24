"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

type ModeMasuk = "password" | "otp";

type Langkah =
  | { tahap: "form_masuk" }
  | { tahap: "otp_kode"; nomorInduk: string; nomorTersamar: string | null }
  | { tahap: "wajib_ganti_password"; passwordLama: string }
  | { tahap: "memproses" };

export function FormMasuk() {
  const router = useRouter();
  const id = useId();
  const [mode, setMode] = useState<ModeMasuk>("password");
  const [langkah, setLangkah] = useState<Langkah>({ tahap: "form_masuk" });
  const [galat, setGalat] = useState<string | null>(null);
  const [lihatPassword, setLihatPassword] = useState(false);

  // Penjaga klik ganda
  const isSubmittingRef = useRef(false);

  async function masukPassword(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);

    const data = new FormData(peristiwa.currentTarget);
    const nomorInduk = String(data.get("nomorInduk") ?? "").trim();
    const password = String(data.get("password") ?? "");

    try {
      const jawaban = await fetch("/api/wali/masuk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metode: "password",
          nomorInduk,
          password,
        }),
      });
      const isi = await jawaban.json();

      if (!jawaban.ok) {
        setGalat(
          String(isi?.message ?? "Nomor induk atau kata sandi tidak cocok."),
        );
        return;
      }

      if (isi.perluGantiPassword) {
        setLangkah({ tahap: "wajib_ganti_password", passwordLama: password });
        return;
      }

      router.replace("/wali/kehadiran");
      router.refresh();
    } catch (error) {
      console.error("[web-public] masuk password gagal:", error);
      setGalat("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function simpanPasswordBaru(
    peristiwa: React.FormEvent<HTMLFormElement>,
  ) {
    peristiwa.preventDefault();
    if (langkah.tahap !== "wajib_ganti_password") return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);

    const data = new FormData(peristiwa.currentTarget);
    const passwordBaru = String(data.get("passwordBaru") ?? "");
    const konfirmasi = String(data.get("konfirmasiPassword") ?? "");

    if (passwordBaru.length < 8) {
      setGalat("Kata sandi baru minimal 8 karakter.");
      isSubmittingRef.current = false;
      return;
    }

    if (passwordBaru !== konfirmasi) {
      setGalat("Konfirmasi kata sandi tidak cocok.");
      isSubmittingRef.current = false;
      return;
    }

    if (passwordBaru === langkah.passwordLama) {
      setGalat("Kata sandi baru tidak boleh sama dengan kata sandi bawaan.");
      isSubmittingRef.current = false;
      return;
    }

    try {
      const jawaban = await fetch("/api/wali/ganti-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passwordLama: langkah.passwordLama,
          passwordBaru,
        }),
      });
      const isi = await jawaban.json();

      if (!jawaban.ok) {
        setGalat(String(isi?.message ?? "Gagal mengubah kata sandi."));
        return;
      }

      router.replace("/wali/kehadiran");
      router.refresh();
    } catch (error) {
      console.error("[web-public] simpan password baru gagal:", error);
      setGalat("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function mintaKodeOtp(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const data = new FormData(peristiwa.currentTarget);
    const nomorInduk = String(data.get("nomorInduk") ?? "").trim();
    setGalat(null);
    setLangkah({ tahap: "memproses" });

    try {
      const jawaban = await fetch("/api/wali/minta-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomorInduk }),
      });
      const isi = await jawaban.json();

      if (!jawaban.ok) {
        setGalat(String(isi?.message ?? "Kode gagal dikirim."));
        setLangkah({ tahap: "form_masuk" });
        return;
      }

      setLangkah({
        tahap: "otp_kode",
        nomorInduk,
        nomorTersamar: isi.nomorTersamar ?? null,
      });
    } catch (error) {
      console.error("[web-public] permintaan kode gagal:", error);
      setGalat("Tidak dapat menghubungi server. Periksa koneksi Anda.");
      setLangkah({ tahap: "form_masuk" });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function masukOtp(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (langkah.tahap !== "otp_kode") return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);

    try {
      const data = new FormData(peristiwa.currentTarget);
      const jawaban = await fetch("/api/wali/masuk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metode: "otp",
          nomorInduk: langkah.nomorInduk,
          kode: String(data.get("kode") ?? "").trim(),
        }),
      });
      const isi = await jawaban.json();

      if (!jawaban.ok) {
        setGalat(String(isi?.message ?? "Kode tidak cocok."));
        return;
      }

      router.replace("/wali/kehadiran");
      router.refresh();
    } catch (error) {
      console.error("[web-public] masuk gagal:", error);
      setGalat("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  // 1. Tampilan Wajib Ganti Password (Login Perdana)
  if (langkah.tahap === "wajib_ganti_password") {
    return (
      <form className="space-y-4" onSubmit={simpanPasswordBaru}>
        <div className="rounded-lg border border-garis bg-latar-lembut p-4 text-sm leading-relaxed">
          <p className="font-medium text-teks">
            Selamat datang di Portal Wali Murid!
          </p>
          <p className="mt-1 text-teks-lembut text-xs">
            Karena ini pertama kali Anda masuk, silakan buat kata sandi baru
            untuk mengamankan akses data anak Anda.
          </p>
        </div>

        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-password-baru`}
          >
            Kata Sandi Baru (min. 8 karakter)
          </label>
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-teks"
            id={`${id}-password-baru`}
            minLength={8}
            name="passwordBaru"
            required
            type="password"
          />
        </div>

        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-konfirmasi-password`}
          >
            Ulangi Kata Sandi Baru
          </label>
          <input
            autoComplete="new-password"
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-teks"
            id={`${id}-konfirmasi-password`}
            minLength={8}
            name="konfirmasiPassword"
            required
            type="password"
          />
        </div>

        {galat ? (
          <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm text-red-600 dark:text-red-400">
            {galat}
          </p>
        ) : null}

        <button
          className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks"
          type="submit"
        >
          Simpan &amp; Masuk ke Portal
        </button>
      </form>
    );
  }

  // 2. Tampilan Masukkan Kode OTP WhatsApp
  if (langkah.tahap === "otp_kode") {
    return (
      <form className="space-y-4" onSubmit={masukOtp}>
        <div className="rounded-lg border border-garis bg-latar-lembut p-4 text-sm text-teks-lembut leading-relaxed">
          {langkah.nomorTersamar ? (
            <>
              Kode enam digit dikirim ke nomor WhatsApp wali yang terdaftar di
              sekolah: <strong>{langkah.nomorTersamar}</strong>
            </>
          ) : (
            <>
              Jika nomor induk tersebut terdaftar, kode enam digit telah dikirim
              ke nomor WhatsApp wali yang tercatat di sekolah.
            </>
          )}
        </div>

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
            id={`${id}-kode`}
            inputMode="numeric"
            maxLength={6}
            name="kode"
            pattern="[0-9]{6}"
            required
            type="text"
          />
        </div>

        {galat ? (
          <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm text-red-600 dark:text-red-400">
            {galat}
          </p>
        ) : null}

        <button
          className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks"
          type="submit"
        >
          Masuk
        </button>
        <button
          className="w-full text-sm text-teks-lembut underline"
          onClick={() => {
            setGalat(null);
            setLangkah({ tahap: "form_masuk" });
          }}
          type="button"
        >
          Ganti nomor induk
        </button>
      </form>
    );
  }

  // 3. Tampilan Form Masuk Utama (Dual Tab: Kata Sandi & WhatsApp OTP)
  const memproses = langkah.tahap === "memproses";

  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-garis bg-latar-lembut p-1">
        <button
          className={`rounded-md py-2 text-sm font-medium transition-all ${
            mode === "password"
              ? "bg-latar text-teks shadow-sm"
              : "text-teks-lembut hover:text-teks"
          }`}
          onClick={() => {
            setMode("password");
            setGalat(null);
          }}
          type="button"
        >
          Kata Sandi
        </button>
        <button
          className={`rounded-md py-2 text-sm font-medium transition-all ${
            mode === "otp"
              ? "bg-latar text-teks shadow-sm"
              : "text-teks-lembut hover:text-teks"
          }`}
          onClick={() => {
            setMode("otp");
            setGalat(null);
          }}
          type="button"
        >
          WhatsApp OTP
        </button>
      </div>

      {mode === "password" ? (
        <form className="space-y-4" onSubmit={masukPassword}>
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-induk-password`}
            >
              NIS atau NISN anak
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-teks"
              id={`${id}-induk-password`}
              inputMode="numeric"
              maxLength={40}
              name="nomorInduk"
              placeholder="Contoh: 0012345678"
              required
              type="text"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                className="block text-sm text-teks-lembut"
                htmlFor={`${id}-password`}
              >
                Kata Sandi
              </label>
              <button
                className="text-xs text-teks-lembut hover:text-teks"
                onClick={() => setLihatPassword(!lihatPassword)}
                type="button"
              >
                {lihatPassword ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>
            <input
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-teks"
              id={`${id}-password`}
              name="password"
              placeholder="Kata sandi akun wali"
              required
              type={lihatPassword ? "text" : "password"}
            />
            <p className="mt-1.5 text-teks-lembut text-xs leading-relaxed">
              Kata sandi awal tercetak di slip akun wali dari sekolah. Lupa kata
              sandi? Masuk dengan kode WhatsApp, lalu buat kata sandi baru di
              halaman Profil. Tanpa WhatsApp, hubungi tata usaha sekolah.
            </p>
          </div>

          {galat ? (
            <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm text-red-600 dark:text-red-400">
              {galat}
            </p>
          ) : null}

          <button
            className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks disabled:opacity-60"
            type="submit"
          >
            Masuk dengan Kata Sandi
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={mintaKodeOtp}>
          <div>
            <label
              className="block text-sm text-teks-lembut"
              htmlFor={`${id}-induk-otp`}
            >
              NIS atau NISN anak
            </label>
            <input
              className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-teks"
              disabled={memproses}
              id={`${id}-induk-otp`}
              inputMode="numeric"
              maxLength={40}
              name="nomorInduk"
              placeholder="Contoh: 0012345678"
              required
              type="text"
            />
            <p className="mt-1.5 text-teks-lembut text-xs leading-relaxed">
              Kode sekali pakai (OTP) akan dikirim ke nomor WhatsApp wali murid
              yang terdaftar di sekolah.
            </p>
          </div>

          {galat ? (
            <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm text-red-600 dark:text-red-400">
              {galat}
            </p>
          ) : null}

          <button
            className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks disabled:opacity-60"
            disabled={memproses}
            type="submit"
          >
            {memproses ? "Mengirim kode…" : "Kirim Kode WhatsApp"}
          </button>
        </form>
      )}
    </div>
  );
}
