/**
 * Phase 35I-E/G — Organizational authority (hierarchy-based).
 *
 * Identity ≠ Organization ≠ Capability ≠ Company scope.
 * HR capability ≠ organizational authority.
 * Title strings are never used — only Owner + position holder → subtree (downward only).
 */

import type { HrApiAuthContext } from "@/lib/hr/api-auth";
import type { OrgPositionRecord } from "@/lib/hr/org-position-types";

export type OrgPositionGraphNode = {
  id: string;
  parentPositionId: string | null;
  /** Compatibility: first active holder */
  holderUserId?: string | null;
  /** Phase 35I-I — all active holders (authority uses this when present) */
  holderUserIds?: string[] | null;
};

function activeHolderIds(p: OrgPositionGraphNode | OrgPositionRecord | null | undefined): string[] {
  if (!p) return [];
  const multi = (p as { holderUserIds?: string[] | null }).holderUserIds;
  if (Array.isArray(multi) && multi.length > 0) {
    return multi.map(String).filter(Boolean);
  }
  const one = (p as { holderUserId?: string | null }).holderUserId;
  return one ? [String(one)] : [];
}

function actorHoldsPosition(
  p: OrgPositionGraphNode | OrgPositionRecord | null | undefined,
  actorUserId: string,
): boolean {
  if (!actorUserId) return false;
  return activeHolderIds(p).includes(actorUserId);
}

/** Collect all descendant position ids under `rootId` (not including root). */
export function collectDescendantIds(
  flat: readonly OrgPositionGraphNode[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const p of flat) {
    const parent = p.parentPositionId;
    if (!parent) continue;
    const arr = childrenByParent.get(parent) ?? [];
    arr.push(p.id);
    childrenByParent.set(parent, arr);
  }
  const out = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childrenByParent.get(id) ?? []) stack.push(c);
  }
  return out;
}

export function isDescendantOf(
  flat: readonly OrgPositionGraphNode[],
  candidateId: string,
  ancestorId: string,
): boolean {
  if (!candidateId || !ancestorId || candidateId === ancestorId) return false;
  return collectDescendantIds(flat, ancestorId).has(candidateId);
}

/** True if moving `positionId` under `newParentId` would create a cycle. */
export function wouldCreateCycle(
  flat: readonly OrgPositionGraphNode[],
  positionId: string,
  newParentId: string | null,
): boolean {
  if (!newParentId) return false;
  if (newParentId === positionId) return true;
  return isDescendantOf(flat, newParentId, positionId);
}

/** Positions the actor may manage (descendants of any position they hold). */
export function positionsUnderOrgAuthority(
  flat: readonly OrgPositionGraphNode[],
  actorUserId: string,
): Set<string> {
  const managed = new Set<string>();
  if (!actorUserId) return managed;
  for (const p of flat) {
    if (!actorHoldsPosition(p, actorUserId)) continue;
    for (const d of collectDescendantIds(flat, p.id)) managed.add(d);
  }
  return managed;
}

/** Positions the actor currently holds. */
export function positionsHeldByActor(
  flat: readonly OrgPositionGraphNode[],
  actorUserId: string,
): OrgPositionGraphNode[] {
  if (!actorUserId) return [];
  return flat.filter((p) => actorHoldsPosition(p, actorUserId));
}

export function canOwnerManageOrgStructure(ctx: HrApiAuthContext): boolean {
  return ctx.isOwner;
}

/** Root / top-of-tree seats — Owner-only create & assign. */
export function isRootOrgPosition(
  position: Pick<OrgPositionRecord, "isRoot" | "parentPositionId"> | null | undefined,
): boolean {
  if (!position) return true;
  return Boolean(position.isRoot || !position.parentPositionId);
}

/**
 * Depth of a position in the tree (root = 0, child of root = 1, …).
 */
export function orgPositionDepth(
  flat: readonly OrgPositionGraphNode[],
  positionId: string,
): number {
  const byId = new Map(flat.map((p) => [p.id, p]));
  let depth = 0;
  let id: string | null | undefined = positionId;
  const guard = new Set<string>();
  while (id) {
    if (guard.has(id)) break;
    guard.add(id);
    const node = byId.get(id);
    if (!node?.parentPositionId) return depth;
    id = node.parentPositionId;
    depth += 1;
  }
  return depth;
}

/**
 * Holders may expand structure only at root / one level below (e.g. Direktur, Manager).
 * Deeper seats (typical Staff) are operational leaves — no "Tambah bawahan".
 * Titles are never used; depth is structural.
 */
export const ORG_HOLDER_EXPAND_MAX_DEPTH = 1;

export function canHolderExpandUnderPosition(
  flat: readonly OrgPositionGraphNode[],
  parentPositionId: string,
): boolean {
  return orgPositionDepth(flat, parentPositionId) <= ORG_HOLDER_EXPAND_MAX_DEPTH;
}

/**
 * Create a child under `parent`.
 * - Owner: yes (including root when parent null)
 * - Holder of parent: yes only if parent depth ≤ ORG_HOLDER_EXPAND_MAX_DEPTH
 * - Root (parent null): Owner only
 * - Peer / ancestor / HR FULL / leaf Staff holder: NO
 */
