"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Lock, Upload } from "lucide-react";
import { AccountVerificationModal } from "@/components/account/AccountVerificationModal";
import { pb } from "@/lib/pocketbase";
import { errorFromResponse } from "@/lib/account-verification-client";
import { useSensitiveVerificationSession } from "@/lib/hooks/useSensitiveVerificationSession";
import { ACCOUNT_VERIFICATION_WINDOW_MINUTES } from "@/lib/account-verification-session";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  LoadingState,
  StatusBadge,
  type BadgeTone,
} from "@/components/ui";

type DocType = "ktp" | "npwp" | "kk" | "bank_account" | "other";

type DocRow = {
  id: string;
  document_type: DocType;
  original_name: string;
  mime_type: string;
  is_current: boolean;
  uploaded_at: string;
  verification_status?: string;
};

const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Menunggu verifikasi", tone: "warning" },
  verified: { label: "Terverifikasi", tone: "success" },
  rejected: { label: "Perlu diperbaiki", tone: "danger" },
  needs_replacement: { label: "Perlu diunggah ulang", tone: "danger" },
};

const DOC_LABELS: Record<DocType, string> = {
  ktp: "KTP",
  npwp: "NPWP",
  kk: "Kartu Keluarga (KK)",
  bank_account: "Rekening Bank",
  other: "Dokumen Pendukung",
};

const GRID_TYPES: DocType[] = ["ktp", "npwp", "kk", "bank_account", "other"];

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

type PendingDocAction = { id: string; mode: "preview" | "download" };

export function EmployeePrivateDocumentsSection() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocType | null>(null);
  const [error, setError] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [docsUnlocked, setDocsUnlocked] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingDocAction | null>(null);
  const fileRefs = useRef<Partial<Record<DocType, HTMLInputElement | null>>>({});

  useSensitiveVerificationSession("documents", {
    onRevoked: () => {
      setDocsUnlocked(false);
      setVerifyOpen(false);
      setPendingAction(null);
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/profile/self/documents", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: DocRow[]; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gagal memuat dokumen.");
      setDocs(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat dokumen.");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const docByType = (type: DocType) => docs.find((d) => d.document_type === type);

  const runDocAction = async (id: string, mode: "preview" | "download") => {
    const url = `/api/profile/self/documents/${encodeURIComponent(id)}/file${mode === "preview" ? "?inline=1" : ""}`;
    const res = await fetch(url, { credentials: "include", headers: authHeaders() });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || ct.includes("application/json")) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw errorFromResponse(data);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    if (mode === "preview") {
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } else {
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `dokumen-${id.slice(0, 8)}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleDocAction = async (id: string, mode: "preview" | "download") => {
    setError("");
    try {
      await runDocAction(id, mode);
      setDocsUnlocked(true);
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "ACCOUNT_VERIFICATION_REQUIRED") {
        setDocsUnlocked(false);
        setPendingAction({ id, mode });
        setVerifyOpen(true);
        return;
      }
      setError(err.message || "Gagal mengakses dokumen.");
    }
  };

  const handleVerified = () => {
    setVerifyOpen(false);
    setDocsUnlocked(true);
    const action = pendingAction;
    setPendingAction(null);
    if (action) void handleDocAction(action.id, action.mode);
  };

  const handleUpload = async (type: DocType, file: File) => {
    setUploading(type);
    setError("");
    try {
      const fd = new FormData();
      fd.append("document_type", type);
      fd.append("file", file);
      const res = await fetch("/api/profile/self/documents", { method: "POST", body: fd, credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok === false) throw new Error(data.error || "Upload gagal.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload gagal.");
    } finally {
      setUploading(null);
      const input = fileRefs.current[type];
      if (input) input.value = "";
    }
  };

  return (
    <>
      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {docsUnlocked ? (
        <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Dokumen terbuka — KTP, NPWP, KK, dan lainnya bisa diakses tanpa verifikasi ulang hingga sesi
          berakhir ({ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit / idle / keluar modul).
        </p>
      ) : null}

      {loading ? (
        <LoadingState label="Memuat dokumen…" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {GRID_TYPES.map((type) => {
            const existing = docByType(type);
            const isUploading = uploading === type;
            const status = STATUS_META[existing?.verification_status ?? "pending"] ?? STATUS_META.pending;
            return (
              <Card key={type} padding="p-4" className={type === "other" ? "sm:col-span-2" : undefined}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-erp-text">
                      <FileText className="h-4 w-4 shrink-0 text-erp-text-muted" aria-hidden />
                      {DOC_LABELS[type]}
                    </p>
                    {existing ? (
                      <>
                        <div className="mt-2">
                          <StatusBadge label={status.label} tone={status.tone} />
                        </div>
                        <p className="mt-1 truncate text-xs text-erp-text-muted">{existing.original_name}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-erp-text-muted">Belum diunggah</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {existing ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleDocAction(existing.id, "preview")}
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden />
                        Preview
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => void handleDocAction(existing.id, "download")}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        Unduh
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    loading={isUploading}
                    onClick={() => fileRefs.current[type]?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    {existing ? "Ganti" : "Upload"}
                  </Button>
                  <input
                    ref={(el) => {
                      fileRefs.current[type] = el;
                    }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    disabled={isUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUpload(type, f);
                    }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AccountVerificationModal
        open={verifyOpen}
        context="document"
        onClose={() => {
          setVerifyOpen(false);
          setPendingAction(null);
        }}
        onVerified={handleVerified}
      />
    </>
  );
}

export function EmployeePrivateDocumentsPanel() {
  return (
    <section id="dokumen">
      <CardHeader
        title="Dokumen Pribadi"
        description="Dokumen rahasia — akses dibatasi untuk Anda dan HR yang berwenang."
      />
      <div className="mb-4 flex items-start gap-2 text-erp-text-muted">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="text-xs">
          Preview/unduh: verifikasi kata sandi sekali untuk semua jenis dokumen (KTP, NPWP, KK, dll).
          Berlaku {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit — ulang jika idle atau keluar modul selama{" "}
          {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit.
        </p>
      </div>
      <EmployeePrivateDocumentsSection />
    </section>
  );
}
