"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ratingAuthHeaders } from "@/lib/hr/rating-client";

type Row = {
  assignment: {
    id: string;
    status: string;
    expand?: { subject?: { name?: string; email?: string } };
    subject?: string;
  };
  progress?: { respondents_label?: string; status_label?: string; is_complete?: boolean };
  result?: { overall_score?: number; category?: string } | null;
};

export default function HrRatingResultsPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/hr/rating/results", { headers: ratingAuthHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Gagal load");
        return;
      }
      setItems(json.items || []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Hasil penilaian</h1>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b text-slate-500">
            <th className="py-2 pr-3">Employee</th>
            <th className="py-2 pr-3">Score</th>
            <th className="py-2 pr-3">Category</th>
            <th className="py-2 pr-3">Respondents</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2">Detail</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.assignment.id} className="border-b border-slate-100">
              <td className="py-2 pr-3">
                {row.assignment.expand?.subject?.name ||
                  row.assignment.expand?.subject?.email ||
                  row.assignment.subject}
              </td>
              <td className="py-2 pr-3">{row.result?.overall_score ?? "—"}</td>
              <td className="py-2 pr-3">{row.result?.category ?? "—"}</td>
              <td className="py-2 pr-3">{row.progress?.respondents_label ?? "—"}</td>
              <td className="py-2 pr-3">{row.progress?.status_label || row.assignment.status}</td>
              <td className="py-2">
                <Link className="text-indigo-700 underline" href={`/hr/rating/assignments/${row.assignment.id}`}>
                  Detail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
