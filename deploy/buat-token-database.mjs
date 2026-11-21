// Membuat kunci autentikasi database (sqld) dan satu token untuk aplikasi.
// Cara menjalankan: README.md, bagian "Aplikasi Desktop dan Mobile".
//
// Kunci privat sengaja tidak disimpan, jadi tidak ada berkas rahasia yang bisa
// tertinggal di server. Untuk token baru, jalankan lagi lalu ganti kedua baris
// di `.env`: kunci baru langsung mematikan semua token lama.
import { generateKeyPairSync, sign } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const base64url = (objek) =>
  Buffer.from(JSON.stringify(objek)).toString("base64url");

// `a: "rw"` = baca dan tulis. Tanpa `exp`: token tidak kedaluwarsa sendiri,
// supaya Desktop/Mobile tidak tiba-tiba berhenti sinkron. Ia mati saat kunci diganti.
const isi = `${base64url({ alg: "EdDSA", typ: "JWT" })}.${base64url({
  a: "rw",
  iat: Math.floor(Date.now() / 1000),
})}`;
const tandaTangan = sign(null, Buffer.from(isi), privateKey).toString(
  "base64url",
);

console.log(`KOS_DATABASE_JWT_KEY=${publicKey.export({ format: "jwk" }).x}`);
console.log(`KOS_DATABASE_AUTH_TOKEN=${isi}.${tandaTangan}`);
