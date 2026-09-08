import { Suspense } from "react";

export default function MobileBridgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<div className="min-h-[100dvh] bg-slate-50" />}>{children}</Suspense>;
}
