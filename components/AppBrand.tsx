import Image from "next/image";
import {
  APP_DISPLAY_NAME,
  SYSTEM_LOGO_WIDE_ASPECT,
  SYSTEM_LOGO_WIDE_PATH,
} from "@/lib/branding";

type AppBrandProps = {
  className?: string;
  nameClassName?: string;
  showName?: boolean;
  /** Tinggi logo horizontal (px). */
  height?: number;
};

export function AppBrand({
  className = "",
  nameClassName = "",
  showName = true,
  height = 32,
}: AppBrandProps) {
  const width = Math.round(height * SYSTEM_LOGO_WIDE_ASPECT);

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <Image
        src={SYSTEM_LOGO_WIDE_PATH}
        alt={APP_DISPLAY_NAME}
        width={width}
        height={height}
        className="shrink-0 object-contain"
        priority
        unoptimized
      />
      {showName ? (
        <span className={`truncate font-semibold tracking-tight ${nameClassName}`}>
          {APP_DISPLAY_NAME}
        </span>
      ) : null}
    </div>
  );
}
