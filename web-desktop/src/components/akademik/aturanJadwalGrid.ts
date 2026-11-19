/**
 * Logika murni editor grid Jadwal Mengajar (hari × jam ke) untuk satu rombel.
 *
 * Grid hanya alat isi cepat di atas tabel `jadwal_mengajar` yang sama: tidak
 * ada kolom atau rute baru, dan setiap baris tetap disimpan lewat
 * `simpanJadwalMengajar` sehingga validasi unit dan bentrok di backend
 * berlaku seperti biasa.
 *
 * Satu sel = satu mapel. Sel yang dipakai lebih dari satu baris aktif
 * (misalnya Agama yang memecah rombel pada jam yang sama) dikunci di grid dan
 * diubah lewat tampilan Daftar.
 */

import {
  normalizeJamKe,
  rentangJamKe,
  susunJamKe,
} from "@/lib/validations/class-attendance";

export interface IsiSel {
  id_mapel: string;
  id_guru: string;
}

/** Kunci `hari:jam`, misalnya `1:3` = Senin jam ke-3. */
export type Grid = Map<string, IsiSel>;

export const kunciSel = (hari: number, jam: number) => `${hari}:${jam}`;

export interface BarisJadwal {
  id_jadwal: string;
  hari: number;
  jam_ke: string;
  id_mapel: string;
  id_guru: string;
  is_aktif: number;
}

const selBaris = (row: BarisJadwal): string[] | null => {
  const rentang = rentangJamKe(row.jam_ke);
  if (!rentang) return null;
  const hasil: string[] = [];
  for (let jam = rentang.awal; jam <= rentang.akhir; jam++) {
    hasil.push(kunciSel(row.hari, jam));
  }
  return hasil;
};

export interface PetaGrid<T extends BarisJadwal> {
  sel: Grid;
  terkunci: Set<string>;
  /** Baris aktif yang seluruh selnya tampil di grid. */
  bisaDiubah: T[];
  /** Baris aktif yang tidak bisa diubah di grid (sel terkunci atau jam tidak valid). */
  tetap: T[];
}

/** Baris aktif satu rombel + tahun ajaran → isi grid. Baris nonaktif diabaikan. */
export function petakanGrid<T extends BarisJadwal>(
  rows: readonly T[],
): PetaGrid<T> {
  const aktif = rows.filter((row) => row.is_aktif === 1);
  const tetap = aktif.filter((row) => selBaris(row) === null);
  let bisaDiubah = aktif.filter((row) => selBaris(row) !== null);

  const terisi = new Map<string, number>();
  for (const row of bisaDiubah) {
    for (const kunci of selBaris(row) ?? []) {
      terisi.set(kunci, (terisi.get(kunci) ?? 0) + 1);
    }
  }
  const terkunci = new Set(
    [...terisi].filter(([, jumlah]) => jumlah > 1).map(([kunci]) => kunci),
  );

  // Baris yang menyentuh satu sel terkunci terkunci seluruhnya, dan selnya
  // ikut mengunci baris lain; ulangi sampai tidak ada yang berubah.
  for (;;) {
    const kenaKunci = bisaDiubah.filter((row) =>
      (selBaris(row) ?? []).some((kunci) => terkunci.has(kunci)),
    );
    if (kenaKunci.length === 0) break;
    for (const row of kenaKunci) {
      for (const kunci of selBaris(row) ?? []) terkunci.add(kunci);
    }
    bisaDiubah = bisaDiubah.filter((row) => !kenaKunci.includes(row));
    tetap.push(...kenaKunci);
  }

  const sel: Grid = new Map();
  for (const row of bisaDiubah) {
    for (const kunci of selBaris(row) ?? []) {
      sel.set(kunci, { id_mapel: row.id_mapel, id_guru: row.id_guru });
    }
  }
  return { sel, terkunci, bisaDiubah, tetap };
}

export interface BarisBaru extends IsiSel {
  hari: number;
  jam_ke: string;
}

export interface RencanaSimpan {
  hapus: string[];
  ubah: (BarisBaru & { id_jadwal: string })[];
  tambah: BarisBaru[];
}

const samaIsi = (a: IsiSel, b: IsiSel) =>
  a.id_mapel === b.id_mapel && a.id_guru === b.id_guru;

