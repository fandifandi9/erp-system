"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Network, Plus, Save } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { canAccess, normalizeAuthModel } from "@/lib/rbac";
import { hrApiAuthHeaders } from "@/lib/hr/hr-api-client";
import { PageShell } from "@/components/layout/page-shell";
import { useLocale } from "@/components/LocaleProvider";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import {
  CONFIGURABLE_FUNCTION_DOMAINS,
  type ConfigurableFunctionDomain,
  type FunctionalOperatingMode,
} from "@/lib/org/functional-operating-model";
import { backendFomToUi, uiFomToBackend, type FomUiStatus } from "@/lib/org/fom-ui-mapping";
import { WORKSPACE_DOMAIN_LABELS } from "@/lib/org/workspace-domain";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadingState,
  Modal,
  PageHeader,
  PermissionDeniedState,
  SectionHeader,
  Textarea,
  useToast,
} from "@/components/ui";

type ManagementGroup = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  notes?: string;
  entityIds: string[];
};

type CompanyOpt = {
  id: string;
  company_name: string;
};

type ModelRow = {
  functionDomain: ConfigurableFunctionDomain;
  status: FomUiStatus;
  managedEntityIds: string[];
  effectiveFrom: string | null;
};

function authJson(): HeadersInit {
  return { "Content-Type": "application/json", ...hrApiAuthHeaders() };
}

function emptyModels(): Record<ConfigurableFunctionDomain, ModelRow> {
  const init = {} as Record<ConfigurableFunctionDomain, ModelRow>;
  for (const d of CONFIGURABLE_FUNCTION_DOMAINS) {
    init[d] = {
      functionDomain: d,
      status: "inactive",
      managedEntityIds: [],
      effectiveFrom: null,
    };
  }
  return init;
}

