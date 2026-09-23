"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { BackHeader } from "@/components/ui/HubRow";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";
import { getRiwayatIdentitasKaryawan } from "@/lib/gateways/employee-identity-history";
import {
  EMPLOYEE_IDENTITY_FIELDS,
  LABEL_IDENTITAS_KARYAWAN,
  type RiwayatIdentitasKaryawan,
} from "@/lib/validations/employee-identity";

/**
 * Riwayat penggantian identitas karyawan (Mobile).
 *
 * Satu baris lahir setiap kali operator memilih "Gunakan Versi Lokal" pada
 * konflik ID Unik. Tabelnya khusus cloud, jadi halaman ini butuh jaringan dan
 * kegagalannya ditampilkan apa adanya, bukan sebagai daftar kosong.
 */
export default function RiwayatIdentitasKaryawanMobilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const canView = canAccessArea(user, "karyawan");

  const [entries, setEntries] = useState<RiwayatIdentitasKaryawan[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    // Mobile memakai static export dan tidak punya rute `/forbidden`.
    if (!authLoading && isAuthenticated && !canView) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, canView, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await getRiwayatIdentitasKaryawan(search));
    } catch (caught) {
      setEntries([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Riwayat tidak dapat dimuat. Periksa koneksi ke database cloud.",
      );
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!isAuthenticated || !canView) return;
    void load();
  }, [isAuthenticated, canView, load]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4 text-slate-100">
        <BackHeader
          href="/operasional-hub"
          label="Operasional"
          title="Riwayat Identitas Karyawan"
        />
        <p className="text-xs text-slate-400">
          Data karyawan di server yang diganti lewat Gunakan Versi Lokal karena
          ID Unik-nya bentrok, lengkap dengan data sebelum dan sesudahnya.
        </p>

        <label className="block">
          <span className="sr-only">Cari riwayat identitas karyawan</span>
          <input
            id="cari-riwayat-identitas"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari ID Unik, nama, kode, atau operator"
            className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">
            Memuat riwayat...
          </p>
        ) : entries.length === 0 && !error ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-center">
            <p className="font-black text-white">Belum ada penggantian</p>
            <p className="mt-1 text-xs text-slate-400">
              Riwayat terisi saat konflik ID Unik diselesaikan dengan Gunakan
              Versi Lokal di halaman Sinkronisasi.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </MobileAppShell>
  );
}

function HistoryEntry({ entry }: { entry: RiwayatIdentitasKaryawan }) {
  const berubah = EMPLOYEE_IDENTITY_FIELDS.filter(
    (field) => (entry.dataLama[field] ?? "") !== (entry.dataBaru[field] ?? ""),
  );
  return (
    <li className="rounded-2xl border border-white/10 bg-slate-900 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-black text-white">ID Unik {entry.idUnik}</p>
        <p className="shrink-0 text-[11px] text-slate-400">{entry.waktu}</p>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Operator{" "}
        <span className="font-bold text-slate-200">
          {entry.kodeOperator || "tidak tercatat"}
        </span>
      </p>
      <dl className="mt-3 flex flex-col gap-2 text-xs">
        {berubah.map((field) => (
          <div key={field}>
            <dt className="text-slate-500">
              {LABEL_IDENTITAS_KARYAWAN[field]}
            </dt>
            <dd className="text-rose-200">
              Sebelum: {entry.dataLama[field] || "-"}
            </dd>
            <dd className="font-bold text-amber-100">
              Sesudah: {entry.dataBaru[field] || "-"}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
