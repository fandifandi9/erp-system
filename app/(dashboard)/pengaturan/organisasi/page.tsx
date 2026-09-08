"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Network,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess, normalizeAuthModel } from "@/lib/rbac";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { PageShell } from "@/components/layout/page-shell";
import { useLocale } from "@/components/LocaleProvider";
import type { OrgPositionRecord, OrgPositionTreeNode } from "@/lib/hr/org-position-types";
import {
  WORKSPACE_DOMAIN_LABELS,
  WORKSPACE_DOMAINS,
  type WorkspaceDomain,
} from "@/lib/org/workspace-domain";

type CompanyOpt = { id: string; company_name: string };
type ManagementGroupOpt = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  entityIds: string[];
};
type PanelMode = "view" | "edit" | "move" | "holder" | "create";
type ActorCapabilities = {
  canChangeMode: boolean;
  canCreateRoot: boolean;
  canResetStructure: boolean;
  canDeletePosition: boolean;
  heldPositionIds: string[];
  managedPositionIds: string[];
};

/** Root=0, child of root=1. Staff typically depth≥2 — cannot expand structure. */
const HOLDER_EXPAND_MAX_DEPTH = 1;

/** Keep only positions belonging to Management membership entities. */
function filterTreeByCompanyIds(
  nodes: OrgPositionTreeNode[],
  allowedIds: ReadonlySet<string>,
): OrgPositionTreeNode[] {
  const out: OrgPositionTreeNode[] = [];
  for (const n of nodes) {
    const children = filterTreeByCompanyIds(n.children ?? [], allowedIds);
    if (!allowedIds.has(n.companyId)) {
      // Drop nodes outside Management; do not promote foreign children.
      continue;
    }
    out.push({ ...n, children });
  }
  return out;
}

