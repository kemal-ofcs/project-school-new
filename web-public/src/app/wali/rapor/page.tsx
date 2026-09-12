import { redirect } from "next/navigation";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { ambilSesiWali } from "@/lib/server/wali-session";
import { bacaLeger } from "@/lib/services/wali-data";
import { PesanGagal } from "../PesanGagal";

export default async function HalamanRapor() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");

  let baris: Awaited<ReturnType<typeof bacaLeger>>;
  try {
    baris = await bacaLeger(await getReadyPublicDatabase(), sesi.idSiswa);
  } catch (error) {
    console.error("[web-public] gagal membaca leger kehadiran:", error);
    return <PesanGagal konteks="Rekap kehadiran rapor" />;
  }

  return (
    <main>
      <h1 className="font-semibold text-xl">Rekap Kehadiran Rapor</h1>
      <p className="mt-1 text-sm text-teks-lembut leading-relaxed">
        Angka yang sudah dibekukan sekolah untuk rapor. Nilainya sama persis
        dengan yang tercetak di rapor anak Anda.
      </p>

      {baris.length === 0 ? (
        <p className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut">
          Belum ada rekap yang dibekukan untuk anak Anda.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {baris.map((item, urutan) => (
            <li
              className="rounded-lg border border-garis p-5"
              key={`${item.namaTahun}-${item.semester}-${urutan}`}
            >
              <p className="font-medium">
                {item.namaTahun} · Semester {item.semester}
              </p>
              <p className="mt-1 text-sm text-teks-lembut">
                Kehadiran {item.persenKehadiran.toFixed(1)}% dari{" "}
                {item.totalHariEfektif} hari efektif
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
                <div>
                  <dt className="text-teks-lembut text-xs">Hadir</dt>
                  <dd>{item.hadir}</dd>
                </div>
                <div>
                  <dt className="text-teks-lembut text-xs">Izin</dt>
                  <dd>{item.izin}</dd>
                </div>
                <div>
                  <dt className="text-teks-lembut text-xs">Sakit</dt>
                  <dd>{item.sakit}</dd>
                </div>
                <div>
                  <dt className="text-teks-lembut text-xs">Alfa</dt>
                  <dd>{item.alfa}</dd>
                </div>
                <div>
                  <dt className="text-teks-lembut text-xs">Dispensasi</dt>
                  <dd>{item.dispensasi}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