/**
 * Perubahan yang dikirim ke backend untuk hari-hari yang disunting.
 *
 * Sel bersebelahan dengan mapel dan guru sama digabung menjadi satu rentang
 * (`1-2`), sehingga presensi kelas tetap satu sesi per blok. Hanya hari yang
 * disunting yang disusun ulang: dua baris lama `1` dan `2` di hari lain tidak
 * digabung diam-diam.
 *
 * Baris yang jam_ke-nya sama hanya diubah isinya, bukan dihapus lalu dibuat
 * ulang, supaya `id_jadwal` yang dirujuk penanganan Jam Kosong tetap hidup.
 * Urutan eksekusi WAJIB hapus → ubah → tambah: dengan urutan itu tidak ada
 * langkah yang sempat beririsan dengan baris lain bermapel sama.
 */
export function rencanaSimpan(
  bisaDiubah: readonly BarisJadwal[],
  sel: Grid,
  hariBerubah: Iterable<number>,
): RencanaSimpan {
  const rencana: RencanaSimpan = { hapus: [], ubah: [], tambah: [] };

  for (const hari of new Set(hariBerubah)) {
    const jamTerisi = [...sel.keys()]
      .filter((kunci) => kunci.startsWith(`${hari}:`))
      .map((kunci) => Number(kunci.slice(kunci.indexOf(":") + 1)))
      .sort((a, b) => a - b);

    const blok: { dari: number; sampai: number; isi: IsiSel }[] = [];
    for (const jam of jamTerisi) {
      const isi = sel.get(kunciSel(hari, jam));
      if (!isi) continue;
      const akhir = blok.at(-1);
      if (akhir && akhir.sampai === jam - 1 && samaIsi(akhir.isi, isi)) {
        akhir.sampai = jam;
      } else {
        blok.push({ dari: jam, sampai: jam, isi });
      }
    }

    const sisaLama = bisaDiubah.filter((row) => row.hari === hari);
    const belumAda: BarisBaru[] = [];
    for (const { dari, sampai, isi } of blok) {
      const jam_ke = susunJamKe(dari, sampai);
      if (jam_ke === null) continue;
      const target = { hari, jam_ke, ...isi };
      const kembar = sisaLama.findIndex(
        (row) => normalizeJamKe(row.jam_ke) === jam_ke && samaIsi(row, target),
      );
      if (kembar >= 0) sisaLama.splice(kembar, 1);
      else belumAda.push(target);
    }
    for (const target of belumAda) {
      const sejam = sisaLama.findIndex(
        (row) => normalizeJamKe(row.jam_ke) === target.jam_ke,
      );
      if (sejam >= 0) {
        const [lama] = sisaLama.splice(sejam, 1);
        rencana.ubah.push({ id_jadwal: lama.id_jadwal, ...target });
      } else {
        rencana.tambah.push(target);
      }
    }
    rencana.hapus.push(...sisaLama.map((row) => row.id_jadwal));
  }
  return rencana;
}

/**
 * Isi grid dari jadwal rombel atau tahun ajaran lain.
 *
 * Gurunya diambil dari penugasan rombel tujuan bila ada (menyalin dari X-A ke
 * X-B biasanya beda pengajar), selain itu dari baris sumber. Baris yang
 * mapelnya tidak boleh di rombel tujuan, menyentuh sel terkunci tujuan, atau
 * terkunci di sumber tidak disalin dan dihitung di `dilewati`.
 */
export function salinKeGrid(
  sumber: readonly BarisJadwal[],
  opsi: {
    terkunci: ReadonlySet<string>;
    mapelBoleh: (idMapel: string) => boolean;
    guruPenugasan: ReadonlyMap<string, string>;
  },
): { sel: Grid; disalin: number; dilewati: number } {
  const peta = petakanGrid(sumber);
  const sel: Grid = new Map();
  let disalin = 0;
  let dilewati = peta.tetap.length;
  for (const row of peta.bisaDiubah) {
    const kunciRow = selBaris(row) ?? [];
    if (
      !opsi.mapelBoleh(row.id_mapel) ||
      kunciRow.some((kunci) => opsi.terkunci.has(kunci))
    ) {
      dilewati++;
      continue;
    }
    const isi = {
      id_mapel: row.id_mapel,
      id_guru: opsi.guruPenugasan.get(row.id_mapel) ?? row.id_guru,
    };
    for (const kunci of kunciRow) sel.set(kunci, isi);
    disalin++;
  }
  return { sel, disalin, dilewati };
}

