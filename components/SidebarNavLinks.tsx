"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { canManageInventoryMaster } from "@/lib/inventory/access";
import type { NavItem } from "@/lib/wms/navigation";
import { useLocale } from "@/components/LocaleProvider";
import { translateNavLabel } from "@/lib/i18n/nav-catalog";

type Props = {
  items: NavItem[];
  subMenuClass: string;
  onNavigate?: () => void;
};

export function SidebarNavLinks({ items, subMenuClass, onNavigate }: Props) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const user = pb.authStore.model;
  const showMaster = user && canManageInventoryMaster(user);

  const visible = items.filter((n) => !n.masterOnly || showMaster);

  const linkClass = (href: string, exact?: boolean) => {
    const active = exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
    return subMenuClass + (active ? " !bg-amber-400 !text-slate-900 font-medium" : "");
  };

  return (
    <ul className="space-y-0.5">
      {visible.map((item) => {
        const Icon = item.icon;
        const label = translateNavLabel(locale, item.href, item.label);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={linkClass(item.href, item.exact)}
              onClick={onNavigate}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="leading-snug">{label}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
