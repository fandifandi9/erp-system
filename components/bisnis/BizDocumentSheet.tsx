"use client";

import { renderBizDocumentBodyHtml } from "@/lib/bisnis/doc-print-html";
import type { BizDocumentPrintData } from "@/lib/bisnis/doc-print-types";

type Props = {
  data: BizDocumentPrintData;
  className?: string;
};

/** Pratinjau dokumen — layout Tailwind sama dengan invoice (layar). */
export function BizDocumentSheet({ data, className = "" }: Props) {
  return (
    <div className={className}>
      <div dangerouslySetInnerHTML={{ __html: renderBizDocumentBodyHtml(data) }} />
    </div>
  );
}
