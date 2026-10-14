"use client";

import { useEffect, useState } from "react";
import { optimizeImageFile } from "@/lib/client/image-optimizer";
import { ambilGambarKonten, unggahGambarKonten } from "@/lib/gateways/content";
import {
  idGambarKontenSah,
  MAKS_BYTE_GAMBAR_KONTEN,
  ukuranBase64,
} from "@/lib/validations/konten-gambar";

/**
 * Unggah satu foto konten situs publik (fasilitas, jurusan, ekskul, hero).
 *
 * Foto dikompres di perangkat ke WebP, sisi terpanjang 1600px, mutu 0,8, lalu
 * disimpan di `konten_gambar`; nilai field-nya hanya id foto itu. WebView yang
 * tidak bisa membuat WebP (`toDataURL` diam-diam mengembalikan PNG) jatuh ke
 * JPEG mutu yang sama.
 */
export async function siapkanFotoKonten(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Pilih foto berformat JPEG, PNG, atau WebP.");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Berkas foto lebih dari 15 MB. Pilih foto lain.");
  }
  const opsi = {
    maxWidth: 1600,
    maxHeight: 1600,
    quality: 0.8,
    fit: "shrink",
  } as const;
  let { dataUrl } = await optimizeImageFile(file, {
    ...opsi,
    mimeType: "image/webp",
  });
  if (!dataUrl.startsWith("data:image/webp")) {
    ({ dataUrl } = await optimizeImageFile(file, {
      ...opsi,
      mimeType: "image/jpeg",
    }));
  }
  if (ukuranBase64(dataUrl.split(",")[1] ?? "") > MAKS_BYTE_GAMBAR_KONTEN) {
    throw new Error(
      "Foto masih lebih dari 400 KB setelah dikompres. Pilih foto lain.",
    );
  }
  const { id } = await unggahGambarKonten(dataUrl);
  return id;
}

/**
 * Sumber pratinjau dari nilai field: id foto diambil dari database, data URL
 * lama (foto hero sebelum v48) ditampilkan apa adanya.
 */
export function usePratinjauGambar(
  nilai: string | null | undefined,
): string | null {
  const [hasil, setHasil] = useState<{ id: string; src: string | null }>({
    id: "",
    src: null,
  });
  const id = idGambarKontenSah(nilai) ? nilai : "";

  useEffect(() => {
    if (!id) return;
    let batal = false;
    ambilGambarKonten([id])
      .then((res) => {
        if (!batal) setHasil({ id, src: res.items[id] ?? null });
      })
      .catch(() => {
        if (!batal) setHasil({ id, src: null });
      });
    return () => {
      batal = true;
    };
  }, [id]);

  if (nilai?.startsWith("data:image/")) return nilai;
  return id && hasil.id === id ? hasil.src : null;
}

export function GambarKontenInput({
  inputId,
  label,
  value,
  onChange,
  disabled = false,
}: {
  inputId: string;
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [galat, setGalat] = useState<string | null>(null);
  const [memproses, setMemproses] = useState(false);
  const pratinjau = usePratinjauGambar(value);

  const pilih = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMemproses(true);
    setGalat(null);
    try {
      onChange(await siapkanFotoKonten(file));
    } catch (err) {
      setGalat(err instanceof Error ? err.message : "Foto gagal diunggah.");
    } finally {
      setMemproses(false);
    }
  };

  return (
    <div>
      <span className="block text-[11px] font-bold text-slate-400 mb-1">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <div className="aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-800">
          {pratinjau ? (
            // biome-ignore lint/performance/noImgElement: pratinjau data URL dari database
            <img
              src={pratinjau}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-[10px] text-slate-500">
              {value ? "Memuat..." : "Belum ada"}
            </span>
          )}
        </div>
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={inputId}
              className="cursor-pointer rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/20"
            >
              {memproses
                ? "Mengunggah..."
                : value
                  ? "Ganti foto"
                  : "Pilih foto"}
            </label>
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={memproses}
              onChange={pilih}
              aria-label={label}
            />
            {value ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20"
              >
                Hapus foto
              </button>
            ) : null}
          </div>
        )}
      </div>
      {galat ? (
        <p role="alert" className="mt-1 text-[11px] text-rose-400">
          {galat}
        </p>
      ) : null}
    </div>
  );
}
