"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { exportToExcel } from "@/lib/client/excel-export";
import { getDaftarKaryawan } from "@/lib/gateways/employee";
import { createOperator } from "@/lib/gateways/master-operator";
import { useConfirmDialog } from "@/lib/hooks/useConfirmDialog";
import {
  type DraftAkunMassal,
  type PersonilTanpaAkun,
  susunDraftAkun,
} from "@/lib/operators/akun-massal";
import type { OperatorRecord } from "@/lib/operators/types";
import type { RoleRecord } from "@/lib/rbac/types";

/**
 * Buat akun untuk banyak guru dan staf sekaligus. Setiap baris disimpan lewat
 * `createOperator` yang sama dengan form satuan, jadi aturan akun (HP unik,
 * satu personil satu akun aktif, kekuatan password) tetap dijaga backend TS
 * dan Rust. Password sementara hanya tampil di layar hasil: database hanya
 * menyimpan hash-nya.
 */

type Kelompok = "Semua" | "Guru" | "Staf";

interface Personil extends PersonilTanpaAkun {
  kelompok: "Guru" | "Staf";
  divisi: string;
}

interface Hasil {
  draft: DraftAkunMassal;
  pesan: string | null;
}

export function BuatAkunMassal({
  actorId,
  operators,
  roles,
  onClose,
  onSelesai,
}: {
  actorId: number;
  operators: OperatorRecord[];
  roles: RoleRecord[];
  onClose: () => void;
  onSelesai: () => void;
}) {
  const { konfirmasi, dialogKonfirmasi } = useConfirmDialog();
  const isSubmittingRef = useRef(false);
  const [personil, setPersonil] = useState<Personil[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState("");
  const [kelompok, setKelompok] = useState<Kelompok>("Semua");
  const [cari, setCari] = useState("");
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const roleAktif = roles.filter(
    (r) => r.status === "Aktif" && !r.isSuperadmin,
  );
  const [roleId, setRoleId] = useState(roleAktif[0]?.id ?? 0);
  const [drafts, setDrafts] = useState<DraftAkunMassal[] | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hasil, setHasil] = useState<Hasil[] | null>(null);

  // Personil yang sudah punya akun AKTIF tidak ditawarkan lagi.
  const sudahBerakun = useMemo(
    () =>
      new Set(
        operators
          .filter((o) => o.status === "Aktif" && o.idKaryawan)
          .map((o) => o.idKaryawan),
      ),
    [operators],
  );

  useEffect(() => {
    let batal = false;
    getDaftarKaryawan({ status_aktif: "Aktif" })
      .then((rows) => {
        if (batal) return;
        setPersonil(
          rows
            .map((row) => {
              const jenis = String(row.jenis_personil ?? "")
                .trim()
                .toLowerCase();
              return {
                id_unik: String(row.id_unik ?? ""),
                nama: String(row.nama ?? ""),
                kode_karyawan: String(row.kode_karyawan ?? ""),
                no_hp: String(row.no_hp ?? ""),
                email: String(row.email ?? ""),
                divisi: String(row.divisi ?? ""),
                jenis,
                status: String(row.status_aktif ?? ""),
              };
            })
            .filter((p) => p.jenis !== "siswa" && p.status === "Aktif")
            .map(({ jenis, status: _status, ...p }) => ({
              ...p,
              kelompok:
                jenis === "guru" ? ("Guru" as const) : ("Staf" as const),
            })),
        );
      })
      .catch((error: unknown) => {
        if (!batal) {
          setGalatMuat(
            error instanceof Error ? error.message : "Gagal memuat personil.",
          );
        }
      })
      .finally(() => {
        if (!batal) setMemuat(false);
      });
    return () => {
      batal = true;
    };
  }, []);

  const kandidat = personil.filter(
    (p) =>
      !sudahBerakun.has(p.id_unik) &&
      (kelompok === "Semua" || p.kelompok === kelompok) &&
      (!cari.trim() ||
        `${p.nama} ${p.kode_karyawan} ${p.divisi}`
          .toLowerCase()
          .includes(cari.trim().toLowerCase())),
  );
  const semuaTercentang =
    kandidat.length > 0 && kandidat.every((p) => terpilih.has(p.id_unik));

  const lanjut = () => {
    const dipilih = personil.filter((p) => terpilih.has(p.id_unik));
    setDrafts(susunDraftAkun(dipilih, operators));
  };

  const ubahDraft = (i: number, kolom: keyof DraftAkunMassal, nilai: string) =>
    setDrafts((lama) =>
      lama
        ? lama.map((d, j) => (j === i ? { ...d, [kolom]: nilai } : d))
        : lama,
    );

  const simpan = async () => {
    if (!drafts || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setMenyimpan(true);
    const keluaran: Hasil[] = [];
    try {
      // Satu per satu, bukan paralel: HP dan username diperiksa unik di
      // backend, dan dua permintaan serentak bisa sama-sama lolos.
      for (const draft of drafts) {
        try {
          await createOperator(actorId, {
            kodeOperator: draft.kodeOperator,
            name: draft.name,
            username: draft.username,
            email: draft.email,
            noHp: draft.noHp,
            password: draft.password,
            roleId,
            status: "Aktif",
            idKaryawan: draft.idKaryawan,
          });
          keluaran.push({ draft, pesan: null });
        } catch (error: unknown) {
          keluaran.push({
            draft,
            pesan: error instanceof Error ? error.message : "Gagal dibuat.",
          });
        }
      }
      setHasil(keluaran);
      onSelesai();
    } finally {
      isSubmittingRef.current = false;
      setMenyimpan(false);
    }
  };

  const berhasil = hasil?.filter((h) => h.pesan === null) ?? [];
  const gagal = hasil?.filter((h) => h.pesan !== null) ?? [];
  const namaRole = roles.find((r) => r.id === roleId)?.name ?? "";

  const unduh = () =>
    exportToExcel(
      "akun-guru-staf",
      "Akun",
      ["Nama", "Username", "Password sementara", "Role"],
      berhasil.map((h) => [
        h.draft.name,
        h.draft.username,
        h.draft.password,
        namaRole,
      ]),
    );

  const tutup = async () => {
    if (
      berhasil.length > 0 &&
      !(await konfirmasi({
        title: "Tutup lembar akun?",
        description:
          "Password sementara tidak bisa dilihat lagi sesudah lembar ini ditutup.",
        preserved:
          "Akunnya tetap ada. Password bisa diganti Admin dari daftar operator.",
        confirmLabel: "Ya, tutup",
        tone: "warning",
      }))
    ) {
      return;
    }
    onClose();
  };

  const kelasInput =
    "w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-500";

  return (
    <Modal
      title="Buat Akun Massal"
      titleId="modal-akun-massal"
      subtitle="Guru dan staf yang belum punya akun"
      maxWidth="max-w-4xl"
      onClose={() => void tutup()}
    >
      {hasil ? (
        <div className="space-y-4 text-sm text-slate-300">
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            {berhasil.length} akun dibuat. Unduh lembar ini sekarang: password
            sementara hanya tampil sekali.
          </p>
          {berhasil.length > 0 ? (
            <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/80 text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Password sementara</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {berhasil.map((h) => (
                    <tr key={h.draft.idKaryawan}>
                      <td className="px-3 py-2 text-slate-200">
                        {h.draft.name}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {h.draft.username}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {h.draft.password}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {gagal.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-rose-400">
                {gagal.length} akun gagal dibuat:
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-400">
                {gagal.map((h) => (
                  <li key={h.draft.idKaryawan}>
                    {h.draft.name}: {h.pesan}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            {berhasil.length > 0 ? (
              <button
                type="button"
                onClick={() => void unduh()}
                className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white"
              >
                Unduh Excel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void tutup()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300"
            >
              Selesai
            </button>
          </div>
        </div>
      ) : drafts ? (
        <div className="space-y-4 text-sm text-slate-300">
          <p className="text-xs text-slate-400">
            Periksa usulan akun. Username, nomor HP, dan email bisa diubah.
            Email boleh kosong karena akun ditautkan ke personilnya; lupa
            password akun tanpa email dibantu Admin.
          </p>
          <div className="max-h-96 overflow-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-slate-800 text-slate-400">
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Username</th>
                  <th className="px-3 py-2">Nomor HP</th>
                  <th className="px-3 py-2">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {drafts.map((d, i) => (
                  <tr key={d.idKaryawan}>
                    <td className="px-3 py-1.5 text-slate-200">{d.name}</td>
                    <td className="px-3 py-1.5">
                      <input
                        aria-label={`Username ${d.name}`}
                        value={d.username}
                        onChange={(e) =>
                          ubahDraft(i, "username", e.target.value)
                        }
                        className={`${kelasInput} font-mono`}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        aria-label={`Nomor HP ${d.name}`}
                        value={d.noHp}
                        inputMode="tel"
                        onChange={(e) => ubahDraft(i, "noHp", e.target.value)}
                        className={`${kelasInput} ${
                          d.noHp.trim() ? "" : "border-rose-500/60"
                        }`}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        aria-label={`Email ${d.name}`}
                        type="email"
                        value={d.email}
                        onChange={(e) => ubahDraft(i, "email", e.target.value)}
                        className={kelasInput}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setDrafts(null)}
              disabled={menyimpan}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 disabled:opacity-50"
            >
              Kembali
            </button>
            <button
              type="button"
              data-konfirmasi
              onClick={() => void simpan()}
              disabled={menyimpan || roleId < 1}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {menyimpan
                ? "Membuat akun..."
                : `Buat ${drafts.length} akun (${namaRole})`}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-300">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
              Role untuk semua akun
              <select
                value={roleId}
                onChange={(e) => setRoleId(Number(e.target.value))}
                className={kelasInput}
              >
                {roleAktif.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
              Kelompok
              <select
                value={kelompok}
                onChange={(e) => setKelompok(e.target.value as Kelompok)}
                className={kelasInput}
              >
                <option value="Semua">Guru dan staf</option>
                <option value="Guru">Guru</option>
                <option value="Staf">Staf</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">
              Cari
              <input
                type="search"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Nama, kode, atau divisi"
                className={kelasInput}
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Belum ada role "Guru" atau "Staf"? Buat dulu di tab Role & Akses,
            lalu pilih di sini.
          </p>

          <div className="max-h-80 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-800 text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua yang tampil"
                      checked={semuaTercentang}
                      onChange={(e) => {
                        const centang = e.target.checked;
                        setTerpilih((lama) => {
                          const baru = new Set(lama);
                          for (const p of kandidat) {
                            if (centang) baru.add(p.id_unik);
                            else baru.delete(p.id_unik);
                          }
                          return baru;
                        });
                      }}
                      className="size-4 accent-sky-500"
                    />
                  </th>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Kode</th>
                  <th className="px-3 py-2">Kelompok</th>
                  <th className="px-3 py-2">Nomor HP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {memuat ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      Memuat guru dan staf...
                    </td>
                  </tr>
                ) : galatMuat ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-rose-400"
                    >
                      {galatMuat}
                    </td>
                  </tr>
                ) : kandidat.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      Semua guru dan staf di pilihan ini sudah punya akun.
                    </td>
                  </tr>
                ) : (
                  kandidat.map((p) => (
                    <tr key={p.id_unik}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${p.nama}`}
                          checked={terpilih.has(p.id_unik)}
                          onChange={(e) => {
                            const centang = e.target.checked;
                            setTerpilih((lama) => {
                              const baru = new Set(lama);
                              if (centang) baru.add(p.id_unik);
                              else baru.delete(p.id_unik);
                              return baru;
                            });
                          }}
                          className="size-4 accent-sky-500"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-slate-200">{p.nama}</td>
                      <td className="px-3 py-1.5 font-mono">
                        {p.kode_karyawan}
                      </td>
                      <td className="px-3 py-1.5">{p.kelompok}</td>
                      <td
                        className={`px-3 py-1.5 ${p.no_hp ? "" : "text-rose-400"}`}
                      >
                        {p.no_hp || "kosong"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={lanjut}
              disabled={terpilih.size === 0 || roleId < 1}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Lanjut ({terpilih.size} dipilih)
            </button>
          </div>
        </div>
      )}
      {dialogKonfirmasi}
    </Modal>
  );
}
