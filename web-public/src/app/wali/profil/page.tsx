import { redirect } from "next/navigation";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { bacaProfilAnak } from "@/lib/services/wali-data";
import { PesanGagal } from "../PesanGagal";

export default async function HalamanProfil() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");

  let profil: Awaited<ReturnType<typeof bacaProfilAnak>>;
  try {
    profil = await bacaProfilAnak(await getReadyPublicDatabase(), sesi.idSiswa);
  } catch (error) {
    console.error("[web-public] gagal membaca profil anak:", error);
    return <PesanGagal konteks="Profil anak" />;
  }

  if (!profil) return <PesanGagal konteks="Profil anak" />;

  const baris = [
    { label: "Nama", nilai: profil.namaLengkap },
    { label: "NIS", nilai: profil.nis },
    { label: "NISN", nilai: profil.nisn },
    { label: "Rombel", nilai: profil.namaRombel },
    { label: "Wali", nilai: profil.namaWali },
  ].filter((item) => item.nilai);

  return (
    <main>
      <h1 className="font-semibold text-xl">Profil</h1>
      <dl className="mt-6 divide-y divide-garis border-garis border-t border-b">
        {baris.map((item) => (
          <div className="grid gap-1 py-3 sm:grid-cols-3" key={item.label}>
            <dt className="text-sm text-teks-lembut">{item.label}</dt>
            <dd className="sm:col-span-2">{item.nilai}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-teks-lembut leading-relaxed">
        Perubahan data anak dilakukan oleh sekolah. Bila ada yang tidak sesuai,
        silakan hubungi wali kelas.
      </p>
    </main>
  );
}
