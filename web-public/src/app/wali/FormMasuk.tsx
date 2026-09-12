"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

type Langkah =
  | { tahap: "induk" }
  | { tahap: "kode"; nomorInduk: string; nomorTersamar: string | null }
  | { tahap: "mengirim" };

export function FormMasuk() {
  const router = useRouter();
  const id = useId();
  const [langkah, setLangkah] = useState<Langkah>({ tahap: "induk" });
  const [galat, setGalat] = useState<string | null>(null);

  // Penjaga klik ganda. Di sini akibatnya bukan data ganda melainkan dua kode
  // OTP beruntun — dan yang kedua membatalkan yang pertama, sehingga wali yang
  // menerima dua pesan justru memasukkan kode yang sudah tidak berlaku.
  const isSubmittingRef = useRef(false);

  async function mintaKode(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const data = new FormData(peristiwa.currentTarget);
    const nomorInduk = String(data.get("nomorInduk") ?? "").trim();
    setGalat(null);
    setLangkah({ tahap: "mengirim" });

    try {
      const jawaban = await fetch("/api/wali/minta-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nomorInduk }),
      });
      const isi = await jawaban.json();

      if (!jawaban.ok) {
        setGalat(String(isi?.message ?? "Kode gagal dikirim."));
        setLangkah({ tahap: "induk" });
        return;
      }

      setLangkah({
        tahap: "kode",
        nomorInduk,
        nomorTersamar: isi.nomorTersamar ?? null,
      });
    } catch (error) {
      console.error("[web-public] permintaan kode gagal:", error);
      setGalat("Tidak dapat menghubungi server. Periksa koneksi Anda.");
      setLangkah({ tahap: "induk" });
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function masuk(peristiwa: React.FormEvent<HTMLFormElement>) {
    peristiwa.preventDefault();
    if (langkah.tahap !== "kode") return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);

    try {
      const data = new FormData(peristiwa.currentTarget);
      const jawaban = await fetch("/api/wali/masuk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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

  if (langkah.tahap === "kode") {
    return (
      <form className="space-y-4" onSubmit={masuk}>
        <div className="rounded-lg border border-garis bg-latar-lembut p-4 text-sm text-teks-lembut leading-relaxed">
          {langkah.nomorTersamar ? (
            <>
              Kode enam digit dikirim ke nomor WhatsApp wali yang terdaftar di
              sekolah: <strong>{langkah.nomorTersamar}</strong>
            </>
          ) : (
            // Nomor induk tidak ditemukan, tetapi layar ini TIDAK
            // mengatakannya — kalau ia membedakan, siapa pun bisa memakainya
            // untuk memetakan NIS mana yang terdaftar di sekolah ini.
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
          <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm">
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
            setLangkah({ tahap: "induk" });
          }}
          type="button"
        >
          Ganti nomor induk
        </button>
      </form>
    );
  }

  const mengirim = langkah.tahap === "mengirim";

  return (
    <form className="space-y-4" onSubmit={mintaKode}>
      <div>
        <label
          className="block text-sm text-teks-lembut"
          htmlFor={`${id}-induk`}
        >
          NIS atau NISN anak
        </label>
        <input
          className="mt-1 w-full rounded-md border border-garis bg-latar px-3 py-2"
          disabled={mengirim}
          id={`${id}-induk`}
          inputMode="numeric"
          maxLength={40}
          name="nomorInduk"
          required
          type="text"
        />
        <p className="mt-1 text-teks-lembut text-xs">
          Kode masuk dikirim ke nomor WhatsApp wali yang terdaftar di sekolah.
          Tidak ada kata sandi yang perlu diingat.
        </p>
      </div>

      {galat ? (
        <p className="rounded-md border border-garis bg-latar-lembut p-3 text-sm">
          {galat}
        </p>
      ) : null}

      <button
        className="w-full rounded-md bg-aksen px-5 py-3 font-medium text-aksen-teks disabled:opacity-60"
        disabled={mengirim}
        type="submit"
      >
        {mengirim ? "Mengirim kode…" : "Kirim kode"}
      </button>
    </form>
  );
}
