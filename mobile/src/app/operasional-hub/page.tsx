"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import { HubGroupLabel, HubRow } from "@/components/ui/HubRow";
import { Icon } from "@/components/ui/Icon";
import { canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

export default function OperasionalHubPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const canOperational = canAccessArea(user, "operational");
  const canHistory = canAccessArea(user, "history");
  const canDasborKehadiran = canAccessArea(user, "dasbor_kehadiran");
  const canNotifikasiWa = canAccessArea(user, "notifikasi_wa");
  const canOperators = canAccessArea(user, "operators");
  const canPasswordReset = canAccessArea(user, "password_reset");
  const canAttendancePhoto = canAccessArea(user, "attendance_photo");
  const canKonten = canAccessArea(user, "konten");
  const canPmb = canAccessArea(user, "pmb");

  const canHarian = canOperational || canHistory;
  const canLaporan = canDasborKehadiran;
  const canAdmin =
    canNotifikasiWa ||
    canOperators ||
    canPasswordReset ||
    canAttendancePhoto ||
    canKonten ||
    canPmb;
  const bolehBukaHalaman = canHarian || canLaporan || canAdmin;

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
              <Icon name="tools" className="size-5" />
            </div>
            <h1 className="text-base font-black text-white">Operasional</h1>
          </div>
        </div>

        {canHarian ? (
          <section aria-labelledby="grup-operasional-harian">
            <HubGroupLabel id="grup-operasional-harian">
              Operasional Harian
            </HubGroupLabel>
            <div className="flex flex-col gap-2">
              {canOperational && (
                <HubRow
                  href="/operational"
                  icon="tools"
                  title="Pusat Operasional"
                  subtitle="Koreksi admin, penugasan backup & entri manual"
                  tone="sky"
                />
              )}
              {canHistory && (
                <HubRow
                  href="/history"
                  icon="history"
                  title="Riwayat"
                  subtitle="Log scan & absensi harian"
                  tone="neutral"
                />
              )}
            </div>
          </section>
        ) : null}

        {canLaporan ? (
          <section aria-labelledby="grup-laporan">
            <HubGroupLabel id="grup-laporan">Laporan</HubGroupLabel>
            <div className="flex flex-col gap-2">
              <HubRow
                href="/dasbor-kehadiran"
                icon="dashboard"
                title="Dasbor Kehadiran"
                subtitle="Rekap siswa & guru, per rombel, indikasi bolos"
                tone="indigo"
              />
            </div>
          </section>
        ) : null}

        {canAdmin ? (
          <section aria-labelledby="grup-admin-keamanan">
            <HubGroupLabel id="grup-admin-keamanan">
              Administrasi & Keamanan
            </HubGroupLabel>
            <div className="flex flex-col gap-2">
              {canNotifikasiWa && (
                <HubRow
                  href="/notifikasi-wa"
                  icon="whatsapp"
                  title="Notifikasi WhatsApp"
                  subtitle="Antrean pesan wali murid, status kirim & gateway"
                  tone="emerald"
                />
              )}
              {canAttendancePhoto && (
                <HubRow
                  href="/foto-absensi"
                  icon="scanner"
                  title="Foto Bukti Absensi"
                  subtitle="Foto saat scan, alamat IP perangkat & operatornya"
                  tone="sky"
                />
              )}
              {canPasswordReset && (
                <HubRow
                  href="/riwayat-reset-password"
                  icon="lock"
                  title="Riwayat Reset Password"
                  subtitle="Siapa yang mengajukan, foto wajah & hasil verifikasi"
                  tone="violet"
                />
              )}
              {canOperators && (
                <HubRow
                  href="/operators"
                  icon="users"
                  title="Master Operator"
                  subtitle="Akun operator, role dinamis & permission"
                  tone="amber"
                />
              )}
              {canKonten && (
                <HubRow
                  href="/konten"
                  icon="globe"
                  title="Situs Publik & Berita"
                  subtitle="Konten CMS yang tampil di website sekolah"
                  tone="purple"
                />
              )}
              {canPmb && (
                <HubRow
                  href="/pmb"
                  icon="users"
                  title="PMB (Pendaftaran)"
                  subtitle="Gelombang, verifikasi berkas & kelulusan"
                  tone="teal"
                />
              )}
            </div>
          </section>
        ) : null}
      </div>
    </MobileAppShell>
  );
}
