export type CourierBrandStyle = {
  bg: string;
  text: string;
  label: string;
};

const BRANDS: Record<string, CourierBrandStyle> = {
  jne: { bg: "#E31837", text: "#ffffff", label: "JNE" },
  jnt: { bg: "#E60012", text: "#ffffff", label: "J&T" },
  jandt: { bg: "#E60012", text: "#ffffff", label: "J&T" },
  sicepat: { bg: "#D71920", text: "#ffffff", label: "SC" },
  anteraja: { bg: "#F97316", text: "#ffffff", label: "AA" },
  ninja: { bg: "#E11D48", text: "#ffffff", label: "NJ" },
  gosend: { bg: "#16A34A", text: "#ffffff", label: "GO" },
  grab: { bg: "#00B14F", text: "#ffffff", label: "GR" },
  pickup: { bg: "#6366F1", text: "#ffffff", label: "PK" },
  pickuptoko: { bg: "#6366F1", text: "#ffffff", label: "PK" },
  pos: { bg: "#0EA5E9", text: "#ffffff", label: "POS" },
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function resolveCourierBrand(courier: {
  name: string;
  code?: string;
}): CourierBrandStyle {
  const keys = [courier.code, courier.name].filter(Boolean).map((v) => normalizeKey(v!));
  for (const key of keys) {
    if (BRANDS[key]) return BRANDS[key];
    for (const [k, style] of Object.entries(BRANDS)) {
      if (key.includes(k) || k.includes(key)) return style;
    }
  }
  return {
    bg: "#E2E8F0",
    text: "#334155",
    label: initials(courier.name),
  };
}
