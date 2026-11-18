/**
 * Penyusun draft "Buat Akun Massal" untuk guru dan staf.
 *
 * Murni dan tanpa I/O: layar mengisi tabel dari sini, lalu setiap baris
 * disimpan lewat `createOperator` yang sama dengan form satuan, sehingga
 * validasi TS dan Rust tetap satu-satunya penjaga. Username dan kode operator
 * hanya USULAN yang bisa disunting; keunikan sesungguhnya tetap diputus
 * database.
 */

/** Huruf dan angka yang mudah dibaca di kertas: tanpa 0/O, 1/l/I. */
const HURUF_BESAR = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const HURUF_KECIL = "abcdefghijkmnpqrstuvwxyz";
const ANGKA = "23456789";
const SEMUA = HURUF_BESAR + HURUF_KECIL + ANGKA;
const PANJANG_PASSWORD = 12;

/** Bilangan acak seragam di [0, batas); bawaan memakai `crypto`. */
export type Acak = (batas: number) => number;

export const acakKripto: Acak = (batas) => {
  // Rejection sampling: modulo biasa membuat sebagian karakter lebih sering.
  const atas = Math.floor(0x100000000 / batas) * batas;
  const wadah = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(wadah);
    if (wadah[0] < atas) return wadah[0] % batas;
  }
};

/**
 * Password sementara 12 karakter yang selalu lolos `validatePasswordStrength`
 * (huruf besar, huruf kecil, angka).
 */
export function buatPasswordSementara(acak: Acak = acakKripto): string {
  const ambil = (dari: string) => dari[acak(dari.length)];
  const isi = [ambil(HURUF_BESAR), ambil(HURUF_KECIL), ambil(ANGKA)];
  while (isi.length < PANJANG_PASSWORD) isi.push(ambil(SEMUA));
  for (let i = isi.length - 1; i > 0; i--) {
    const j = acak(i + 1);
    [isi[i], isi[j]] = [isi[j], isi[i]];
  }
  return isi.join("");
}

/** Bentuk dasar username: huruf kecil, `[a-z0-9._-]`, 3-40 karakter. */
export function dasarUsername(kode: string, nama: string): string {
  const bersih = (teks: string) =>
    teks
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, ".")
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/\.{2,}/g, ".")
      .replace(/^[.]+|[.]+$/g, "");
  const dariKode = bersih(kode);
  const dariNama = bersih(nama.split(/\s+/).slice(0, 2).join(" "));
  const dasar = dariKode.length >= 3 ? dariKode : dariNama;
  return (dasar.length >= 3 ? dasar : `${dasar}akun`).slice(0, 40);
}

/** Bentuk dasar kode operator: huruf besar, `[A-Z0-9_-]`, 3-24 karakter. */
export function dasarKodeOperator(kode: string): string {
  const bersih = kode
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "");
  return (bersih.length >= 3 ? bersih : `AKN${bersih}`).slice(0, 24);
}

/**
 * Nilai unik terhadap `terpakai` (dibandingkan tanpa beda huruf besar/kecil):
 * `budi`, lalu `budi2`, `budi3`, dan seterusnya, tetap dalam batas panjang.
 * Nilai yang dipilih langsung dimasukkan ke `terpakai`.
 */
export function jadikanUnik(
  dasar: string,
  terpakai: Set<string>,
  panjangMaks: number,
): string {
  let calon = dasar;
  for (let n = 2; terpakai.has(calon.toLowerCase()); n++) {
    const akhiran = String(n);
    calon = `${dasar.slice(0, panjangMaks - akhiran.length)}${akhiran}`;
  }
  terpakai.add(calon.toLowerCase());
  return calon;
}

export interface PersonilTanpaAkun {
  id_unik: string;
  nama: string;
  kode_karyawan: string;
  no_hp: string;
  email: string;
}

export interface DraftAkunMassal {
  idKaryawan: string;
  name: string;
  username: string;
  kodeOperator: string;
  password: string;
  noHp: string;
  email: string;
}

/** Usulan akun untuk setiap personil, unik terhadap akun yang sudah ada. */
export function susunDraftAkun(
  personil: readonly PersonilTanpaAkun[],
  akunAda: readonly { username: string; kodeOperator: string }[],
  acak: Acak = acakKripto,
): DraftAkunMassal[] {
  const username = new Set(akunAda.map((a) => a.username.toLowerCase()));
  const kode = new Set(akunAda.map((a) => a.kodeOperator.toLowerCase()));
  return personil.map((p) => ({
    idKaryawan: p.id_unik,
    name: p.nama.trim(),
    username: jadikanUnik(dasarUsername(p.kode_karyawan, p.nama), username, 40),
    kodeOperator: jadikanUnik(
      dasarKodeOperator(p.kode_karyawan || p.id_unik),
      kode,
      24,
    ),
    password: buatPasswordSementara(acak),
    noHp: p.no_hp.trim(),
    email: p.email.trim(),
  }));
}
