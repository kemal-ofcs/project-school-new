"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { canAccessArea } from "@/lib/auth/access";
import { triggerHaptic } from "@/lib/client/haptics";
import { useAuth } from "@/lib/context/AuthContext";

interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  isElevated?: boolean;
  /**
   * Rute lain yang juga harus menyalakan tab ini — layar anak dari sebuah hub
   * hidup di path lama yang tidak diawali nama hub barunya (mis. hub
   * `/operasional-hub` membuka anak `/operational`), jadi `startsWith(href)`
   * saja tidak cukup untuk menandai tab aktif.
   */
  activePrefixes?: string[];
}

function tabMatches(pathname: string, item: NavItem) {
  return item.href === "/dashboard"
    ? pathname === "/dashboard" || pathname === "/"
    : (item.activePrefixes ?? [item.href]).some((prefix) =>
        pathname.startsWith(prefix),
      );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const canHome = canAccessArea(user, "home");
  const canKaryawan = canAccessArea(user, "karyawan");
  const canScanner = canAccessArea(user, "scanner");

  const navItems: NavItem[] = [];

  if (canHome) {
    navItems.push({ href: "/dashboard", icon: "dashboard", label: "Beranda" });
  }
  // Tab ini membuka hub /operasional-hub, yang mengelompokkan tujuan-tujuan
  // di bawah jadi "Operasional Harian", "Laporan", dan "Administrasi &
  // Keamanan". Tab hanya muncul kalau minimal satu baris di hub itu bisa
  // dibuka peran ini — tab yang membuka hub kosong lebih membingungkan
  // daripada tab yang tidak ada.
  if (
    canAccessArea(user, "operational") ||
    canAccessArea(user, "history") ||
    canAccessArea(user, "dasbor_kehadiran") ||
    canAccessArea(user, "notifikasi_wa") ||
    canAccessArea(user, "operators") ||
    canAccessArea(user, "password_reset") ||
    canAccessArea(user, "attendance_photo") ||
    canAccessArea(user, "face_template") ||
    canAccessArea(user, "konten") ||
    canAccessArea(user, "pmb")
  ) {
    navItems.push({
      href: "/operasional-hub",
      icon: "tools",
      label: "Operasional",
      activePrefixes: [
        "/operasional-hub",
        "/operational",
        "/history",
        "/dasbor-kehadiran",
        "/notifikasi-wa",
        "/operators",
        "/riwayat-reset-password",
        "/riwayat-identitas-karyawan",
        "/foto-absensi",
        "/konten",
        "/pmb",
      ],
    });
  }
  if (canScanner) {
    navItems.push({
      href: "/scanner",
      icon: "scanner",
      label: "Scanner",
      isElevated: true,
    });
  }
  // Tab ini membuka hub /personil (Karyawan, Peserta Didik, Guru & PTK,
  // Cetak ID Card).
  if (
    canKaryawan ||
    canAccessArea(user, "siswa") ||
    canAccessArea(user, "guru") ||
    canAccessArea(user, "idcards")
  ) {
    navItems.push({
      href: "/personil",
      icon: "users",
      label: "Karyawan & PD",
      activePrefixes: [
        "/personil",
        "/karyawan",
        "/siswa",
        "/guru",
        "/id-cards",
      ],
    });
  }
  // Semua modul, termasuk Pengaturan, bisa dicari di sini. Pengaturan juga
  // terbuka dari pill nama operator di header.
  navItems.push({ href: "/menu", icon: "menu", label: "Menu" });

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/95 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl nav-elevation"
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-around px-2">
        {navItems.map((item) => {
          // Modul yang dibuka dari halaman Menu tidak punya tab sendiri, jadi Menu yang menyala.
          const isActive =
            item.href === "/menu"
              ? !navItems.some(
                  (other) =>
                    other.href !== "/menu" && tabMatches(pathname, other),
                )
              : tabMatches(pathname, item);

          if (item.isElevated) {
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => triggerHaptic("success")}
                aria-label="Buka Scanner QR"
                className="group relative -top-4 flex flex-col items-center"
              >
                <div
                  className={`ikon-navy grid size-14 place-items-center rounded-2xl shadow-lg ring-4 ring-slate-950 transition-all active:scale-90 ${
                    isActive ? "scale-105" : "hover:brightness-110"
                  }`}
                >
                  <Icon name="scanner" className="size-7 stroke-[2.2]" />
                </div>
                <span
                  className={`mt-1 text-[11px] font-black tracking-tight transition-colors ${
                    isActive ? "nav-aktif" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => triggerHaptic("light")}
              className={`flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1 text-center transition-all active:scale-95 ${
                isActive
                  ? "nav-aktif font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <div
                className={`grid size-8 place-items-center rounded-xl transition-colors ${
                  isActive ? "nav-aktif-ikon" : "bg-transparent"
                }`}
              >
                <Icon name={item.icon} className="size-5" />
              </div>
              <span className="text-[10px] font-semibold leading-none truncate max-w-[68px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
