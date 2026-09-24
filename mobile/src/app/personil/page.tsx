"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { HubRow } from "@/components/ui/HubRow";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export default function PersonilPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canKaryawan = canAccessArea(user, "karyawan");
  const canSiswa = canAccessArea(user, "siswa");
  const canGuru = canAccessArea(user, "guru");
  const canIdCards = canAccessArea(user, "idcards");
  const bolehBukaHalaman = canKaryawan || canSiswa || canGuru || canIdCards;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!authLoading && isAuthenticated && !bolehBukaHalaman) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, bolehBukaHalaman, router]);

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl border border-white/15 bg-slate-900/90 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl bg-sky-500/10 text-sky-300 border border-sky-400/20">
              <span className="text-sm">👥</span>
            </div>
            <h1 className="text-base font-black text-white">
              Karyawan & Peserta Didik
            </h1>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {canKaryawan && (
            <HubRow
              href="/karyawan"
              icon="users"
              title="Karyawan"
              subtitle="Direktori pegawai & barcode absensi"
              tone="sky"
            />
          )}
          {canSiswa && (
            <HubRow
              href="/siswa"
              icon="users"
              title="Peserta Didik"
              subtitle="Direktori peserta didik, wali murid & barcode"
              tone="teal"
            />
          )}
          {canGuru && (
            <HubRow
              href="/guru"
              icon="user"
              title="Guru & PTK"
              subtitle="Direktori pendidik & barcode absensi"
              tone="indigo"
            />
          )}
          {canIdCards && (
            <HubRow
              href="/id-cards"
              icon="id-card"
              title="Cetak ID Card"
              subtitle="Status cetak kartu, pratinjau & simpan gambar"
              tone="purple"
            />
          )}
        </div>
      </div>
    </MobileAppShell>
  );
}
