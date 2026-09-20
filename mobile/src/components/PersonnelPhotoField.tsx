"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { triggerHaptic } from "@/lib/client/haptics";
import { optimizeImageFile } from "@/lib/client/image-optimizer";
import {
  ambilFotoPersonil,
  hapusFotoPersonil,
  simpanFotoPersonil,
} from "@/lib/gateways/personnel-photo";

/**
 * Kendali foto profil satu personil — versi Mobile.
 *
 * Kembaran `web-desktop/src/components/PersonnelPhotoField.tsx`. Sengaja tidak
 * ikut `sync-frontend-lib.ts`: `src/components/` memang tidak disinkronkan, dan
 * versi ini berbeda pada sentuhan haptik serta ukuran sasaran sentuh.
 *
 * Kompresi memakai `optimizeImageFile`, bukan rantai FileReader→Image→canvas
 * yang dirakit sendiri: helper itu me-`reject` kedua jalur gagalnya, sehingga
 * gagal memilih berkas tidak pernah berakhir sebagai state yang diam-diam
 * kosong lalu tersimpan sebagai personil tanpa foto.
 */

const MAKS_BASE64 = 512_000;
const MIME_DITERIMA = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  idUnik: string;
  nama: string;
  disabled?: boolean;
  onChanged?: () => void;
}

export function PersonnelPhotoField({
  idUnik,
  nama,
  disabled = false,
  onChanged,
}: Props) {
  const [foto, setFoto] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const muat = useCallback(async () => {
    if (!idUnik) {
      setFoto(null);
      return;
    }
    setMemuat(true);
    setGalat(null);
    try {
      const hasil = await ambilFotoPersonil(idUnik);
      setFoto(
        hasil?.foto_base64
          ? `data:${hasil.foto_mime || "image/jpeg"};base64,${hasil.foto_base64.replace(/^data:[^,]+,/, "")}`
          : null,
      );
    } catch (err) {
      setGalat(
        err instanceof Error
          ? `${err.message} — foto dibaca dari cloud dan memerlukan jaringan.`
          : "Gagal memuat foto.",
      );
    } finally {
      setMemuat(false);
    }
  }, [idUnik]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const handlePilih = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || isSubmittingRef.current) return;

    if (!MIME_DITERIMA.includes(file.type)) {
      setGalat("Format foto harus JPEG, PNG, atau WebP.");
      return;
    }

    isSubmittingRef.current = true;
    setGalat(null);
    try {
      const { dataUrl } = await optimizeImageFile(file, {
        maxWidth: 600,
        maxHeight: 800,
        quality: 0.82,
        mimeType: "image/jpeg",
        fit: "contain",
      });
      const base64 = dataUrl.replace(/^data:[^,]+,/, "");
      if (base64.length > MAKS_BASE64) {
        setGalat(
          "Foto masih terlalu besar setelah dikompres (maksimal 500 KB). Pilih gambar beresolusi lebih rendah.",
        );
        return;
      }
      await simpanFotoPersonil(idUnik, base64, "image/jpeg");
      setFoto(dataUrl);
      triggerHaptic("success");
      onChangedRef.current?.();
    } catch (err) {
      triggerHaptic("error");
      setGalat(err instanceof Error ? err.message : "Gagal menyimpan foto.");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleHapus = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setGalat(null);
    try {
      await hapusFotoPersonil(idUnik);
      setFoto(null);
      triggerHaptic("warning");
      onChangedRef.current?.();
    } catch (err) {
      triggerHaptic("error");
      setGalat(err instanceof Error ? err.message : "Gagal menghapus foto.");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const inputId = `input-foto-personil-${idUnik || "baru"}`;

  if (!idUnik) {
    return (
      <p className="text-[10px] text-slate-500">
        Simpan data terlebih dahulu, lalu foto bisa diunggah lewat tombol Ubah.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block font-bold text-slate-300">
        Foto Profil
      </label>

      <div className="flex items-start gap-3">
        <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950">
          {memuat ? (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
              Memuat...
            </div>
          ) : foto ? (
            // biome-ignore lint/performance/noImgElement: data URI dari database, bukan aset build
            <img
              src={foto}
              alt={`Foto profil ${nama}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-slate-500">
              Belum ada foto
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <input
            id={inputId}
            aria-label={`Pilih foto profil untuk ${nama}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePilih}
            disabled={disabled}
            className="w-full text-[10px] text-slate-400 file:mr-2 file:rounded-xl file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-[10px] file:font-bold file:text-sky-300 disabled:opacity-50"
          />
          {foto && !disabled ? (
            <button
              type="button"
              onClick={handleHapus}
              className="rounded-lg bg-rose-500/15 px-3 py-2 text-[10px] font-semibold text-rose-300"
            >
              Hapus foto
            </button>
          ) : null}
          <p className="text-[10px] text-slate-500">
            Maksimal 500 KB. Dipakai juga pada kartu identitas.
          </p>
        </div>
      </div>

      {galat ? (
        <p className="text-[10px] text-rose-300" role="alert">
          {galat}
        </p>
      ) : null}
    </div>
  );
}
