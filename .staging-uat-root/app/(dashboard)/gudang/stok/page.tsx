import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ warehouse?: string }> };

/** Stok global terpusat — satu halaman dengan /inventory/stock */
export default async function GudangStokPage({ searchParams }: Props) {
  const sp = await searchParams;
  const wh = sp.warehouse?.trim();
  const qs = wh ? `?warehouse=${encodeURIComponent(wh)}` : "";
  redirect(`/inventory/stock${qs}`);
}
