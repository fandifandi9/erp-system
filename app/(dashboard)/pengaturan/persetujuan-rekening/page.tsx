"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PayrollBankApprovalPanel } from "@/components/hr/PayrollBankApprovalPanel";

export default function PengaturanPersetujuanRekeningPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
      <Link
        href="/pengaturan"
        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Pengaturan
      </Link>
      <h1 className="text-xl font-semibold">Persetujuan Rekening Payroll</h1>
      <p className="text-sm text-slate-600">
        Tinjau dan setujui pengajuan perubahan rekening payroll karyawan.
      </p>
      <PayrollBankApprovalPanel />
    </div>
  );
}
