"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

/**
 * Layar ganti password wajib, berdiri sendiri di `/wali/ganti-password`.
 *
 * Kembarannya ada di dalam `FormMasuk.tsx` sebagai langkah kedua tepat setelah
 * login — di sana `passwordLama` masih ada di memori, jadi wali tidak perlu
 * mengetiknya lagi. Halaman ini melayani jalur yang lain: wali yang menutup
 * dialog itu, menutup tab-nya, atau membuka portal dari perangkat lain dengan
 * sesi yang masih hidup. Karena `passwordLama` tidak lagi ada di memori, ia
 * diminta ulang — dan `POST /api/wali/ganti-password` memang menuntutnya,
 * sehingga sesi yang dicuri pun tidak bisa mengunci akun dengan password baru.
 *
 * Satu pengecualian: wali yang baru masuk lewat kode WhatsApp
 * (`tanpaPasswordLama`) sudah membuktikan penguasaan nomor wali, dan justru
 * sedang lupa password-nya. Server memeriksa ulang syarat itu sendiri.
 */
export function FormGantiPassword({
  wajib,
  tanpaPasswordLama,
}: {
  wajib: boolean;
  tanpaPasswordLama: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const isSubmittingRef = useRef(false);
  const [galat, setGalat] = useState<string | null>(null);

  async function simpan(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);

    const data = new FormData(peristiwa.currentTarget);
    const passwordLama = String(data.get("passwordLama") ?? "");
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
    if (passwordLama && passwordBaru === passwordLama) {
      setGalat("Kata sandi baru tidak boleh sama dengan kata sandi saat ini.");
      isSubmittingRef.current = false;
      return;
    }

    try {
      const jawaban = await fetch("/api/wali/ganti-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passwordLama, passwordBaru }),
      });
      const isi = await jawaban.json();

      if (!jawaban.ok) {
        setGalat(String(isi?.message ?? "Gagal mengubah kata sandi."));
        return;
      }

      router.replace("/wali/kehadiran");
      router.refresh();
    } catch (error) {
      console.error("[web-public] ganti password wali gagal:", error);
      setGalat("Tidak dapat menghubungi server. Periksa koneksi Anda.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  return (
    <form className="space-y-4" onSubmit={simpan}>
      {wajib ? (
        <div className="rounded-lg border border-garis bg-latar-lembut p-4 text-sm leading-relaxed">
          <p className="font-medium text-teks">
            Kata sandi Anda masih kata sandi sementara dari sekolah
          </p>
          <p className="mt-1 text-teks-lembut text-xs">
            Kata sandi itu pernah tercetak di slip dan dilihat petugas sekolah.
            Buat kata sandi Anda sendiri sebelum melihat data anak.
          </p>
        </div>
      ) : null}

      {tanpaPasswordLama ? (
        <p className="rounded-lg border border-garis bg-latar-lembut p-4 text-sm text-teks-lembut leading-relaxed">
          Anda baru masuk dengan kode WhatsApp, jadi kata sandi lama tidak
          diperlukan.
        </p>
      ) : (
        <div>
          <label
            className="block text-sm text-teks-lembut"
            htmlFor={`${id}-password-lama`}
          >
            Kata Sandi Saat Ini
          </label>
          <input
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2 text-teks"
            id={`${id}-password-lama`}
            name="passwordLama"
            required
            type="password"
          />
          <p className="mt-1 text-teks-lembut text-xs">
            Lupa? Keluar, lalu masuk dengan kode WhatsApp dan buka halaman ini
            lagi dalam 15 menit.
          </p>
        </div>
      )}

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
