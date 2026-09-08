/**
 * Pure tree / graph helpers for org positions (testable without PocketBase).
 */

import type { OrgPositionRecord, OrgPositionTreeNode } from "@/lib/hr/org-position-types";
import { collectDescendantIds } from "@/lib/hr/org-authority";

export function buildOrgPositionTree(flat: OrgPositionRecord[]): OrgPositionTreeNode[] {
  const byId = new Map<string, OrgPositionTreeNode>();
  for (const p of flat) {
    byId.set(p.id, { ...p, children: [] });
  }
  const roots: OrgPositionTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentPositionId && byId.has(node.parentPositionId)) {
      byId.get(node.parentPositionId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: OrgPositionTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Attach childCount on each flat record from the graph. */
export function withChildCounts(flat: OrgPositionRecord[]): OrgPositionRecord[] {
  const counts = new Map<string, number>();
  for (const p of flat) {
    if (!p.parentPositionId) continue;
    counts.set(p.parentPositionId, (counts.get(p.parentPositionId) ?? 0) + 1);
  }
  return flat.map((p) => ({ ...p, childCount: counts.get(p.id) ?? 0 }));
}

export function findPositionName(
  flat: readonly OrgPositionRecord[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return flat.find((p) => p.id === id)?.name ?? null;
}

export { collectDescendantIds, isDescendantOf, wouldCreateCycle } from "@/lib/hr/org-authority";