export function canEstablishChildUnderParent(
  ctx: HrApiAuthContext,
  parent: OrgPositionRecord | null,
  flat?: readonly OrgPositionGraphNode[],
): boolean {
  if (ctx.isOwner) return true;
  if (!parent) return false;
  if (!actorHoldsPosition(parent, ctx.userId)) return false;
  if (flat && flat.length > 0 && !canHolderExpandUnderPosition(flat, parent.id)) {
    return false;
  }
  return true;
}

/**
 * Edit metadata / deactivate a position (not parent move).
 * - Owner: yes
 * - Holder of an ancestor (target in actor subtree): yes
 * - Holder of the position itself: NO (self)
 * - Peers / HR capability: NO
 * - Root seats: Owner only
 */
export function canEditPositionInSubtree(
  ctx: HrApiAuthContext,
  target: OrgPositionRecord,
  flat: readonly OrgPositionGraphNode[],
): boolean {
  if (ctx.isOwner) return true;
  if (actorHoldsPosition(target, ctx.userId)) return false;
  if (isRootOrgPosition(target)) return false;
  return positionsUnderOrgAuthority(flat, ctx.userId).has(target.id);
}

/**
 * Assign / clear holder of a position.
 * - Root: Owner only
 * - Otherwise: Owner or any ancestor holder (target in subtree)
 * - Self-appointment: Owner only
 * - HR FULL: NO
 */
export function canAssignPositionHolder(
  ctx: HrApiAuthContext,
  position: OrgPositionRecord,
  parent: OrgPositionRecord | null,
  flat?: readonly OrgPositionGraphNode[],
): boolean {
  if (ctx.isOwner) return true;
  if (isRootOrgPosition(position) || !position.parentPositionId) return false;
  if (actorHoldsPosition(parent, ctx.userId)) return true;
  if (flat && positionsUnderOrgAuthority(flat, ctx.userId).has(position.id)) return true;
  return false;
}

/**
 * Move position to a new parent.
 * - Owner: yes (subject to cycle checks elsewhere)
 * - Actor must have authority over the target (ancestor holder)
 * - Actor must be holder of the new parent (or Owner)
 * - Cannot move own held position
 * - Cannot promote to root
 */
export function canMovePosition(
  ctx: HrApiAuthContext,
  target: OrgPositionRecord,
  newParent: OrgPositionRecord | null,
  flat: readonly OrgPositionGraphNode[],
): boolean {
  if (ctx.isOwner) return true;
  if (actorHoldsPosition(target, ctx.userId)) return false;
  if (!positionsUnderOrgAuthority(flat, ctx.userId).has(target.id)) return false;
  if (!newParent) return false; // promoting to root — Owner only
  return actorHoldsPosition(newParent, ctx.userId);
}

/**
 * UI/API capability snapshot for org-structure (never grant via HR module alone).
 */
export function buildOrgStructureActorCapabilities(
  ctx: HrApiAuthContext,
  flat: readonly OrgPositionGraphNode[],
): {
  canChangeMode: boolean;
  canCreateRoot: boolean;
  canResetStructure: boolean;
  canDeletePosition: boolean;
  heldPositionIds: string[];
  managedPositionIds: string[];
  canCreateChildUnder: (parentId: string | null) => boolean;
  canEditPosition: (positionId: string) => boolean;
  canAssignHolder: (positionId: string) => boolean;
  canMovePositionId: (positionId: string) => boolean;
} {
  const held = positionsHeldByActor(flat, ctx.userId).map((p) => p.id);
  const managed = [...positionsUnderOrgAuthority(flat, ctx.userId)];
  const byId = new Map(flat.map((p) => [p.id, p]));

  return {
    canChangeMode: ctx.isOwner,
    canCreateRoot: ctx.isOwner,
    canResetStructure: ctx.isOwner,
    canDeletePosition: ctx.isOwner,
    heldPositionIds: held,
    managedPositionIds: managed,
    canCreateChildUnder: (parentId) => {
      if (ctx.isOwner) return true;
      if (!parentId) return false;
      const parent = byId.get(parentId);
      if (!parent) return false;
      if (!actorHoldsPosition(parent, ctx.userId)) return false;
      return canHolderExpandUnderPosition(flat, parentId);
    },
    canEditPosition: (positionId) => {
      if (ctx.isOwner) return true;
      const target = byId.get(positionId);
      if (!target) return false;
      if (actorHoldsPosition(target, ctx.userId)) return false;
      if (!target.parentPositionId) return false;
      return managed.includes(positionId);
    },
    canAssignHolder: (positionId) => {
      if (ctx.isOwner) return true;
      const target = byId.get(positionId);
      if (!target || !target.parentPositionId) return false;
      const parent = byId.get(target.parentPositionId);
      if (actorHoldsPosition(parent, ctx.userId)) return true;
      return managed.includes(positionId);
    },
    canMovePositionId: (positionId) => {
      if (ctx.isOwner) return true;
      const target = byId.get(positionId);
      if (!target) return false;
      if (actorHoldsPosition(target, ctx.userId)) return false;
      return managed.includes(positionId);
    },
  };
}
