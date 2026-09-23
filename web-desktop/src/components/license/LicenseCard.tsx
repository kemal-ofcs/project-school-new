"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/AuthContext";
import { LICENSE_KIND_LABEL } from "@/lib/gateways/license";
import { useLicenseStatus } from "@/lib/hooks/useLicenseStatus";
import { LicenseActivationPanel } from "./LicenseActivationPanel";

const STATE_LABEL = {
  active: "Aktif",
  read_only: "Mode baca-saja",
  missing: "Belum ada lisensi",
  invalid: "Tidak sah",
  device_not_listed: "Perangkat tidak terdaftar",
} as const;

/**
 * Kartu Lisensi di Pengaturan (Desktop dan Mobile). Semua pengguna yang login
 * boleh melihatnya; mengganti lisensi yang masih aktif hanya untuk Superadmin,
 * sama dengan aturan `desktop_install_license`. Tidak merender apa pun di Web.
 */
export function LicenseCard() {
  const { user } = useAuth();
  const { status, setStatus } = useLicenseStatus();
  const [replacing, setReplacing] = useState(false);
  if (!status) return null;

  const license = status.license;
  const canReplace = status.state !== "active" || Boolean(user?.isSuperadmin);
  const rows: [string, string][] = license
    ? [
        ["Pemegang", license.holder],
        ["Nomor lisensi", license.id],
        ["Jenis", LICENSE_KIND_LABEL[license.kind]],
        ["Terbit", license.issued],
        ["Pembaruan sampai", license.updatesUntil],
        ["Berlaku sampai", license.validUntil ?? "Selamanya"],
        [
          "Perangkat",
          license.devices.length
            ? `${license.devices.length} terdaftar${status.deviceBound ? "" : " (perangkat ini tidak wajib terdaftar)"}`
            : "Tidak dikunci ke perangkat",
        ],
      ]
    : [];

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 sm:p-7 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white">Lisensi</h2>
          <p className="text-xs text-slate-400">
            Status: {STATE_LABEL[status.state]}
          </p>
        </div>
        {canReplace && !replacing ? (
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="min-h-10 rounded-xl border border-slate-700 bg-slate-800/80 px-3 text-xs font-bold text-slate-300 transition hover:bg-slate-700"
          >
            {status.state === "active" ? "Ganti lisensi" : "Aktifkan lisensi"}
          </button>
        ) : null}
      </div>

      {rows.length ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-semibold text-slate-300 break-words">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-xs text-slate-400">
        Kode perangkat ini:{" "}
        <code className="select-all font-mono font-bold text-slate-300">
          {status.deviceCode}
        </code>
      </p>

      {replacing ? (
        <div className="border-t border-white/10 pt-4">
          <LicenseActivationPanel
            status={status}
            onInstalled={(next) => {
              setStatus(next);
              setReplacing(false);
            }}
            onDismiss={() => setReplacing(false)}
            dismissLabel="Batal"
          />
        </div>
      ) : null}
    </section>
  );
}
