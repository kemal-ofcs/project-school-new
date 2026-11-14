"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Modal } from "@/components/ui/Modal";
import {
  type JenisDokumen,
  muatDokumen,
  simpanJenisDokumen,
} from "@/lib/gateways/hris";
import { INPUT, LABEL, pesanGalat, TOMBOL, TOMBOL_UTAMA } from "./gaya";

/**
 * Jenis dokumen kepegawaian di tab Organisasi (`hr.org.manage`). Tabelnya
 * cloud-only, jadi bagian ini dimuat sendiri dan menampilkan pesan saat
 * luring tanpa menahan bagian Organisasi lain yang tersinkron.
 */
export function JenisDokumenOrganisasi({
  bolehUbah,
  onPesan,
}: {
  bolehUbah: boolean;
  onPesan: (pesan: string) => void;
}) {
  const [jenis, setJenis] = useState<JenisDokumen[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sunting, setSunting] = useState<JenisDokumen | "baru" | null>(null);
  const isSubmittingRef = useRef(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const muat = useCallback(async () => {
    try {
      setJenis((await muatDokumen()).jenis);
      setGalat(null);
    } catch (error) {
      setGalat(pesanGalat(error));
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const simpan = async (
    draft: { id?: string; nama: string; is_aktif: 0 | 1 },
    berhasil: string,
  ) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    try {
      await simpanJenisDokumen(draft);
      setSunting(null);
      await muat();
      onPesan(berhasil);
    } catch (error) {
      setGalat(pesanGalat(error));
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  return (
    <section aria-labelledby="judul-jenis-dokumen" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="judul-jenis-dokumen"
          className="text-base font-semibold text-white"
        >
          Jenis dokumen pegawai
        </h2>
        {bolehUbah && jenis ? (
          <button
            type="button"
            className={TOMBOL_UTAMA}
            onClick={() => setSunting("baru")}
          >
            Tambah jenis dokumen
          </button>
        ) : null}
      </div>
      {galat ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-rose-300" role="alert">
            {galat}
          </p>
          <button type="button" className={TOMBOL} onClick={() => void muat()}>
            Coba lagi
          </button>
        </div>
      ) : null}
      {!jenis && !galat ? (
        <p className="text-sm text-slate-400">Memuat jenis dokumen…</p>
      ) : null}
      {jenis ? (
        <ul className="space-y-2">
          {jenis.map((j) => (
            <li
              key={j.id_jenis}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-semibold text-white">{j.nama}</span>
                {j.is_aktif === 1 ? null : (
                  <span className="text-slate-400"> · nonaktif</span>
                )}
              </span>
              {bolehUbah ? (
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={TOMBOL}
                    onClick={() => setSunting(j)}
                  >
                    Ganti nama
                  </button>
                  <button
                    type="button"
                    className={TOMBOL}
                    disabled={menyimpan}
                    onClick={() =>
                      void simpan(
                        {
                          id: j.id_jenis,
                          nama: j.nama,
                          is_aktif: j.is_aktif === 1 ? 0 : 1,
                        },
                        j.is_aktif === 1
                          ? `"${j.nama}" dinonaktifkan.`
                          : `"${j.nama}" diaktifkan.`,
                      )
                    }
                  >
                    {j.is_aktif === 1 ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {sunting ? (
        <ModalJenisDokumen
          awal={sunting === "baru" ? null : sunting}
          menyimpan={menyimpan}
          onClose={() => setSunting(null)}
          onSimpan={(nama) =>
            void simpan(
              {
                id: sunting === "baru" ? undefined : sunting.id_jenis,
                nama,
                is_aktif: sunting === "baru" || sunting.is_aktif === 1 ? 1 : 0,
              },
              `Jenis dokumen "${nama}" disimpan.`,
            )
          }
        />
      ) : null}
    </section>
  );
}

function ModalJenisDokumen({
  awal,
  menyimpan,
  onClose,
  onSimpan,
}: {
  awal: JenisDokumen | null;
  menyimpan: boolean;
  onClose: () => void;
  onSimpan: (nama: string) => void;
}) {
  const [nama, setNama] = useState(awal?.nama ?? "");
  const kirim = (event: FormEvent) => {
    event.preventDefault();
    onSimpan(nama);
  };
  return (
    <Modal
      title={awal ? "Ganti nama jenis dokumen" : "Tambah jenis dokumen"}
      onClose={onClose}
      hideFooter
    >
      <form className="space-y-4" onSubmit={kirim}>
        <div>
          <label htmlFor="jenis-dokumen-nama" className={LABEL}>
            Nama jenis dokumen
          </label>
          <input
            id="jenis-dokumen-nama"
            required
            minLength={2}
            maxLength={60}
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            className={INPUT}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={TOMBOL} onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={TOMBOL_UTAMA} disabled={menyimpan}>
            Simpan
          </button>
        </div>
      </form>
    </Modal>
  );
}
