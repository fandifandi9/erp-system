import Image from "next/image";
import { APP_DISPLAY_NAME, SYSTEM_LOGO_PATH } from "@/lib/branding";
import { cn } from "@/lib/design/cn";

/**
 * Sidebar header brand — square logo on white tile + full name.
 * Logo asset has outer margin in the file; scale up so the mark fills the tile.
 */
export function SidebarBrand({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-white/20"
        aria-hidden
      >
        <Image
          src={SYSTEM_LOGO_PATH}
          alt=""
          width={40}
          height={40}
          className="h-full w-full scale-[1.55] object-contain"
          priority
          unoptimized
        />
      </span>
      <span className="shrink-0 whitespace-nowrap text-sm font-semibold leading-snug tracking-tight text-white">
        {APP_DISPLAY_NAME}
      </span>
    </div>
  );
}
