import type { HubLink } from "@/components/module/ModuleHubPage";
import type { NavItem } from "@/lib/wms/navigation";
import type { Locale } from "@/lib/i18n/types";
import { translateHubDescription, translateNavLabel } from "@/lib/i18n/nav-catalog";

const HUB_COLORS = [
  "bg-indigo-50 text-indigo-600",
  "bg-violet-50 text-violet-600",
  "bg-emerald-50 text-emerald-600",
  "bg-blue-50 text-blue-600",
  "bg-amber-50 text-amber-600",
  "bg-cyan-50 text-cyan-600",
  "bg-rose-50 text-rose-600",
  "bg-slate-100 text-slate-700",
] as const;

/** Konversi item sidebar menjadi kartu hub (skip indeks modul sendiri). */
export function navItemsToHubLinks(
  items: NavItem[],
  skipExactHref?: string,
  locale: Locale = "id",
): HubLink[] {
  return items
    .filter((item) => item.href !== skipExactHref)
    .map((item, idx) => {
      const label = translateNavLabel(locale, item.href, item.label);
      return {
        href: item.href,
        label,
        description: item.description ?? translateHubDescription(locale, item.href, label),
        icon: item.icon,
        color: HUB_COLORS[idx % HUB_COLORS.length],
      };
    });
}
