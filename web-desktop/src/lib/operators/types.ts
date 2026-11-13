export interface OperatorRecord {
  id: number;
  kodeOperator: string;
  name: string;
  username: string;
  /**
   * Kontak akun. Baris operator lama bisa masih kosong: kolomnya NULL-able di
   * DDL supaya migrasi tidak merusak data yang sudah ada. Validasi aplikasi
   * mewajibkan keduanya pada setiap penyimpanan baru, jadi kekosongan ini
   * hanya bersifat sementara sampai akun tersebut disunting sekali.
   */
  email: string;
  noHp: string;
  /** Verifikasi dua langkah aktif pada akun ini. */
  totpEnabled: boolean;
  roleId: number;
  roleKey: string;
  roleName: string;
  isSuperadmin: boolean;
  status: "Aktif" | "Nonaktif";
  /** Personil yang ditautkan (A-2, v68); kosong = tanpa tautan. */
  idKaryawan: string;
}

export interface OperatorDraft {
  kodeOperator: string;
  name: string;
  username: string;
  email: string;
  noHp: string;
  password?: string;
  roleId: number;
  status: "Aktif" | "Nonaktif";
  /** `undefined` = jangan ubah, "" = lepas tautan. */
  idKaryawan?: string;
}
