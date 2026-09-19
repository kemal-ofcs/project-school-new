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
  // Halaman Operasional memuat modul CMS dan PMB sebagai sub-menu, dan paket
  // bawaan peran `operator` memegang `content.view` tanpa izin koreksi/backup.
  // Tanpa ketiga area ini ikut dihitung, peran itu tidak punya jalan ke sana.
  if (
    canAccessArea(user, "operational") ||
    canAccessArea(user, "konten") ||
    canAccessArea(user, "pmb")
  ) {
    navItems.push({
      href: "/operational",
      icon: "tools",
      label: "Operasional",
    });
  } else if (canAccessArea(user, "dasbor_kehadiran")) {
    navItems.push({
      href: "/dasbor-kehadiran",
      icon: "dashboard",
      label: "Operasional",
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
  if (canKaryawan || canAccessArea(user, "siswa")) {
    navItems.push({ href: "/karyawan", icon: "users", label: "Karyawan & PD" });
  }
  navItems.push({ href: "/settings", icon: "settings", label: "Pengaturan" });

  return (
    <nav
      aria-label="Navigasi Bawah Mobile"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-slate-950/95 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_-14px_40px_rgba(2,8,23,0.55)] nav-elevation"
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard" || pathname === "/"
              : pathname.startsWith(item.href);

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
                  className={`grid size-14 place-items-center rounded-2xl shadow-lg transition-all active:scale-90 ${
                    isActive
                      ? "bg-gradient-to-tr from-[#003399] via-blue-600 to-[#007aff] text-white ring-4 ring-white dark:ring-slate-950 scale-105 shadow-blue-500/30"
                      : "bg-gradient-to-tr from-[#003399] via-[#0055cc] to-[#007aff] dark:from-[#003399] dark:to-blue-700 text-white ring-4 ring-white dark:ring-slate-950 shadow-blue-500/20 hover:brightness-110"
                  }`}
                >
                  <Icon
                    name="scanner"
                    className="size-7 stroke-[2.2] text-white"
                  />
                </div>
                <span
                  className={`mt-1 text-[11px] font-black tracking-tight transition-colors ${
                    isActive
                      ? "text-blue-600 dark:text-sky-300"
                      : "text-slate-600 dark:text-slate-400"
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
                  ? "text-blue-600 dark:text-sky-300 font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`grid size-8 place-items-center rounded-xl transition-colors ${
                  isActive
                    ? "bg-blue-600/10 dark:bg-sky-400/15 text-blue-600 dark:text-sky-300"
                    : "bg-transparent"
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
