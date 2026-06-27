export type MarketplaceBrandStyle = {
  bg: string;
  text: string;
  label: string;
};

const BRANDS: Record<string, MarketplaceBrandStyle> = {
  shopee: { bg: "#EE4D2D", text: "#ffffff", label: "SP" },
  tokopedia: { bg: "#42B549", text: "#ffffff", label: "TK" },
  tokped: { bg: "#42B549", text: "#ffffff", label: "TK" },
  lazada: { bg: "#0F146D", text: "#ffffff", label: "LZ" },
  blibli: { bg: "#0095DA", text: "#ffffff", label: "BL" },
  tiktok: { bg: "#010101", text: "#ffffff", label: "TT" },
  tiktokshop: { bg: "#010101", text: "#ffffff", label: "TT" },
  bukalapak: { bg: "#D71149", text: "#ffffff", label: "BP" },
  zalora: { bg: "#000000", text: "#ffffff", label: "ZL" },
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export function resolveMarketplaceBrand(channel: {
  name: string;
  code?: string;
}): MarketplaceBrandStyle {
  const keys = [channel.code, channel.name].filter(Boolean).map((v) => normalizeKey(v!));
  for (const key of keys) {
    if (BRANDS[key]) return BRANDS[key];
    for (const [k, style] of Object.entries(BRANDS)) {
      if (key.includes(k) || k.includes(key)) return style;
    }
  }
  return {
    bg: "#E2E8F0",
    text: "#334155",
    label: initials(channel.name),
  };
}
