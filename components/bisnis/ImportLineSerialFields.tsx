"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LineSerialFields } from "@/components/bisnis/LineSerialFields";
import { updateSalesImportLine } from "@/lib/bisnis/client";
import {
  mergeImportLineSerials,
  parseImportLineSerials,
} from "@/lib/wms/serial-numbers";
import { getErrorMessage } from "@/lib/errors";
import type { SalesImportLine } from "@/lib/bisnis/types";

type Props = {
  line: SalesImportLine;
  onSaved?: () => void;
};

export function ImportLineSerialFields({ line, onSaved }: Props) {
  const [serials, setSerials] = useState(() => parseImportLineSerials(line.fee_override_json));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (next: string[]) => {
    setSerials(next);
    setSaving(true);
    setError("");
    try {
      await updateSalesImportLine(line.id, {
        fee_override_json: mergeImportLineSerials(line.fee_override_json, next),
      });
      onSaved?.();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-amber-900">
        Serial wajib
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      </div>
      <LineSerialFields qty={line.qty} serials={serials} onChange={(v) => void save(v)} compact />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