export default function ManajemenOperatingModelPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const user = pb.authStore.model;
  const auth = normalizeAuthModel(user);
  const isOwner = auth.accountType === "owner";
  const allowed = canAccess(user, "/pengaturan/manajemen");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [groups, setGroups] = useState<ManagementGroup[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  const [hybrid, setHybrid] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [models, setModels] = useState(emptyModels);
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const selected = useMemo(
    () => groups.find((g) => g.id === selectedId) ?? null,
    [groups, selectedId],
  );

  /** Active companies in current Management membership — display / FOM scope only. */
  const membershipCompanies = useMemo(() => {
    const ids = selected?.entityIds ?? [];
    return companies.filter((c) => ids.includes(c.id));
  }, [companies, selected]);

  const membershipIds = useMemo(
    () => membershipCompanies.map((c) => c.id),
    [membershipCompanies],
  );

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/org/management-groups", {
      credentials: "include",
      headers: authJson(),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; items?: ManagementGroup[] };
    if (!res.ok || json.ok === false) throw new Error(json.error || t("pengaturan.flexOrg.errLoad"));
    setGroups(json.items ?? []);
    return json.items ?? [];
  }, [t]);

  const loadModels = useCallback(
    async (managementGroupId: string, activeMemberIds?: string[]) => {
      if (!managementGroupId) return;
      const res = await fetch(
        `/api/org/functional-operating-models?managementGroupId=${encodeURIComponent(managementGroupId)}`,
        { credentials: "include", headers: authJson() },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        items?: Array<{
          functionDomain: ConfigurableFunctionDomain;
          mode: FunctionalOperatingMode;
          sharedScopeKind: "ALL_IN_MANAGEMENT" | "SELECTED";
          selectedEntityIds: string[];
          effectiveFrom: string | null;
        }>;
        hybrid?: boolean;
      };
      if (!res.ok || json.ok === false) throw new Error(json.error || t("pengaturan.flexOrg.errLoad"));
      setHybrid(Boolean(json.hybrid));
      const memberIds =
        activeMemberIds ??
        (() => {
          const g = groups.find((x) => x.id === managementGroupId);
          const ids = g?.entityIds ?? [];
          return companies.filter((c) => ids.includes(c.id)).map((c) => c.id);
        })();
      setModels((prev) => {
        const next = { ...prev };
        for (const d of CONFIGURABLE_FUNCTION_DOMAINS) {
          const found = (json.items ?? []).find((i) => i.functionDomain === d);
          if (!found) {
            next[d] = {
              functionDomain: d,
              status: "inactive",
              managedEntityIds: [],
              effectiveFrom: null,
            };
            continue;
          }
          const ui = backendFomToUi({
            mode: found.mode,
            sharedScopeKind: found.sharedScopeKind,
            selectedEntityIds: found.selectedEntityIds ?? [],
            activeMembershipIds: memberIds,
          });
          next[d] = {
            functionDomain: d,
            status: ui.status,
            managedEntityIds: ui.managedEntityIds,
            effectiveFrom: found.effectiveFrom,
          };
        }
        return next;
      });
    },
    [t, groups, companies],
  );

  useEffect(() => {
    if (!allowed || !isOwner) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const profiles = await fetchCompanyProfiles();
        if (cancelled) return;
        const companyOpts = profiles.map((p) => ({
          id: p.id,
          company_name: p.company_name || p.code || p.id,
        }));
        setCompanies(companyOpts);
        const items = await loadGroups();
        if (cancelled) return;
        if (items[0] && !selectedId) {
          setSelectedId(items[0].id);
          const memberIds = companyOpts
            .filter((c) => (items[0].entityIds ?? []).includes(c.id))
            .map((c) => c.id);
          await loadModels(items[0].id, memberIds);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("pengaturan.flexOrg.errLoad"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial owner load
  }, [allowed, isOwner]);

  useEffect(() => {
    if (!selectedId || !isOwner) return;
    const g = groups.find((x) => x.id === selectedId);
    const memberIds = companies
      .filter((c) => (g?.entityIds ?? []).includes(c.id))
      .map((c) => c.id);
    void loadModels(selectedId, memberIds).catch((e) =>
      setError(e instanceof Error ? e.message : t("pengaturan.flexOrg.errLoad")),
    );
  }, [selectedId, isOwner, loadModels, t, groups, companies]);

  function notifySaved() {
    toast({
      tone: "success",
      title: t("pengaturan.flexOrg.saved"),
      detail: t("pengaturan.flexOrg.savedDetail"),
      duration: 3200,
    });
  }

  function notifyError(message: string) {
    toast({ tone: "error", title: t("pengaturan.flexOrg.errSave"), detail: message });
  }

  async function createManagement(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    if (!newCode.trim() || !newName.trim()) {
      setError(t("pengaturan.flexOrg.errNameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/org/management-groups", {
        method: "POST",
        credentials: "include",
        headers: authJson(),
        body: JSON.stringify({
          code: newCode.trim(),
          name: newName.trim(),
          notes: newNotes.trim() || undefined,
          entityIds: [],
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; data?: ManagementGroup };
      if (!res.ok || json.ok === false) throw new Error(json.error || t("pengaturan.flexOrg.errSave"));
      setNewCode("");
      setNewName("");
      setNewNotes("");
      setCreateOpen(false);
      const items = await loadGroups();
      if (json.data?.id) {
        setSelectedId(json.data.id);
        await fetch("/api/org/functional-operating-models", {
          method: "POST",
          credentials: "include",
          headers: authJson(),
          body: JSON.stringify({
            action: "ensureDefaults",
            managementGroupId: json.data.id,
            effectiveFrom,
          }),
        });
        await loadModels(json.data.id, []);
      } else if (items[0]) {
        setSelectedId(items[0].id);
      }
      notifySaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("pengaturan.flexOrg.errSave");
      setError(msg);
      notifyError(msg);
    } finally {
      setSaving(false);
    }
  }

  function validateBeforeSave(): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return t("pengaturan.flexOrg.errEffectiveDate");
    }
    for (const d of CONFIGURABLE_FUNCTION_DOMAINS) {
      const row = models[d];
      const mapped = uiFomToBackend({
        status: row.status,
        managedEntityIds: row.managedEntityIds,
        activeMembershipIds: membershipIds,
      });
      if ("error" in mapped) {
        return t("pengaturan.flexOrg.errActiveNeedsEntity");
      }
    }
    return null;
  }

  async function saveOperatingModels() {
    if (!isOwner || !selectedId) return;
    const validationError = validateBeforeSave();
    if (validationError) {
      setError(validationError);
      notifyError(validationError);
      setConfirmSaveOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const d of CONFIGURABLE_FUNCTION_DOMAINS) {
        const row = models[d];
        const mapped = uiFomToBackend({
          status: row.status,
          managedEntityIds: row.managedEntityIds,
          activeMembershipIds: membershipIds,
        });
        if ("error" in mapped) {
          throw new Error(t("pengaturan.flexOrg.errActiveNeedsEntity"));
        }
        const res = await fetch("/api/org/functional-operating-models", {
          method: "POST",
          credentials: "include",
          headers: authJson(),
          body: JSON.stringify({
            managementGroupId: selectedId,
            functionDomain: d,
            mode: mapped.mode,
            sharedScopeKind: mapped.sharedScopeKind,
            selectedEntityIds: mapped.selectedEntityIds,
            effectiveFrom,
          }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || json.ok === false) {
          throw new Error(json.error || `${t("pengaturan.flexOrg.errSave")} (${d})`);
        }
      }
      await loadModels(selectedId, membershipIds);
      setConfirmSaveOpen(false);
      notifySaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("pengaturan.flexOrg.errSave");
      setError(msg);
      notifyError(msg);
    } finally {
      setSaving(false);
    }
  }

  function setFunctionStatus(domain: ConfigurableFunctionDomain, status: FomUiStatus) {
    setModels((prev) => ({
      ...prev,
      [domain]: {
        ...prev[domain],
        status,
        managedEntityIds: status === "inactive" ? [] : prev[domain].managedEntityIds,
      },
    }));
  }

  function toggleManagedEntity(domain: ConfigurableFunctionDomain, companyId: string) {
    setModels((prev) => {
      const ids = prev[domain].managedEntityIds;
      const checked = ids.includes(companyId);
      return {
        ...prev,
        [domain]: {
          ...prev[domain],
          managedEntityIds: checked ? ids.filter((id) => id !== companyId) : [...ids, companyId],
        },
      };
    });
  }

  function renderEntityPicker(domain: ConfigurableFunctionDomain, row: ModelRow) {
    if (row.status !== "active") {
      return <span className="text-erp-text-muted">{t("pengaturan.flexOrg.scopeDash")}</span>;
    }
    if (membershipCompanies.length === 0) {
      return (
        <p className="text-xs text-erp-text-muted">{t("pengaturan.flexOrg.emptyEntitiesAvailable")}</p>
      );
    }
    return (
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        <p className="text-xs font-medium text-erp-text-muted">
          {t("pengaturan.flexOrg.managedEntities")}
        </p>
        {membershipCompanies.map((c) => {
          const checked = row.managedEntityIds.includes(c.id);
          return (
            <label key={c.id} className="flex items-center gap-2 text-xs text-erp-text">
              <Checkbox checked={checked} onChange={() => toggleManagedEntity(domain, c.id)} />
              <span>{c.company_name}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (!allowed || !isOwner) {
    return (
      <PageShell maxWidth="max-w-5xl">
        <Link
          href="/pengaturan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-erp-text-muted hover:text-erp-text"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <PermissionDeniedState
          title={t("pengaturan.flexOrg.managementTitle")}
          description={t("pengaturan.flexOrg.errOwnerOnly")}
        />
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="max-w-5xl">
      <div>
        <Link
          href="/pengaturan"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-erp-text-muted hover:text-erp-text"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("pengaturan.common.back")}
        </Link>
        <PageHeader
          title={t("pengaturan.flexOrg.managementTitle")}
          description={t("pengaturan.flexOrg.managementSubtitle")}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/pengaturan/organisasi"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-erp-border bg-erp-surface px-3 text-xs font-medium text-erp-text hover:bg-erp-surface-muted"
              >
                <Network className="h-4 w-4" />
                {t("pengaturan.flexOrg.step4")}
              </Link>
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setNewCode("");
                  setNewName("");
                  setNewNotes("");
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("pengaturan.flexOrg.addManagement")}
              </Button>
            </div>
          }
        />
      </div>

      {error ? <ErrorState title={t("pengaturan.flexOrg.errLoad")} description={error} /> : null}

      {loading ? (
        <LoadingState label={t("pengaturan.flexOrg.loading")} />
      ) : groups.length === 0 ? (
        <div className="space-y-8">
          <EmptyState
            title={t("pengaturan.flexOrg.noManagement")}
            description={t("pengaturan.flexOrg.noManagementDesc")}
            action={
              <Button
                type="button"
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {t("pengaturan.flexOrg.createManagement")}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            {groups.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const active = g.id === selectedId;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedId(g.id)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                        active
                          ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                          : "border-erp-border bg-erp-surface text-erp-text hover:bg-erp-surface-muted"
                      }`}
                    >
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-2 text-xs text-erp-text-muted">{g.code}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {selected ? (
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-erp-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-erp-text">{selected.name}</h2>
                  <p className="mt-0.5 text-sm text-erp-text-muted">{selected.code}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-erp-text-muted">
                    <span>
                      {t("pengaturan.flexOrg.entityCount", {
                        count: membershipCompanies.length,
                      })}
                    </span>
                    <Badge tone={selected.isActive ? "success" : "neutral"}>
                      {selected.isActive
                        ? t("pengaturan.flexOrg.statusActive")
                        : t("pengaturan.flexOrg.statusInactive")}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {selected ? (
            <section className="space-y-4">
              <SectionHeader
                title={t("pengaturan.flexOrg.entities")}
                description={t("pengaturan.flexOrg.entitiesSubtitle")}
                action={
                  <Link
                    href="/pengaturan/perusahaan"
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-erp-border bg-erp-surface px-3 text-xs font-medium text-erp-text hover:bg-erp-surface-muted"
                  >
                    {t("pengaturan.flexOrg.manageCompaniesLink")}
                  </Link>
                }
              />
              <div className="divide-y divide-erp-border rounded-xl border border-erp-border">
                {membershipCompanies.length === 0 ? (
                  <div className="space-y-1 px-4 py-6">
                    <p className="text-sm text-erp-text-muted">
                      {t("pengaturan.flexOrg.emptyEntities")}
                    </p>
                    <p className="text-xs text-erp-text-muted">
                      {t("pengaturan.flexOrg.emptyEntitiesHint")}
                    </p>
                  </div>
                ) : (
                  membershipCompanies.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-erp-text">
                          {c.company_name}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : null}

          {selected ? (
            <section className="space-y-4">
              <SectionHeader
                title={t("pengaturan.flexOrg.operatingModel")}
                description={t("pengaturan.flexOrg.operatingModelSubtitle")}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="effective-from" className="mb-0 text-xs text-erp-text-muted">
                      {t("pengaturan.flexOrg.effectiveFrom")}
                    </Label>
                    <Input
                      id="effective-from"
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      className="h-8 w-auto min-w-[10rem] py-1 text-sm"
                    />
                  </div>
                }
              />

              <p className="text-xs text-erp-text-muted">{t("pengaturan.flexOrg.modeNotPermission")}</p>

              {hybrid ? (
                <Alert tone="warning">{t("pengaturan.flexOrg.hybridHint")}</Alert>
              ) : null}

              <div className="hidden overflow-hidden rounded-xl border border-erp-border md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-erp-border bg-erp-surface-muted/50 text-xs uppercase tracking-wide text-erp-text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("pengaturan.flexOrg.functionCol")}
                      </th>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("pengaturan.flexOrg.statusCol")}
                      </th>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("pengaturan.flexOrg.managedEntitiesCol")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-erp-border">
                    {CONFIGURABLE_FUNCTION_DOMAINS.map((d) => {
                      const row = models[d];
                      return (
                        <tr key={d} className="align-top">
                          <td className="px-4 py-3">
                            <div className="font-medium text-erp-text">
                              {WORKSPACE_DOMAIN_LABELS[d]}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-2">
                              <label className="inline-flex items-center gap-2 text-sm text-erp-text">
                                <input
                                  type="radio"
                                  name={`status-${d}`}
                                  className="h-3.5 w-3.5"
                                  checked={row.status === "active"}
                                  onChange={() => setFunctionStatus(d, "active")}
                                />
                                {t("pengaturan.flexOrg.statusActive")}
                              </label>
                              <label className="inline-flex items-center gap-2 text-sm text-erp-text">
                                <input
                                  type="radio"
                                  name={`status-${d}`}
                                  className="h-3.5 w-3.5"
                                  checked={row.status === "inactive"}
                                  onChange={() => setFunctionStatus(d, "inactive")}
                                />
                                {t("pengaturan.flexOrg.statusInactive")}
                              </label>
                            </div>
                          </td>
                          <td className="px-4 py-3">{renderEntityPicker(d, row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {CONFIGURABLE_FUNCTION_DOMAINS.map((d) => {
                  const row = models[d];
                  return (
                    <div
                      key={d}
                      className="space-y-3 rounded-xl border border-erp-border px-3 py-3"
                    >
                      <div className="font-medium text-erp-text">{WORKSPACE_DOMAIN_LABELS[d]}</div>
                      <div className="flex flex-wrap gap-4">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`status-m-${d}`}
                            className="h-3.5 w-3.5"
                            checked={row.status === "active"}
                            onChange={() => setFunctionStatus(d, "active")}
                          />
                          {t("pengaturan.flexOrg.statusActive")}
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name={`status-m-${d}`}
                            className="h-3.5 w-3.5"
                            checked={row.status === "inactive"}
                            onChange={() => setFunctionStatus(d, "inactive")}
                          />
                          {t("pengaturan.flexOrg.statusInactive")}
                        </label>
                      </div>
                      {renderEntityPicker(d, row)}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end border-t border-erp-border pt-4">
                <Button
                  type="button"
                  loading={saving}
                  onClick={() => {
                    const validationError = validateBeforeSave();
                    if (validationError) {
                      setError(validationError);
                      notifyError(validationError);
                      return;
                    }
                    setConfirmSaveOpen(true);
                  }}
                >
                  <Save className="h-4 w-4" />
                  {t("pengaturan.flexOrg.saveChanges")}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("pengaturan.flexOrg.createManagement")}
        description={t("pengaturan.flexOrg.createModalDesc")}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("pengaturan.flexOrg.cancel")}
            </Button>
            <Button type="submit" form="create-management-form" loading={saving}>
              {t("pengaturan.flexOrg.createManagement")}
            </Button>
          </div>
        }
      >
        <form
          id="create-management-form"
          onSubmit={(e) => void createManagement(e)}
          className="space-y-3"
        >
          <div>
            <Label htmlFor="mgmt-code" required>
              {t("pengaturan.flexOrg.code")}
            </Label>
            <Input
              id="mgmt-code"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="mgmt-name" required>
              {t("pengaturan.flexOrg.name")}
            </Label>
            <Input
              id="mgmt-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="mgmt-notes">{t("pengaturan.flexOrg.notes")}</Label>
            <Textarea
              id="mgmt-notes"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              rows={2}
              className="mt-1 min-h-[4rem]"
            />
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmSaveOpen}
        onClose={() => setConfirmSaveOpen(false)}
        title={t("pengaturan.flexOrg.confirmSaveTitle")}
        description={t("pengaturan.flexOrg.confirmSave")}
        confirmLabel={t("pengaturan.flexOrg.save")}
        cancelLabel={t("pengaturan.flexOrg.cancel")}
        loading={saving}
        onConfirm={() => void saveOperatingModels()}
      />
    </PageShell>
  );
}
