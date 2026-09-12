import { redirect } from "next/navigation";
import { getReadyPublicDatabase } from "@/lib/server/db";
import { ambilSesiWali } from "@/lib/server/wali-session";
import {
  bacaNilaiAnak,
  modulNilaiTersedia,
  type NilaiPerMapel,
} from "@/lib/services/wali-nilai";
import { PesanGagal } from "../PesanGagal";

/**
 * Nilai anak, dikelompokkan per mata pelajaran.
 *
 * Halaman ini punya TIGA keadaan yang wajib dibedakan, bukan dua:
 *
 *   1. Modul nilai belum ada di database sekolah ini (skema masih di bawah
 *      v28) — sekolahnya belum memperbarui aplikasinya.
 *   2. Modul ada, tetapi guru belum memasukkan nilai apa pun untuk anak ini.
 *   3. Gagal dibaca.
 *
 * Menggabungkan ketiganya menjadi satu layar kosong membuat orang tua
 * menyimpulkan anaknya tidak punya nilai sama sekali — kesimpulan yang salah
 * pada dua dari tiga keadaan itu.
 */
export default async function HalamanNilai() {
  const sesi = await ambilSesiWali();
  if (!sesi) redirect("/wali");

  let tersedia = false;
  let perMapel: NilaiPerMapel[] = [];

  try {
    const client = await getReadyPublicDatabase();
    tersedia = await modulNilaiTersedia(client);
    if (tersedia) {
      // `idSiswa` dari SESI, tidak pernah dari permintaan.
      perMapel = await bacaNilaiAnak(client, sesi.idSiswa);
    }
  } catch (error) {
    console.error("[web-public] gagal membaca nilai anak:", error);
    return <PesanGagal konteks="Nilai akademik" />;
  }

  return (
    <main>
      <h1 className="font-semibold text-xl">Nilai</h1>

      {!tersedia ? (
        <div className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut leading-relaxed">
          Modul nilai belum tersedia pada sistem sekolah ini. Untuk sementara,
          nilai dapat dilihat pada rapor yang dibagikan sekolah.
        </div>
      ) : perMapel.length === 0 ? (
        <div className="mt-6 rounded-lg border border-garis border-dashed p-5 text-sm text-teks-lembut leading-relaxed">
          Belum ada nilai yang dimasukkan guru untuk anak Anda.
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {perMapel.map((mapel) => (
            <section key={mapel.namaMapel}>
              <h2 className="font-semibold text-base">{mapel.namaMapel}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-teks-lembut text-xs uppercase">
                    <tr>
                      <th className="py-2">Penilaian</th>
                      <th className="py-2">Tanggal</th>
                      <th className="py-2 text-right">Nilai</th>
                      <th className="py-2 text-right">KKM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mapel.item.map((item) => (
                      <tr
                        className="border-garis border-t"
                        key={item.idPenilaian}
                      >
                        <td className="py-2">
                          {item.namaPenilaian}
                          <span className="ml-2 text-teks-lembut text-xs">
                            {item.jenis}
                          </span>
                          {item.keterangan ? (
                            <span className="block text-teks-lembut text-xs">
                              {item.keterangan}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-2 text-teks-lembut">
                          {item.tanggal}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {/* `null` = belum dinilai. Menampilkan "0" di layar
                              orang tua adalah kesalahan yang paling mahal di
                              modul ini: anak yang gurunya belum selesai
                              menilai akan tampak gagal. */}
                          {item.skor === null ? (
                            <span className="text-teks-lembut">
                              Belum dinilai
                            </span>
                          ) : (
                            <>
                              {item.skor}
                              <span className="text-teks-lembut text-xs">
                                /{item.nilaiMaks}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="py-2 text-right text-teks-lembut">
                          {item.kkm}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <p className="text-sm text-teks-lembut leading-relaxed">
            KKM yang ditampilkan adalah nilai yang berlaku saat penilaian itu
            dibuat. Nilai akhir dan rapor diterbitkan sekolah secara terpisah.
          </p>
        </div>
      )}
    </main>
  );
}
