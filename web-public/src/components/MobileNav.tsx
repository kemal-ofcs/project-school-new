"use client";

import {
  ChevronRight,
  GraduationCap,
  Menu,
  Phone,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export interface NavItem {
  href: string;
  label: string;
}

interface MobileNavProps {
  navigasi: readonly NavItem[];
  telepon: string | null;
  nama: string;
}

export function MobileNav({ navigasi, telepon, nama }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);

  return (
    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          aria-label="Buka Menu Navigasi"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <SheetTitle>{nama}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                Navigasi Portal Sekolah
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col justify-between flex-1 py-4">
          <nav className="flex flex-col space-y-2">
            {navigasi.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSheetOpen(false)}
                className="flex items-center justify-between rounded-lg px-4 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
              >
                <span>{item.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
            <div className="my-2 border-t border-border" />
            <Link
              href="/wali"
              onClick={() => setSheetOpen(false)}
              className="flex items-center justify-between rounded-lg px-4 py-3 text-base font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <span>Portal Wali Murid</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>

          <div className="space-y-3 pt-6 border-t border-border">
            <Button
              asChild
              variant="secondary"
              className="w-full justify-center h-12"
            >
              <Link href="/pmb" onClick={() => setSheetOpen(false)}>
                <UserCheck className="h-4 w-4 mr-2" />
                Daftar PMB Sekarang
              </Link>
            </Button>
            {telepon ? (
              <a
                href={`tel:${telepon}`}
                className="flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2"
              >
                <Phone className="h-3.5 w-3.5" />
                <span>Hotline: {telepon}</span>
              </a>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
