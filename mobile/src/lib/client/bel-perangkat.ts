"use client";

import { audioSynth } from "@/lib/utils/audio";
import {
  normalizeSuaraBel,
  teksPengumumanBel,
} from "@/lib/validations/class-attendance";

/**
 * Bel sekolah di perangkat ini.
 *
 * Sakelar dan MP3-nya SENGAJA milik perangkat, tidak ikut sinkronisasi:
 * jadwal bel tersinkron ke semua perangkat, jadi tanpa sakelar per perangkat
 * setiap laptop dan HP yang sedang membuka aplikasi akan berbunyi bersamaan.
 * MP3 berukuran megabyte dan hanya dibutuhkan perangkat yang memutarnya.
 */

export interface ConfigBel {
  aktif: boolean;
  /** Unit yang jadwalnya dibunyikan; kosong = jadwal "Semua unit". */
  unit: string[];
}

const CONFIG_KEY = "kos_bel_perangkat";
export const BEL_BERUBAH_EVENT = "kos:bel-berubah";

export function bacaConfigBel(): ConfigBel {
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as {
      aktif?: unknown;
      unit?: unknown;
    } | null;
    return {
      aktif: raw?.aktif === true,
      unit: Array.isArray(raw?.unit)
        ? raw.unit.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return { aktif: false, unit: [] };
  }
}

export function simpanConfigBel(config: ConfigBel) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Penyimpanan diblokir: sakelar berlaku sampai halaman ditutup saja.
  }
  window.dispatchEvent(new Event(BEL_BERUBAH_EVENT));
}

// MP3 milik perangkat (IndexedDB)

export const SLOT_MP3 = [1, 2, 3] as const;
export type SlotMp3 = (typeof SLOT_MP3)[number];

/** Batas satu berkas; bel cukup beberapa detik, 5 MB sudah sangat longgar. */
export const MAKS_MP3_BYTE = 5 * 1024 * 1024;

interface Mp3Tersimpan {
  nama: string;
  data: ArrayBuffer;
}

function bukaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("kos-bel", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("mp3");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function transaksi<T>(
  mode: IDBTransactionMode,
  kerja: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await bukaDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = kerja(db.transaction("mp3", mode).objectStore("mp3"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function simpanMp3(slot: SlotMp3, file: File) {
  if (!file.type.startsWith("audio/")) {
    throw new Error("Berkas harus berupa audio, misalnya MP3.");
  }
  if (file.size > MAKS_MP3_BYTE) {
    throw new Error("Berkas audio maksimal 5 MB.");
  }
  const isi: Mp3Tersimpan = { nama: file.name, data: await file.arrayBuffer() };
  await transaksi("readwrite", (store) => store.put(isi, slot));
}

export async function hapusMp3(slot: SlotMp3) {
  await transaksi("readwrite", (store) => store.delete(slot));
}

async function bacaMp3(slot: SlotMp3): Promise<Mp3Tersimpan | null> {
  try {
    const isi = await transaksi<Mp3Tersimpan | undefined>("readonly", (store) =>
      store.get(slot),
    );
    return isi ?? null;
  } catch {
    return null;
  }
}

/** Nama berkas di setiap slot, `null` bila kosong. */
export async function daftarMp3(): Promise<Record<SlotMp3, string | null>> {
  const hasil: Record<SlotMp3, string | null> = { 1: null, 2: null, 3: null };
  for (const slot of SLOT_MP3) {
    hasil[slot] = (await bacaMp3(slot))?.nama ?? null;
  }
  return hasil;
}

// Membunyikan

/**
 * Membunyikan satu baris bel. `false` bila audio masih dikunci peramban
 * (belum ada klik sejak halaman dibuka). MP3 yang belum diunggah di slotnya
 * jatuh ke nada ding-dong, supaya bel tetap berbunyi.
 */
export async function bunyikanBel(row: {
  jenis: string;
  jam_ke: number;
  suara: string | null;
}): Promise<boolean> {
  if (!(await audioSynth.bukaKunci())) return false;
  const suara = normalizeSuaraBel(row.suara) ?? "nada-1";

  if (suara === "pengumuman") {
    audioSynth.playNadaBel(1);
    // Kalimatnya menunggu ding-dong selesai.
    window.setTimeout(() => audioSynth.speak(teksPengumumanBel(row)), 2000);
    return true;
  }
  if (suara.startsWith("mp3-")) {
    const slot = Number(suara.slice(4)) as SlotMp3;
    const berkas = await bacaMp3(slot);
    if (berkas && (await audioSynth.playBerkas(berkas.data))) return true;
    audioSynth.playNadaBel(1);
    return true;
  }
  audioSynth.playNadaBel(Number(suara.slice(5)) as 1 | 2 | 3);
  return true;
}
