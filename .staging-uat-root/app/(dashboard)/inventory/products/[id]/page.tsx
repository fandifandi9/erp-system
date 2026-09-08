import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function InventoryProductDetailRedirectPage({ params }: Props) {
  const { id } = await params;
  redirect(`/katalog/produk/${id}`);
}
