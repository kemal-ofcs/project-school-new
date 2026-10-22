import { optimizeImageDataUrl } from "@/lib/client/image-optimizer";
import {
  MAKS_BYTE_BERKAS,
  MIME_BERKAS_SEKOLAH,
  type MimeBerkasSekolah,
  ukuranBase64,
} from "@/lib/validations/berkas-sekolah";

/**
 * Siapkan satu berkas sebelum diunggah: foto dipadatkan menjadi JPEG ±150 KB
 * (KK dan akta tetap terbaca), PDF dikirim apa adanya karena browser tidak
 * bisa memadatkannya. Dipakai formulir PMB situs publik dan panel admin, jadi
 * aturannya satu.
 */

export const TARGET_BYTE_FOTO = 150 * 1024;

// Sisi terpanjang dan mutu JPEG, dicoba berurutan sampai di bawah target.
const LANGKAH_PADAT: readonly [number, number][] = [
  [1600, 0.75],
  [1600, 0.6],
  [1280, 0.6],
  [1024, 0.5],
];

export type HasilSiapkanBerkas =
  | {
      ok: true;
      berkas: {
        namaFile: string;
        mime: MimeBerkasSekolah;
        ukuranByte: number;
        kontenBase64: string;
      };
    }
  | { ok: false; pesan: string };

const kb = (byte: number) => Math.ceil(byte / 1024);

function bacaDataUrl(berkas: Blob): Promise<string> {
  return new Promise((selesai, gagal) => {
    const pembaca = new FileReader();
    pembaca.onload = () => selesai(String(pembaca.result));
    pembaca.onerror = () => gagal(new Error("Berkas tidak dapat dibaca."));
    pembaca.readAsDataURL(berkas);
  });
}

const isiBase64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

export async function siapkanBerkas(file: File): Promise<HasilSiapkanBerkas> {
  const namaFile = file.name.trim().slice(0, 180) || "berkas";

  if (file.type === "application/pdf") {
    if (file.size > MAKS_BYTE_BERKAS) {
      return {
        ok: false,
        pesan: `PDF ini ${kb(file.size)} KB, melebihi batas ${kb(MAKS_BYTE_BERKAS)} KB. Foto halamannya lalu unggah sebagai gambar.`,
      };
    }
    return {
      ok: true,
      berkas: {
        namaFile,
        mime: "application/pdf",
        ukuranByte: file.size,
        kontenBase64: isiBase64(await bacaDataUrl(file)),
      },
    };
  }

  if (!file.type.startsWith("image/")) {
    return {
      ok: false,
      pesan: "Berkas harus berupa JPG, PNG, WEBP, atau PDF.",
    };
  }

  const asli = await bacaDataUrl(file);
  const mimeAsli = MIME_BERKAS_SEKOLAH.find((m) => m === file.type);
  if (mimeAsli && file.size <= TARGET_BYTE_FOTO) {
    return {
      ok: true,
      berkas: {
        namaFile,
        mime: mimeAsli,
        ukuranByte: file.size,
        kontenBase64: isiBase64(asli),
      },
    };
  }

  let hasil: { dataUrl: string; optimizedSizeBytes: number } | null = null;
  for (const [sisi, mutu] of LANGKAH_PADAT) {
    try {
      hasil = await optimizeImageDataUrl(asli, file.size, {
        maxWidth: sisi,
        maxHeight: sisi,
        quality: mutu,
        mimeType: "image/jpeg",
        fit: "shrink",
      });
    } catch {
      // HEIC dan format lain yang tidak bisa digambar browser ini.
      return {
        ok: false,
        pesan:
          "Format foto ini tidak didukung. Pilih foto JPG, PNG, atau WEBP.",
      };
    }
    if (hasil.optimizedSizeBytes <= TARGET_BYTE_FOTO) break;
  }

  if (!hasil || hasil.optimizedSizeBytes > MAKS_BYTE_BERKAS) {
    return {
      ok: false,
      pesan: `Foto masih lebih dari ${kb(MAKS_BYTE_BERKAS)} KB setelah dipadatkan. Pilih foto lain.`,
    };
  }

  const kontenBase64 = isiBase64(hasil.dataUrl);
  return {
    ok: true,
    berkas: {
      namaFile: `${namaFile.replace(/\.[^.]*$/, "")}.jpg`,
      mime: "image/jpeg",
      ukuranByte: ukuranBase64(kontenBase64),
      kontenBase64,
    },
  };
}
