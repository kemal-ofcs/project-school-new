import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utilitas penggabung class Tailwind CSS standar shadcn/ui.
 * Menghilangkan konflik class utilitas secara deterministik.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
