import { CatalogGate } from "@/components/catalog/CatalogGate";

export default function KatalogLayout({ children }: { children: React.ReactNode }) {
  return <CatalogGate>{children}</CatalogGate>;
}
