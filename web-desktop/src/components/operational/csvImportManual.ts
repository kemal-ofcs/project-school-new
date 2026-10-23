import type { OfflineImportRow } from "@/lib/gateways/offline-import";

export const HEADER_CSV_IMPORT =
  "tanggal,id_unik,jam_masuk,jam_pulang,status_kehadiran,keterangan";

// Tempelan dari Excel memakai tab, Excel lokal Indonesia memakai titik koma.
function tebakPemisah(baris: string): string {
  const jumlah = (c: string) => baris.split(c).length - 1;
  return ["\t", ";", ","].reduce((terbaik, c) =>
    jumlah(c) > jumlah(terbaik) ? c : terbaik,
  );
}

function pecahBaris(baris: string, pemisah: string): string[] {
  const hasil: string[] = [];
  let sel = "";
  let dalamKutip = false;
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i];
    if (dalamKutip) {
      if (c === '"' && baris[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') {
        dalamKutip = false;
      } else {
        sel += c;
      }
    } else if (c === '"') {
      dalamKutip = true;
    } else if (c === pemisah) {
      hasil.push(sel.trim());
      sel = "";
    } else {
      sel += c;
    }
  }
  hasil.push(sel.trim());
  return hasil;
}

/**
 * Tanggal yang kosong dibiarkan kosong supaya server menolak barisnya.
 * Dulu baris tanpa tanggal (atau header yang salah eja) diam-diam masuk ke
 * hari ini.
 */
export function uraiCsvImport(teks: string): OfflineImportRow[] {
  const baris = teks
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  if (baris.length < 2) {
    throw new Error(
      "CSV kosong atau hanya berisi header. Masukkan data minimal 1 baris.",
    );
  }
  const pemisah = tebakPemisah(baris[0]);
  const header = pecahBaris(baris[0], pemisah).map((h) => h.toLowerCase());
  if (!header.includes("tanggal") || !header.includes("id_unik")) {
    throw new Error(
      `Header CSV wajib memuat kolom tanggal dan id_unik. Contoh: ${HEADER_CSV_IMPORT}`,
    );
  }
  return baris.slice(1).map((line) => {
    const sel = pecahBaris(line, pemisah);
    const nilai = (kolom: string) => sel[header.indexOf(kolom)] ?? "";
    const opsional = (kolom: string) => nilai(kolom) || undefined;
    return {
      tanggal: nilai("tanggal"),
      id_unik: nilai("id_unik"),
      nama: opsional("nama"),
      divisi: opsional("divisi"),
      jam_masuk: opsional("jam_masuk"),
      jam_pulang: opsional("jam_pulang"),
      status_kehadiran: nilai("status_kehadiran") || "Hadir",
      status_absen: opsional("status_absen"),
      keterangan: opsional("keterangan"),
    };
  });
}