/** JP terpasang per mapel: isi grid ditambah baris yang terkunci. */
export function jpPerMapel(
  sel: Grid,
  tetap: readonly BarisJadwal[],
): Map<string, number> {
  const hasil = new Map<string, number>();
  const tambah = (idMapel: string, jp: number) =>
    hasil.set(idMapel, (hasil.get(idMapel) ?? 0) + jp);
  for (const isi of sel.values()) tambah(isi.id_mapel, 1);
  for (const row of tetap) {
    const rentang = rentangJamKe(row.jam_ke);
    if (rentang) tambah(row.id_mapel, rentang.akhir - rentang.awal + 1);
  }
  return hasil;
}

export interface PerubahanSel {
  kunci: string;
  lama?: IsiSel;
  baru?: IsiSel;
}

/** Sel yang isinya berbeda antara grid awal dan grid hasil suntingan. */
export function selisihGrid(awal: Grid, akhir: Grid): PerubahanSel[] {
  const hasil: PerubahanSel[] = [];
  for (const kunci of new Set([...awal.keys(), ...akhir.keys()])) {
    const lama = awal.get(kunci);
    const baru = akhir.get(kunci);
    if (lama && baru && samaIsi(lama, baru)) continue;
    hasil.push({ kunci, lama, baru });
  }
  return hasil;
}

/**
 * Perubahan satu grid ikut diterapkan ke rombel lain (kelas paralel yang
 * belajar bersama, misalnya PJOK di lapangan).
 *
 * Rombel tujuan tidak pernah ditimpa: sel yang sudah berisi mapel lain, sel
 * terkunci, atau mapel yang tidak berlaku di unit tujuan dilewati dan
 * dilaporkan. Mengosongkan sel hanya menghapus mapel yang sama dengan yang
 * dikosongkan di grid asal. Gurunya dari penugasan rombel tujuan bila ada.
 */
export function terapkanPerubahan(
  tujuan: PetaGrid<BarisJadwal>,
  perubahan: readonly PerubahanSel[],
  opsi: {
    mapelBoleh: (idMapel: string) => boolean;
    guruPenugasan: ReadonlyMap<string, string>;
  },
): { sel: Grid; hariBerubah: Set<number>; dilewati: string[] } {
  const sel: Grid = new Map(tujuan.sel);
  const hariBerubah = new Set<number>();
  const dilewati: string[] = [];
  for (const { kunci, lama, baru } of perubahan) {
    const ada = sel.get(kunci);
    if (baru) {
      if (
        tujuan.terkunci.has(kunci) ||
        !opsi.mapelBoleh(baru.id_mapel) ||
        (ada && ada.id_mapel !== baru.id_mapel)
      ) {
        dilewati.push(kunci);
        continue;
      }
      const isi = {
        id_mapel: baru.id_mapel,
        id_guru: opsi.guruPenugasan.get(baru.id_mapel) ?? baru.id_guru,
      };
      if (ada && samaIsi(ada, isi)) continue;
      sel.set(kunci, isi);
    } else {
      if (!ada || ada.id_mapel !== lama?.id_mapel) continue;
      sel.delete(kunci);
    }
    hariBerubah.add(Number(kunci.slice(0, kunci.indexOf(":"))));
  }
  return { sel, hariBerubah, dilewati };
}

export interface IsiSelGuru {
  id_mapel: string;
  rombel: string[];
}

/**
 * Jadwal satu guru: per sel, mapel beserta rombel yang diajar pada jam itu.
 * `jpRombel` menghitung tiap rombel (dasar beban per penugasan), `jpTatapMuka`
 * menghitung jam nyata, jadi kelas gabungan hanya terhitung sekali.
 */
export function petakanPerGuru(
  rows: readonly (BarisJadwal & { id_rombel: string })[],
): { sel: Map<string, IsiSelGuru[]>; jpRombel: number; jpTatapMuka: number } {
  const sel = new Map<string, IsiSelGuru[]>();
  let jpRombel = 0;
  for (const row of rows) {
    if (row.is_aktif !== 1) continue;
    for (const kunci of selBaris(row) ?? []) {
      jpRombel++;
      const isi = sel.get(kunci) ?? [];
      const mapel = isi.find((item) => item.id_mapel === row.id_mapel);
      if (mapel) {
        if (!mapel.rombel.includes(row.id_rombel))
          mapel.rombel.push(row.id_rombel);
      } else {
        isi.push({ id_mapel: row.id_mapel, rombel: [row.id_rombel] });
      }
      sel.set(kunci, isi);
    }
  }
  return { sel, jpRombel, jpTatapMuka: sel.size };
}
