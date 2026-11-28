import { Icon, type IconName } from "@/components/ui/Icon";
import { nadaStat, type StatTone } from "@/lib/utils/stat-card";

function inferTone(
  value: number | string,
  tone?: string,
  statTone?: StatTone,
): StatTone {
  if (statTone) return statTone;
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(num) && num <= 0) return "clean";
  if (!tone) return "clean";
  if (tone.includes("emerald") || tone.includes("green")) return "emerald";
  if (
    tone.includes("amber") ||
    tone.includes("orange") ||
    tone.includes("yellow")
  )
    return "amber";
  if (tone.includes("rose") || tone.includes("red")) return "rose";
  if (tone.includes("cyan") || tone.includes("teal")) return "cyan";
  if (tone.includes("purple") || tone.includes("violet")) return "violet";
  if (tone.includes("sky") || tone.includes("blue") || tone.includes("indigo"))
    return "sky";
  return "clean";
}

/**
 * Petak angka ringkas dinamis untuk baris metrik di layar ponsel:
 * nilai 0 tampil netral tenang ("clean"), sedangkan nilai > 0 menyala sesuai makna.
 */
export function StatTile({
  label,
  value,
  tone,
  statTone,
  activeTone,
  icon,
}: {
  label: string;
  value: number | string;
  tone?: string;
  statTone?: StatTone;
  activeTone?: Exclude<StatTone, "clean">;
  icon?: IconName;
}) {
  const numericValue = typeof value === "number" ? value : Number(value);
  const resolvedTone = activeTone
    ? nadaStat(Number.isFinite(numericValue) ? numericValue : 0, activeTone)
    : inferTone(value, tone, statTone);

  return (
    <div data-tone={resolvedTone} className="stat-card rounded-2xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="stat-card-label text-[10px] font-bold uppercase tracking-wide">
          {label}
        </div>
        {icon ? (
          <Icon name={icon} className="stat-card-icon size-3.5 shrink-0" />
        ) : null}
      </div>
      <div className="stat-card-value mt-0.5 text-xl font-black">{value}</div>
    </div>
  );
}
