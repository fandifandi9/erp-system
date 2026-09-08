/**
 * lib/capabilities/schedule.ts
 * Phase 33B — Work schedule capabilities.
 */

import {
  isHrAccount,
  isOwnerAccount,
  normalizeAuthModel,
  type AuthUserShape,
} from "@/lib/auth-model";

export const SCHEDULE_CAPABILITIES = [
  "schedule.view",
  "schedule.create",
  "schedule.update",
  "schedule.assign",
  "schedule.manage",
] as const;

export type ScheduleCapability = (typeof SCHEDULE_CAPABILITIES)[number];

export const SCHEDULE_CAPABILITY_DEFS: Record<
  ScheduleCapability,
  { label: string; grantedTo: Array<"owner" | "hr" | "manager" | "staff"> }
> = {
  "schedule.view": {
    label: "Lihat jadwal kerja",
    grantedTo: ["owner", "hr", "manager", "staff"],
  },
  "schedule.create": {
    label: "Buat jadwal kerja",
    grantedTo: ["owner", "hr"],
  },
  "schedule.update": {
    label: "Ubah jadwal kerja",
    grantedTo: ["owner", "hr"],
  },
  "schedule.assign": {
    label: "Tetapkan jadwal ke karyawan",
    grantedTo: ["owner", "hr"],
  },
  "schedule.manage": {
    label: "Kelola jadwal kerja (penuh)",
    grantedTo: ["owner", "hr"],
  },
};

export function resolveScheduleCapabilities(
  actor: AuthUserShape | null | undefined,
): Set<ScheduleCapability> {
  const caps = new Set<ScheduleCapability>();
  if (!actor) return caps;

  if (isOwnerAccount(actor)) {
    for (const c of SCHEDULE_CAPABILITIES) caps.add(c);
    return caps;
  }

  const auth = normalizeAuthModel(actor);
  const role = auth.roleCode;

  if (isHrAccount(actor)) {
    caps.add("schedule.view");
    caps.add("schedule.create");
    caps.add("schedule.update");
    caps.add("schedule.assign");
    caps.add("schedule.manage");
    return caps;
  }

  if (role === "manager") {
    caps.add("schedule.view");
    return caps;
  }

  if (role) {
    caps.add("schedule.view");
  }

  return caps;
}

export function hasScheduleCapability(
  actor: AuthUserShape | null | undefined,
  cap: ScheduleCapability,
): boolean {
  return resolveScheduleCapabilities(actor).has(cap);
}