function positionDepthInFlat(nodes: OrgPositionRecord[], positionId: string): number {
  const byId = new Map(nodes.map((p) => [p.id, p]));
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

function authJson() {
  return hrApiAuthHeaders();
}

function flattenTree(nodes: OrgPositionTreeNode[]): OrgPositionRecord[] {
  const out: OrgPositionRecord[] = [];
  const walk = (list: OrgPositionTreeNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export default function OrgStructurePage() {
  const { t } = useLocale();
  const me = pb.authStore.model as Record<string, unknown> | null;
  const hasAccess = !!me && canAccess(me, "/pengaturan/organisasi");
  const isOwner = !!me && normalizeAuthModel(me).accountType === "owner";

  const [modeLoading, setModeLoading] = useState(true);
  const [managementGroups, setManagementGroups] = useState<ManagementGroupOpt[]>([]);
  const [selectedManagementId, setSelectedManagementId] = useState("");
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [companyNameById, setCompanyNameById] = useState<Record<string, string>>({});
  const [tree, setTree] = useState<OrgPositionTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<OrgPositionRecord | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("view");
  const [parentForCreate, setParentForCreate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formDiv, setFormDiv] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formWorkspaceDomain, setFormWorkspaceDomain] = useState<WorkspaceDomain | "">("");
  const [formOrgLevelLabel, setFormOrgLevelLabel] = useState("");
  const [moveParentId, setMoveParentId] = useState("");
  const [holderUserId, setHolderUserId] = useState("");
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [actorCaps, setActorCaps] = useState<ActorCapabilities>({
    canChangeMode: false,
    canCreateRoot: false,
    canResetStructure: false,
    canDeletePosition: false,
    heldPositionIds: [],
    managedPositionIds: [],
  });

  const modeConfigured = true;
  const modeLocked = false;

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const parentName = useMemo(() => {
    if (!selected?.parentPositionId) return null;
    return flat.find((p) => p.id === selected.parentPositionId)?.name ?? selected.parentPositionId;
  }, [selected, flat]);

  const moveCandidates = useMemo(() => {
    if (!selected) return [];
    const blocked = new Set<string>([selected.id]);
    const markDesc = (id: string) => {
      for (const p of flat) {
        if (p.parentPositionId === id && !blocked.has(p.id)) {
          blocked.add(p.id);
          markDesc(p.id);
        }
      }
    };
    markDesc(selected.id);
    return flat.filter((p) => p.isActive && !blocked.has(p.id));
  }, [selected, flat]);

  const membershipIds = useMemo(
    () => new Set(companies.map((c) => c.id)),
    [companies],
  );

  const selectedManagement = useMemo(
    () => managementGroups.find((g) => g.id === selectedManagementId) ?? null,
    [managementGroups, selectedManagementId],
  );

  const loadMode = useCallback(async () => {
    setModeLoading(false);
  }, []);

  const applyMembershipCompanies = useCallback(
    (
      entityNameById: Record<string, string>,
      membershipEntityIds: string[],
      workingId: string,
      preferKeepCompanyId?: string,
    ) => {
      const list = membershipEntityIds
        .filter((id) => Boolean(entityNameById[id]))
        .map((id) => ({ id, company_name: entityNameById[id] }));
      setCompanies(list);
      setCompanyId((prev) => {
        const keep = preferKeepCompanyId ?? prev;
        if (keep && list.some((c) => c.id === keep)) return keep;
        if (workingId && list.some((c) => c.id === workingId)) return workingId;
        return "";
      });
      return list;
    },
    [],
  );

  const loadCompanies = useCallback(async () => {
    const [entitiesRes, ctxRes] = await Promise.all([
      fetch("/api/master-data/legal-entities?activeOnly=true", {
        credentials: "include",
        headers: authJson(),
      }),
      fetch("/api/tenant/work-context", { credentials: "include" }),
    ]);
    const json = (await entitiesRes.json()) as {
      data?: Array<CompanyOpt & { is_active?: boolean }>;
      ok?: boolean;
    };
    const activeEntities = (json.data ?? []).filter((c) => c.is_active !== false);
    const map: Record<string, string> = {};
    for (const c of activeEntities) map[c.id] = c.company_name;
    setCompanyNameById(map);

    let workingId = "";
    if (ctxRes.ok) {
      const ctxJson = (await ctxRes.json()) as { companyId?: string | null };
      workingId = String(ctxJson.companyId ?? "").trim();
    }

    if (isOwner) {
      const mgmtRes = await fetch("/api/org/management-groups", {
        credentials: "include",
        headers: authJson(),
      });
      const mgmtJson = (await mgmtRes.json()) as {
        ok?: boolean;
        items?: ManagementGroupOpt[];
        error?: string;
      };
      if (!mgmtRes.ok || mgmtJson.ok === false) {
        throw new Error(mgmtJson.error || "Gagal memuat Management.");
      }
      const groups = (mgmtJson.items ?? []).filter((g) => g.isActive !== false);
      setManagementGroups(groups);
      const preferred = groups[0] ?? null;
      setSelectedManagementId(preferred?.id ?? "");
      applyMembershipCompanies(map, preferred?.entityIds ?? [], workingId);
      return;
    }

    setManagementGroups([]);
    setSelectedManagementId("");
    applyMembershipCompanies(
      map,
      activeEntities.map((c) => c.id),
      workingId,
    );
  }, [isOwner, applyMembershipCompanies]);

  function switchManagement(nextManagementId: string) {
    const group = managementGroups.find((g) => g.id === nextManagementId) ?? null;
    setSelectedManagementId(nextManagementId);
    setSelected(null);
    setPanelMode("view");
    applyMembershipCompanies(companyNameById, group?.entityIds ?? [], "", "");
  }

  const loadTree = useCallback(
    async (cid: string, allowedCompanyIds: ReadonlySet<string>) => {
      setLoading(true);
      setError(null);
      try {
        const qs = cid
          ? `companyId=${encodeURIComponent(cid)}&tree=1`
          : "tree=1";
        const res = await fetch(`/api/hr/org-positions?${qs}`, {
          credentials: "include",
          headers: authJson(),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          tree?: OrgPositionTreeNode[];
          actorCapabilities?: ActorCapabilities;
        };
        if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat struktur.");
        let nextTree = json.tree ?? [];
        // Scope org tree to Management membership (Struktur Bisnis), never invent entities.
        if (allowedCompanyIds.size > 0) {
          if (cid) {
            if (!allowedCompanyIds.has(cid)) nextTree = [];
          } else {
            nextTree = filterTreeByCompanyIds(nextTree, allowedCompanyIds);
          }
        } else {
          nextTree = [];
        }
        setTree(nextTree);
        if (json.actorCapabilities) {
          setActorCaps(json.actorCapabilities);
        } else if (isOwner) {
          setActorCaps({
            canChangeMode: true,
            canCreateRoot: true,
            canResetStructure: true,
            canDeletePosition: true,
            heldPositionIds: [],
            managedPositionIds: [],
          });
        } else {
          setActorCaps({
            canChangeMode: false,
            canCreateRoot: false,
            canResetStructure: false,
            canDeletePosition: false,
            heldPositionIds: [],
            managedPositionIds: [],
          });
        }
        const expandAll: Record<string, boolean> = {};
        const walk = (nodes: OrgPositionTreeNode[]) => {
          for (const n of nodes) {
            expandAll[n.id] = true;
            walk(n.children);
          }
        };
        walk(nextTree);
        setExpanded(expandAll);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat.");
      } finally {
        setLoading(false);
      }
    },
    [isOwner],
  );

  function canCreateChildUnder(parentId: string | null): boolean {
    if (actorCaps.canCreateRoot) {
      if (parentId === null) return true;
      // Owner may add under any parent
      return true;
    }
    if (!parentId) return false;
    if (!actorCaps.heldPositionIds.includes(parentId)) return false;
    return positionDepthInFlat(flat, parentId) <= HOLDER_EXPAND_MAX_DEPTH;
  }

  function canMutateSelected(kind: "edit" | "move" | "holder" | "delete" | "addChild"): boolean {
    if (!selected) return false;
    const childCount =
      selected.childCount ?? flat.filter((p) => p.parentPositionId === selected.id).length;
    const isRoot = selected.isRoot || !selected.parentPositionId;

    if (kind === "delete") {
      // Hapus hanya jika otoritas + tidak punya bawahan (server juga menolak jika ada anak).
      return actorCaps.canDeletePosition && childCount === 0;
    }
    if (kind === "addChild") return canCreateChildUnder(selected.id);
    if (kind === "move") {
      // Akar tidak dipindah induk; tampilkan hanya bila bukan root.
      if (isRoot) return false;
      if (actorCaps.canCreateRoot) return true;
      return actorCaps.managedPositionIds.includes(selected.id);
    }
    if (actorCaps.canCreateRoot) return true; // Owner full (edit/holder)
    if (kind === "edit") {
      return actorCaps.managedPositionIds.includes(selected.id);
    }
    if (kind === "holder") {
      return (
        actorCaps.managedPositionIds.includes(selected.id) ||
        (selected.parentPositionId
          ? actorCaps.heldPositionIds.includes(selected.parentPositionId)
          : false)
      );
    }
    return false;
  }

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      setModeLoading(false);
      return;
    }
    void loadMode();
    void loadCompanies().catch((e) => setError(e instanceof Error ? e.message : "Gagal memuat entitas."));
  }, [hasAccess, loadMode, loadCompanies]);

  useEffect(() => {
    if (!hasAccess || modeLoading) return;
    void loadTree(companyId || "", membershipIds);
  }, [hasAccess, loadTree, modeLoading, companyId, membershipIds]);

  useEffect(() => {
    if (panelMode !== "holder" || !selected) return;
    void (async () => {
      try {
        // Scope candidates to the position's company (not just UI filter / all Owner companies).
        const scopeCompanyId = String(selected.companyId || companyId || "").trim();
        const params = new URLSearchParams();
        if (scopeCompanyId) params.set("company_id", scopeCompanyId);
        params.set("for_position", selected.id);
        params.set("no_merangkap", "1");
        const res = await fetch(
          `/api/hr/employees/manager-candidates?${params.toString()}`,
          {
            credentials: "include",
            headers: authJson(),
          },
        );
        const json = (await res.json()) as {
          ok?: boolean;
          items?: Array<{ id?: string; userId?: string; name?: string; email?: string }>;
          data?: Array<{ id?: string; userId?: string; name?: string; email?: string }>;
        };
        const raw = Array.isArray(json.items)
          ? json.items
          : Array.isArray(json.data)
            ? json.data
            : [];
        const list = raw
          .map((c) => ({
            id: String(c.id || c.userId || "").trim(),
            name: String(c.name || "").trim(),
            email: String(c.email || "").trim(),
          }))
          .filter((c) => c.id);
        setCandidates(list);
      } catch {
        setCandidates([]);
      }
    })();
  }, [selected, panelMode, companyId]);

  async function reloadTree() {
    await loadTree(companyId || "", membershipIds);
  }

  async function switchEntity(nextId: string) {
    setCompanyId(nextId);
    setSelected(null);
    setPanelMode("view");
    try {
      const ctxRes = await fetch("/api/tenant/work-context", { credentials: "include" });
      if (!ctxRes.ok) return;
      const ctx = (await ctxRes.json()) as {
        companyId?: string | null;
        storeId?: string | null;
        warehouseId?: string | null;
      };
      if (!ctx.storeId || !ctx.warehouseId || !nextId) return;
      await fetch("/api/tenant/work-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authJson() },
        body: JSON.stringify({
          companyId: nextId,
          storeId: ctx.storeId,
          warehouseId: ctx.warehouseId,
          prevCompanyId: ctx.companyId,
          prevStoreId: ctx.storeId,
          prevWarehouseId: ctx.warehouseId,
        }),
      });
    } catch {
      /* UI still shows selected entity tree; server auth remains authoritative */
    }
  }

  function openCreate(parentId: string | null) {
    setParentForCreate(parentId);
    setFormName("");
    setFormCode("");
    setFormDept("");
    setFormDiv("");
    setFormNotes("");
    setFormActive(true);
    setFormWorkspaceDomain("");
    setFormOrgLevelLabel("");
    setPanelMode("create");
    if (parentId) {
      const p = flat.find((x) => x.id === parentId) ?? null;
      setSelected(p);
    }
  }

  function openEdit() {
    if (!selected) return;
    setFormName(selected.name);
    setFormCode(selected.code || "");
    setFormDept(selected.department || "");
    setFormDiv(selected.division || "");
    setFormNotes(selected.notes || "");
    setFormActive(selected.isActive);
    setFormWorkspaceDomain(selected.workspaceDomain || "");
    setFormOrgLevelLabel(selected.orgLevelLabel || "");
    setPanelMode("edit");
  }

  function openMove() {
    if (!selected) return;
    setMoveParentId(selected.parentPositionId || "");
    setPanelMode("move");
  }

  function openHolder() {
    if (!selected) return;
    setHolderUserId("");
    setPanelMode("holder");
  }

  async function createPosition(e: React.FormEvent) {
    e.preventDefault();
    const targetCompanyId = companyId || companies[0]?.id || "";
    if (!targetCompanyId || !formName.trim()) return;
    if (!membershipIds.has(targetCompanyId)) {
      setError(t("pengaturan.flexOrg.orgPageMembershipEmpty"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/org-positions", {
        method: "POST",
        credentials: "include",
        headers: authJson(),
        body: JSON.stringify({
          companyId: targetCompanyId,
          name: formName.trim(),
          code: formCode.trim() || undefined,
          department: formDept.trim() || undefined,
          division: formDiv.trim() || undefined,
          notes: formNotes.trim() || undefined,
          isActive: formActive,
          parentPositionId: parentForCreate,
          workspaceDomain: formWorkspaceDomain || undefined,
          orgLevelLabel: formOrgLevelLabel.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal membuat jabatan.");
      setPanelMode("view");
      setParentForCreate(null);
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/org-positions/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: authJson(),
        body: JSON.stringify({
          name: formName.trim(),
          code: formCode.trim(),
          department: formDept.trim(),
          division: formDiv.trim(),
          notes: formNotes.trim(),
          isActive: formActive,
          workspaceDomain: formWorkspaceDomain || null,
          orgLevelLabel: formOrgLevelLabel.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: OrgPositionRecord };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal mengubah jabatan.");
      setSelected(json.data ?? null);
      setPanelMode("view");
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function saveMove(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/org-positions/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: authJson(),
        body: JSON.stringify({
          action: "move",
          newParentPositionId: moveParentId || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: OrgPositionRecord };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memindahkan jabatan.");
      setSelected(json.data ?? null);
      setPanelMode("view");
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function assignHolder() {
    if (!selected || !holderUserId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/org-positions/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: authJson(),
        body: JSON.stringify({ holderUserId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: OrgPositionRecord };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal menetapkan pemegang.");
      setSelected(json.data ?? null);
      setPanelMode("view");
      await reloadTree();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedPosition() {
    if (!selected || !actorCaps.canDeletePosition) return;
    const childCount =
      selected.childCount ?? flat.filter((p) => p.parentPositionId === selected.id).length;
    if (childCount > 0) {
      setError("Hapus jabatan bawahan dulu, atau gunakan Kosongkan struktur.");
      return;
    }
    const ok = window.confirm(
      `Hapus jabatan "${selected.name}"?\nPemegang/assignment terkait akan diakhiri.`,
    );
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/org-positions/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: authJson(),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal menghapus jabatan.");
      setSelected(null);
      setPanelMode("view");
      await reloadTree();
      await loadMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus.");
    } finally {
      setSaving(false);
    }
  }

  async function resetAllStructure() {
    if (!isOwner && !actorCaps.canResetStructure) return;
    const ok = window.confirm(
      "Kosongkan SELURUH struktur organisasi?\n\nSemua jabatan dan riwayat assignment organisasi akan dihapus.",
    );
    if (!ok) return;
    const ok2 = window.confirm("Yakin? Tindakan ini tidak bisa dibatalkan dari UI.");
    if (!ok2) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/org-positions?reset=1", {
        method: "DELETE",
        credentials: "include",
        headers: authJson(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        deletedPositions?: number;
      };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal mengosongkan struktur.");
      setSelected(null);
      setPanelMode("view");
      await reloadTree();
      await loadMode();
      window.alert(
        `Struktur dikosongkan (${json.deletedPositions ?? 0} jabatan). Hierarki dapat disusun ulang sesuai kebutuhan.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal reset.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasAccess) {
    return <div className="p-6 text-red-600">Akses ditolak.</div>;
  }

  function renderNode(node: OrgPositionTreeNode, depth: number) {
    const open = expanded[node.id] !== false;
    const hasChildren = node.children.length > 0;
    return (
      <div key={node.id} className="select-none">
        <div
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 ${
            selected?.id === node.id ? "bg-sky-50 ring-1 ring-sky-100" : ""
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            type="button"
            className="text-slate-400"
            onClick={() => setExpanded((s) => ({ ...s, [node.id]: !open }))}
            aria-label="toggle"
          >
            {hasChildren ? (
              open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="inline-block w-4" />
            )}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              setSelected(node);
              setPanelMode("view");
              setHolderUserId(node.holderUserId || "");
            }}
          >
            <span className="font-medium text-slate-800">{node.name}</span>
            {node.department ? (
              <span className="ml-2 text-xs text-slate-500">{node.department}</span>
            ) : null}
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                !node.isActive
                  ? "bg-slate-100 text-slate-500"
                  : (node.holderCount ?? (node.filled ? 1 : 0)) > 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {!node.isActive
                ? "Nonaktif"
                : (node.holderCount ?? (node.filled ? 1 : 0)) > 0
                  ? `${node.holderCount ?? 1} orang`
                  : "Kosong"}
            </span>
            {node.scopeType &&
            node.scopeType !== "SELECTED_COMPANIES" &&
            (node.scopeCompanyIds?.length ?? 0) > 0 ? (
              <span className="ml-1 text-[10px] text-slate-400">
                · {(node.scopeCompanyIds || []).length} entitas
              </span>
            ) : null}
            {(node.holderNames?.length ?? 0) > 0 ? (
              <span className="ml-2 text-xs text-slate-600">
                · {node.holderNames!.slice(0, 3).join(", ")}
                {(node.holderNames!.length ?? 0) > 3
                  ? ` +${node.holderNames!.length - 3}`
                  : ""}
              </span>
            ) : node.holderName ? (
              <span className="ml-2 text-xs text-slate-600">· {node.holderName}</span>
            ) : null}
          </button>
          {canCreateChildUnder(node.id) ? (
            <button
              type="button"
              title="Tambah jabatan bawahan"
              className="rounded p-1 text-sky-700 hover:bg-sky-50"
              onClick={() => openCreate(node.id)}
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : (
            <span className="inline-block w-6" aria-hidden />
          )}
        </div>
        {open && hasChildren ? node.children.map((c) => renderNode(c, depth + 1)) : null}
      </div>
    );
  }

  const createParentLabel = parentForCreate
    ? flat.find((p) => p.id === parentForCreate)?.name || "induk"
    : null;

  return (
    <PageShell maxWidth="max-w-6xl">
      <div>
        <Link
          href="/pengaturan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-sky-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Pengaturan
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Network className="h-6 w-6" />
          {t("pengaturan.flexOrg.orgStructure")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Hierarki Parent → Child. Atasan &amp; approver diturunkan dari jabatan induk.
        </p>
      </div>

      {modeLoading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Memuat konfigurasi…
        </div>
      ) : null}

      {!modeLoading ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("pengaturan.flexOrg.orgStructure")}
          </h2>
          <p className="text-xs text-slate-500">{t("pengaturan.flexOrg.orgPageContextHint")}</p>
          {isOwner && managementGroups.length > 1 ? (
            <label className="block text-sm text-slate-600">
              {t("pengaturan.flexOrg.selectManagement")}{" "}
              <select
                value={selectedManagementId}
                onChange={(e) => switchManagement(e.target.value)}
                className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                {managementGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code})
                  </option>
                ))}
              </select>
            </label>
          ) : selectedManagement ? (
            <p className="text-sm font-medium text-slate-800">{selectedManagement.name}</p>
          ) : null}
          <p className="text-sm text-slate-700">
            {t("pengaturan.flexOrg.entityCount", { count: companies.length })}
          </p>
          {companies.length === 0 ? (
            <p className="text-xs text-amber-800">{t("pengaturan.flexOrg.orgPageMembershipEmpty")}</p>
          ) : null}
          {isOwner ? (
            <Link
              href="/pengaturan/manajemen"
              className="inline-flex text-sm font-medium text-sky-700 hover:underline"
            >
              {t("pengaturan.flexOrg.managementTitle")} →
            </Link>
          ) : null}
        </div>
      ) : null}

      {modeConfigured ? (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          {t("pengaturan.flexOrg.orgPageHierarchyContext")}
        </span>
        <label className="text-sm text-slate-600">
          Filter entitas{" "}
          <select
            value={companyId}
            onChange={(e) => void switchEntity(e.target.value)}
            className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            disabled={companies.length === 0}
          >
            <option value="">{t("pengaturan.flexOrg.filterEntitiesInManagement")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </label>
        {actorCaps.canCreateRoot ? (
          <button
            type="button"
            onClick={() => openCreate(null)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
          >
            <Plus className="h-4 w-4" />
            Tambah Jabatan Akar
          </button>
        ) : (
          <span className="text-xs text-slate-500">
            Jabatan akar hanya Owner. Tambah bawahan hanya pada jabatan yang Anda pegang dan
            bersifat manajerial (langsung di bawah akar). Pemegang jabatan staff/operasional tidak
            dapat menambah struktur.
          </span>
        )}
        {actorCaps.canResetStructure && (flat.length > 0 || modeLocked) ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void resetAllStructure()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Kosongkan struktur
          </button>
        ) : null}
        <span className="text-xs text-slate-500">{flat.length} jabatan</span>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {loading ? (
            <div className="flex items-center gap-2 p-4 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Memuat…
            </div>
          ) : tree.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              Belum ada jabatan pada entitas ini. Owner dapat menambah jabatan akar, lalu atasan
              membentuk bawahan tanpa wajib lapisan Manager.
            </p>
          ) : (
            tree.map((n) => renderNode(n, 0))
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {panelMode === "create" ? (
            <form onSubmit={(e) => void createPosition(e)} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {createParentLabel
                  ? `Jabatan baru di bawah ${createParentLabel}`
                  : "Tambah Jabatan Akar"}
              </h2>
              {!createParentLabel ? null : (
                <p className="text-xs text-slate-500">
                  Parent otomatis = {createParentLabel} (tidak dipilih manual).
                </p>
              )}
              <input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nama jabatan *"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Kode jabatan (opsional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
                placeholder="Departemen / unit (opsional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={formDiv}
                onChange={(e) => setFormDiv(e.target.value)}
                placeholder="Divisi (opsional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("pengaturan.flexOrg.workspaceDomain")}
                </label>
                <select
                  value={formWorkspaceDomain}
                  onChange={(e) =>
                    setFormWorkspaceDomain((e.target.value || "") as WorkspaceDomain | "")
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">{t("pengaturan.flexOrg.selectDomain")}</option>
                  {WORKSPACE_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {WORKSPACE_DOMAIN_LABELS[d]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {t("pengaturan.flexOrg.workspaceDomainHint")}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("pengaturan.flexOrg.orgLevelLabel")}
                </label>
                <input
                  value={formOrgLevelLabel}
                  onChange={(e) => setFormOrgLevelLabel(e.target.value)}
                  placeholder="Director / Manager / Staff / …"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">{t("pengaturan.flexOrg.orgLevelHint")}</p>
              </div>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Catatan (opsional)"
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                Aktif
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? t("pengaturan.common.saving") : t("pengaturan.flexOrg.save")}
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode("view")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  {t("pengaturan.flexOrg.cancel")}
                </button>
              </div>
            </form>
          ) : panelMode === "edit" && selected ? (
            <form onSubmit={(e) => void saveEdit(e)} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Ubah jabatan</h2>
              <p className="text-xs text-slate-500">
                Ubah metadata saja. Untuk mengganti induk, gunakan Pindah induk.
              </p>
              <input
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="Kode"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
                placeholder="Departemen / unit"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={formDiv}
                onChange={(e) => setFormDiv(e.target.value)}
                placeholder="Divisi"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("pengaturan.flexOrg.workspaceDomain")}
                </label>
                <select
                  value={formWorkspaceDomain}
                  onChange={(e) =>
                    setFormWorkspaceDomain((e.target.value || "") as WorkspaceDomain | "")
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">{t("pengaturan.flexOrg.selectDomain")}</option>
                  {WORKSPACE_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {WORKSPACE_DOMAIN_LABELS[d]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-400">
                  {t("pengaturan.flexOrg.workspaceDomainHint")}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {t("pengaturan.flexOrg.orgLevelLabel")}
                </label>
                <input
                  value={formOrgLevelLabel}
                  onChange={(e) => setFormOrgLevelLabel(e.target.value)}
                  placeholder="Director / Manager / Staff / …"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">{t("pengaturan.flexOrg.orgLevelHint")}</p>
              </div>
              <textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Catatan"
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                Aktif
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? t("pengaturan.common.saving") : t("pengaturan.flexOrg.save")}
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode("view")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  {t("pengaturan.flexOrg.cancel")}
                </button>
              </div>
            </form>
          ) : panelMode === "move" && selected ? (
            <form onSubmit={(e) => void saveMove(e)} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Pindah induk</h2>
              <p className="text-sm text-slate-600">
                Memindahkan <strong>{selected.name}</strong> beserta seluruh bawahan di bawahnya.
              </p>
              <label className="block text-sm text-slate-600">
                Jabatan induk baru
                <select
                  value={moveParentId}
                  onChange={(e) => setMoveParentId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {isOwner ? <option value="">— Jadikan akar —</option> : null}
                  {moveCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-slate-500">
                Tidak dapat dipindahkan ke diri sendiri atau ke bawahannya.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Memindahkan…" : "Pindahkan"}
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode("view")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Batal
                </button>
              </div>
            </form>
          ) : panelMode === "holder" && selected ? (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900">Tambah pemegang</h2>
              <p className="text-sm text-slate-600">
                {selected.name}
                {(selected.holderCount ?? 0) > 0
                  ? ` — sudah ${selected.holderCount} orang (multi-holder diizinkan)`
                  : " — belum ada pemegang"}
              </p>
              {(selected.holderNames?.length ?? 0) > 0 ? (
                <ul className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {selected.holderNames!.map((n, i) => (
                    <li key={`${selected.holderUserIds?.[i] ?? n}-${i}`}>· {n}</li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-sm text-slate-600">
                Tambah pemegang jabatan
                <select
                  value={holderUserId}
                  onChange={(e) => setHolderUserId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">— Pilih karyawan —</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email} ({c.email})
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-slate-500">
                Satu karyawan tetap hanya boleh satu jabatan aktif. Jabatan yang sama boleh diisi
                banyak orang.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving || !holderUserId}
                  onClick={() => void assignHolder()}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Tambah pemegang
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode("view")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <UserRound className="h-5 w-5" />
                {selected.name}
              </h2>
              {(selected.holderCount ?? (selected.filled ? 1 : 0)) === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Jabatan kosong — belum ada pemegang. Tetap dapat menerima penempatan.
                </p>
              ) : (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  {selected.holderCount ?? 1} pemegang aktif — posisi tetap dapat menerima
                  penempatan tambahan.
                </p>
              )}
              <dl className="space-y-1.5 text-sm text-slate-600">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Status</dt>
                  <dd>
                    {!selected.isActive
                      ? "Nonaktif"
                      : (selected.holderCount ?? (selected.filled ? 1 : 0)) > 0
                        ? `Aktif · Terisi (${selected.holderCount ?? 1})`
                        : "Aktif · Kosong"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Pemegang</dt>
                  <dd className="text-right">
                    {(selected.holderNames?.length ?? 0) > 0
                      ? selected.holderNames!.join(", ")
                      : selected.holderName || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Entitas</dt>
                  <dd>{companyNameById[selected.companyId] || companyId}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">{t("pengaturan.flexOrg.workspaceDomain")}</dt>
                  <dd>
                    {selected.workspaceDomain
                      ? WORKSPACE_DOMAIN_LABELS[selected.workspaceDomain]
                      : "—"}
                  </dd>
                </div>
                {selected.orgLevelLabel ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">{t("pengaturan.flexOrg.orgLevelLabel")}</dt>
                    <dd>{selected.orgLevelLabel}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Scope jabatan</dt>
                    <dd className="text-right">
                      {selected.scopeType === "GROUP" || selected.scopeType === "ALL_COMPANIES"
                        ? "Semua entitas (scope jabatan)"
                        : `Terpilih (${(selected.scopeCompanyIds || [])
                            .map((id) => companyNameById[id] || id)
                            .join(", ") || "—"})`}
                    </dd>
                  </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Jabatan Induk</dt>
                  <dd>{parentName || "Akar (tanpa induk)"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-400">Bawahan</dt>
                  <dd>{selected.childCount ?? flat.filter((p) => p.parentPositionId === selected.id).length}</dd>
                </div>
                {selected.department ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Unit</dt>
                    <dd>{selected.department}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                {canMutateSelected("edit") ? (
                  <button
                    type="button"
                    onClick={openEdit}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
                  >
                    Ubah jabatan
                  </button>
                ) : null}
                {canMutateSelected("move") ? (
                  <button
                    type="button"
                    onClick={openMove}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
                  >
                    Pindah induk
                  </button>
                ) : null}
                {canMutateSelected("holder") ? (
                  <button
                    type="button"
                    onClick={openHolder}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium hover:bg-slate-50"
                  >
                    Tambah pemegang
                  </button>
                ) : null}
                {canMutateSelected("addChild") ? (
                  <button
                    type="button"
                    onClick={() => openCreate(selected.id)}
                    className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-900 hover:bg-sky-100"
                  >
                    Tambah bawahan
                  </button>
                ) : null}
                {canMutateSelected("delete") ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void deleteSelectedPosition()}
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
                  >
                    Hapus jabatan
                  </button>
                ) : null}
                {!canMutateSelected("edit") &&
                !canMutateSelected("move") &&
                !canMutateSelected("holder") &&
                !canMutateSelected("addChild") &&
                !canMutateSelected("delete") ? (
                  <p className="text-xs text-slate-500">
                    Mode baca — otoritas organisasi tidak mengizinkan perubahan pada jabatan ini.
                    Akses modul HR saja tidak cukup.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Pilih jabatan pada pohon untuk melihat detail.</p>
          )}
        </div>
      </div>
      </>
      ) : null}
    </PageShell>
  );
}
