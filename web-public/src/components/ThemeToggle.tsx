"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;

    if (saved === "dark" || (!saved && prefersDark)) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);

    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  };

  if (!mounted) {
    return (
      <div
        className={cn(
          "h-10 w-10 rounded-full border border-border bg-card",
          className,
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-all hover:bg-muted hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        className,
      )}
      aria-label={
        theme === "light" ? "Ganti ke mode gelap" : "Ganti ke mode terang"
      }
      title={theme === "light" ? "Mode Gelap" : "Mode Terang"}
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5 text-muted-foreground transition-transform duration-200 hover:rotate-12" />
      ) : (
        <Sun className="h-5 w-5 text-secondary-container transition-transform duration-200 hover:rotate-45" />
      )}
    </button>
  );
}
