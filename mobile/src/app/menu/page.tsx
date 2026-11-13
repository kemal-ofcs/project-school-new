"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MobileAppShell } from "@/components/MobileAppShell";
import {
  groupNavigation,
  NAVIGATION,
  type NavigationItem,
} from "@/components/navigation-items";
import { HubGroupLabel, HubRow } from "@/components/ui/HubRow";
import { Icon } from "@/components/ui/Icon";
import { type AccessSubject, canAccessArea } from "@/lib/auth/access";
import { useAuth } from "@/lib/context/AuthContext";

function canSeeItem(
  user: AccessSubject | null | undefined,
  item: NavigationItem,
) {
  // Pengaturan Mobile memuat tema, 2FA, dan kode pemulihan: milik semua operator.
  if (item.area === "settings") return true;
  // Halaman Operator Mobile hanya untuk Superadmin (lihat operators/page.tsx).
  if (item.area === "operators") return Boolean(user?.isSuperadmin);
  return canAccessArea(user, item.area);
}

export default function MenuPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/login");
  }, [isLoading, isAuthenticated, router]);

  const needle = query.trim().toLowerCase();
  // Kelompok "Utama" (Home, Scanner, Dashboard) sudah ada di navigasi bawah.
  const groups = groupNavigation(
    NAVIGATION.filter((item) => canSeeItem(user, item)),
  )
    .filter((group) => !group.pinned)
    .map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) =>
          !needle ||
          item.label.toLowerCase().includes(needle) ||
          group.label.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.items.length > 0);

  if (!user) return null;

  return (
    <MobileAppShell>
      <div className="flex flex-col gap-4">
        <div className="rounded-3xl border border-white/15 bg-slate-900/90 p-4 shadow-xl backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-xl border border-sky-400/20 bg-sky-500/10 text-sky-300">
              <Icon name="menu" className="size-5" />
            </div>
            <h1 className="text-base font-black text-white">Menu</h1>
          </div>
          <label htmlFor="menu-search-input" className="sr-only">
            Cari menu
          </label>
          <input
            id="menu-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari menu, misalnya nilai atau tagihan"
            className="h-11 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
          />
        </div>

        {groups.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-center text-sm text-slate-400">
            {needle
              ? `Tidak ada menu yang cocok dengan "${query.trim()}".`
              : "Akun ini belum punya akses ke menu lain."}
          </p>
        ) : (
          groups.map((group, index) => (
            <section key={group.label} aria-labelledby={`grup-menu-${index}`}>
              <HubGroupLabel id={`grup-menu-${index}`}>
                {group.label}
              </HubGroupLabel>
              <div className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <HubRow
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    title={item.label}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </MobileAppShell>
  );
}
