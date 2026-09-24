"use client";

import { dataUrlToBlob, downloadDataUrl } from "@/lib/client/download";

export interface ShareResult {
  sukses: boolean;
  cancelled?: boolean;
  message?: string;
}

/**
 * Membagikan berkas gambar (ID Card / QR Code) ke aplikasi lain (WhatsApp, Telegram, Gmail, Drive, dll).
 * Mengutamakan Android Native Share Sheet (via AndroidBridge jika ada, atau Web Share API pada Android WebView),
 * dan fallback ke penyimpanan berkas lokal (SAF / download).
 */
export async function shareDataUrl(
  dataUrl: string,
  filename: string,
  title = "ID Card",
  text = "ID Card Digital",
): Promise<ShareResult> {
  const cleanBase64 = dataUrl.includes(";base64,")
    ? dataUrl.split(";base64,")[1] || ""
    : dataUrl.includes(",")
      ? dataUrl.split(",")[1] || ""
      : dataUrl;

  // 1. Android Native Bridge Share Sheet (Jika tersedia di WebView khusus)
  if (typeof window !== "undefined" && window.AndroidBridge?.shareImage) {
    try {
      const rawRes = window.AndroidBridge.shareImage(
        cleanBase64,
        filename,
        title,
      );
      const res = JSON.parse(rawRes) as {
        sukses: boolean;
        error?: string;
      };
      if (res.sukses) {
        return {
          sukses: true,
          message: "Membuka menu bagikan...",
        };
      }
      if (res.error) {
        throw new Error(res.error);
      }
    } catch (bridgeErr) {
      console.warn("AndroidBridge shareImage failed, falling back:", bridgeErr);
    }
  }

  // 2. Web Share API (Prioritas utama pada WebView Android modern & browser yang mendukung File Sharing)
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      const blob = dataUrlToBlob(dataUrl);
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title,
          text,
          files: [file],
        });
        return { sukses: true };
      }
      await navigator.share({
        title,
        text,
      });
      return { sukses: true };
    } catch (shareErr) {
      if ((shareErr as Error)?.name === "AbortError") {
        return { sukses: false, cancelled: true };
      }
      console.warn(
        "navigator.share failed, falling back to download:",
        shareErr,
      );
    }
  }

  // 3. Fallback: Simpan ke media penyimpanan lokal (SAF di Android / Download di desktop)
  const downloadRes = await downloadDataUrl(dataUrl, filename);
  // Di Android ini membuka dialog "Simpan ke…"; menutupnya = pembatalan.
  if (downloadRes.cancelled) return { sukses: false, cancelled: true };
  return {
    sukses: downloadRes.sukses,
    message: downloadRes.path
      ? `ID Card tersimpan di ${downloadRes.path}`
      : "ID Card berhasil disimpan.",
  };
}

/**
 * Membagikan teks (ringkasan slip gaji / pesan operasional) via Web Share API atau Clipboard.
 */
export async function shareText(
  text: string,
  title = "Slip Gaji",
): Promise<ShareResult> {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    try {
      await navigator.share({ title, text });
      return { sukses: true };
    } catch (shareErr) {
      if ((shareErr as Error)?.name === "AbortError") {
        return { sukses: false, cancelled: true };
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return {
        sukses: true,
        message: "Teks slip berhasil disalin ke clipboard.",
      };
    } catch {
      // Clipboard bisa ditolak izinnya oleh WebView. Jalur berbagi utama
      // sudah berhasil di atas; penyalinan ini hanya kemudahan tambahan.
    }
  }

  return { sukses: false, message: "Perangkat tidak mendukung bagikan teks." };
}
