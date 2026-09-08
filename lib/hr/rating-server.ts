/**
 * Phase 12 — HR Rating server mutations (admin PB after session auth).
 */
import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { getAccessibleCompanyIds } from "@/lib/hr/company-scope";
import { assertHrAdminSurface } from "@/lib/access/hr-api-enforcement";
import { getHrOperationalCompanyIds } from "@/lib/org/resolve-hr-operational-company-scope";
import { calculateSubjectRating } from "@/lib/hr/rating-calc";
import { buildRatingNarrative } from "@/lib/hr/rating-summary";
import {
  buildRelevantPool,
  selectSmartRandomReviewers,
  type CandidateProfile,
  type SubjectContext,
} from "@/lib/hr/rating-smart-random";
import {
  RATING_COLLECTIONS,
  type RatingAssignmentMethod,
  type RatingPeriodStatus,
} from "@/lib/hr/rating-types";
import { emitBusinessEventServer } from "@/lib/tenant/activity-server";
import { buildRatingProgress } from "@/lib/hr/rating-progress";

function pbEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function ymd(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : "";
}

async function emitRatingEvent(
  adminPb: PocketBase,
  input: {
    event_code: string;
    actor_id: string;
    entity_type: string;
    entity_id: string;
    entity_label?: string;
    payload?: Record<string, unknown>;
  },
) {
  await emitBusinessEventServer(adminPb, {
    event_code: input.event_code,
    severity: "info",
    module: "hr",
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    entity_label: input.entity_label,
    actor_id: input.actor_id,
    payload: input.payload,
    dedupe_key: `${input.event_code}:${input.entity_id}:${Date.now()}`,
  });
}

async function assertSubjectInActorScope(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  subjectUserId: string,
): Promise<void> {
  if (ctx.isOwner) return;
  assertHrAdminSurface(ctx, "Akses HR ditolak.");
  const effectiveCompanies = await getHrOperationalCompanyIds(adminPb, ctx);
  if (effectiveCompanies.length === 0) {
    throw new HrApiError("Scope entitas HR tidak dapat ditentukan.", 403);
  }
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, subjectUserId);
  const overlap = subjectCompanies.some((id) => effectiveCompanies.includes(id));
  if (!overlap) throw new HrApiError("Akses lintas entitas ditolak.", 403);
}

/** Non-owner HR admin cannot create a rating assignment for themselves. */
function assertNotSelfRatingSubject(ctx: HrApiAuthContext, subjectId: string): void {
  if (ctx.isOwner) return;
  if (subjectId === ctx.userId) {
    throw new HrApiError(
      "HR tidak dapat membuat assignment rating untuk diri sendiri. Minta Owner.",
      403,
    );
  }
}

async function loadProfileOrg(
  adminPb: PocketBase,
  userId: string,
): Promise<{ department: string; division: string; officeId: string }> {
  try {
    const p = (await adminPb.collection("profiles").getFirstListItem(
      `user="${pbEscape(userId)}"`,
      { requestKey: null },
    )) as Record<string, unknown>;
    return {
      department: String(p.department ?? ""),
      division: String(p.division ?? ""),
      officeId:
        typeof p.office_id === "string"
          ? p.office_id
          : p.office_id && typeof p.office_id === "object" && "id" in (p.office_id as object)
            ? String((p.office_id as unknown as { id: string }).id)
            : "",
    };
  } catch {
    return { department: "", division: "", officeId: "" };
  }
}

async function assertUserActive(adminPb: PocketBase, userId: string): Promise<void> {
  try {
    const u = (await adminPb.collection("users").getOne(userId, {
      fields: "id,status",
      requestKey: null,
    })) as Record<string, unknown>;
    const st = String(u.status ?? "active").trim().toLowerCase();
    if (st && st !== "active") {
      throw new HrApiError("Akun tidak aktif.", 403);
    }
  } catch (e) {
    if (e instanceof HrApiError) throw e;
    throw new HrApiError("User tidak ditemukan.", 403);
  }
}

/** Owner creates/manages periods; HR can manage within scope for open operations. */
export async function serverCreatePeriod(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    name: string;
    start_date: string;
    end_date: string;
    description?: string;
    status?: RatingPeriodStatus;
  },
) {
  assertHrAdminSurface(ctx);
  const name = String(input.name || "").trim();
  const start = ymd(input.start_date);
  const end = ymd(input.end_date);
  if (!name || !start || !end) throw new HrApiError("Nama dan tanggal wajib.", 400);
  if (end < start) throw new HrApiError("Tanggal akhir tidak valid.", 400);
  const status = (input.status || "draft") as RatingPeriodStatus;
  const row = await adminPb.collection(RATING_COLLECTIONS.periods).create({
    name,
    start_date: `${start} 00:00:00.000Z`,
    end_date: `${end} 00:00:00.000Z`,
    status,
    description: String(input.description || "").trim() || undefined,
    created_by: ctx.userId,
  });
  await emitRatingEvent(adminPb, {
    event_code: "hr.rating.period_created",
    actor_id: ctx.userId,
    entity_type: RATING_COLLECTIONS.periods,
    entity_id: row.id,
    entity_label: name,
    payload: { status },
  });
  return row;
}

export async function serverListPeriods(adminPb: PocketBase, ctx: HrApiAuthContext) {
  assertHrAdminSurface(ctx);
  return adminPb.collection(RATING_COLLECTIONS.periods).getFullList({
    sort: "-start_date,-created",
    requestKey: null,
  });
}

export async function serverUpdatePeriodStatus(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  periodId: string,
  status: RatingPeriodStatus,
) {
  assertHrAdminSurface(ctx);
  const current = (await adminPb.collection(RATING_COLLECTIONS.periods).getOne(periodId, {
    requestKey: null,
  })) as unknown as { id: string; status?: string };
  const prev = String(current.status || "");
  if (["closed", "cancelled"].includes(prev) && status !== prev) {
    throw new HrApiError("Period tertutup/dibatalkan tidak dapat diubah.", 400);
  }
  const row = await adminPb.collection(RATING_COLLECTIONS.periods).update(periodId, { status });
  await emitRatingEvent(adminPb, {
    event_code: status === "closed" ? "hr.rating.period_closed" : "hr.rating.period_status",
    actor_id: ctx.userId,
    entity_type: RATING_COLLECTIONS.periods,
    entity_id: periodId,
    payload: { status },
  });
  return row;
}

async function listActiveAspects(adminPb: PocketBase) {
  const rows = await adminPb.collection(RATING_COLLECTIONS.aspects).getFullList({
    filter: "is_active = true",
    sort: "sort_order,name",
    requestKey: null,
  });
  return rows as Array<Record<string, unknown> & { id: string }>;
}

async function buildCandidateUniverse(
  adminPb: PocketBase,
  subjectCompanies: string[],
): Promise<CandidateProfile[]> {
  const users = await adminPb.collection("users").getFullList({
    fields: "id,status,account_type",
    requestKey: null,
  });
  const profiles = await adminPb.collection("profiles").getFullList({
    fields: "user,department,division,office_id",
    requestKey: null,
  });
  const memberships = await adminPb.collection("biz_user_companies").getFullList<{
    user: string;
    company: string;
    is_active?: boolean;
  }>({
    filter: subjectCompanies.map((c) => `company="${pbEscape(c)}"`).join(" || ") || 'id=""',
    requestKey: null,
  });

  const companyByUser = new Map<string, string[]>();
  for (const m of memberships) {
    if (m.is_active === false) continue;
    const list = companyByUser.get(m.user) ?? [];
    list.push(m.company);
    companyByUser.set(m.user, list);
  }

  const profileByUser = new Map<string, { department: string; division: string; officeId: string }>();
  for (const p of profiles) {
    const uid = String((p as unknown as { user?: string }).user || "");
    if (!uid) continue;
    const office = (p as unknown as { office_id?: string }).office_id;
    profileByUser.set(uid, {
      department: String((p as unknown as { department?: string }).department || ""),
      division: String((p as unknown as { division?: string }).division || ""),
      officeId: typeof office === "string" ? office : "",
    });
  }

  const out: CandidateProfile[] = [];
  for (const u of users) {
    const id = String((u as unknown as { id: string }).id);
    const accountType = String((u as unknown as { account_type?: string }).account_type || "");
    if (accountType === "owner") continue; // owners manage; not typical peer reviewers
    const org = profileByUser.get(id) || { department: "", division: "", officeId: "" };
    const companies = companyByUser.get(id) || [];
    if (!companies.length) continue;
    out.push({
      userId: id,
      status: String((u as unknown as { status?: string }).status || "active"),
      department: org.department,
      division: org.division,
      officeId: org.officeId,
      companyIds: companies,
    });
  }
  return out;
}

async function previousPeriodReviewerIds(
  adminPb: PocketBase,
  periodId: string,
  subjectUserId: string,
): Promise<string[]> {
  try {
    const current = (await adminPb.collection(RATING_COLLECTIONS.periods).getOne(periodId, {
      requestKey: null,
    })) as unknown as { start_date?: string };
    const start = ymd(current.start_date);
    const periods = await adminPb.collection(RATING_COLLECTIONS.periods).getFullList({
      filter: `status="closed"`,
      sort: "-end_date,-created",
      requestKey: null,
    });
    const prev = periods.find((p) => ymd((p as unknown as { end_date?: string }).end_date) < start) || periods[0];
    if (!prev) return [];
    const assignments = await adminPb.collection(RATING_COLLECTIONS.assignments).getFullList({
      filter: `period="${pbEscape(prev.id)}" && subject="${pbEscape(subjectUserId)}"`,
      requestKey: null,
    });
    const ids: string[] = [];
    for (const a of assignments) {
      const revs = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
        filter: `assignment="${pbEscape(a.id)}"`,
        requestKey: null,
      });
      for (const r of revs) {
        ids.push(String((r as unknown as { reviewer: string }).reviewer));
      }
    }
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

export async function serverCreateAssignment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: {
    period_id: string;
    subject_user_id: string;
    reviewer_count: number;
    method: RatingAssignmentMethod;
    /** Required when method=manual */
    manual_reviewer_ids?: string[];
  },
) {
  assertHrAdminSurface(ctx);

  const subjectId = String(input.subject_user_id || "").trim();
  const count = Math.floor(Number(input.reviewer_count));
  if (!subjectId || count < 1) throw new HrApiError("Subject dan jumlah reviewer wajib.", 400);

  // HR operational admin cannot create assignment for themselves (Owner must)
  assertNotSelfRatingSubject(ctx, subjectId);

  await assertSubjectInActorScope(adminPb, ctx, subjectId);
  await assertUserActive(adminPb, subjectId);

  const period = (await adminPb.collection(RATING_COLLECTIONS.periods).getOne(input.period_id, {
    requestKey: null,
  })) as unknown as { id: string; status?: string; name?: string };
  if (["closed", "cancelled"].includes(String(period.status))) {
    throw new HrApiError("Period sudah ditutup/dibatalkan.", 400);
  }

  const existing = await adminPb.collection(RATING_COLLECTIONS.assignments).getFullList({
    filter: `period="${pbEscape(period.id)}" && subject="${pbEscape(subjectId)}" && status!="cancelled"`,
    requestKey: null,
  });
  if (existing.length) {
    throw new HrApiError("Assignment untuk subject ini di period tersebut sudah ada.", 400);
  }

  const subjectCompanies = await getAccessibleCompanyIds(adminPb, subjectId);
  if (!subjectCompanies.length) {
    throw new HrApiError("Subject tidak memiliki company membership.", 400);
  }
  const org = await loadProfileOrg(adminPb, subjectId);
  const subjectCtx: SubjectContext = {
    userId: subjectId,
    department: org.department,
    division: org.division,
    officeId: org.officeId,
    companyIds: subjectCompanies,
  };

  const alreadyAssignedInPeriod = new Set<string>();
  const periodAssignments = await adminPb.collection(RATING_COLLECTIONS.assignments).getFullList({
    filter: `period="${pbEscape(period.id)}" && subject="${pbEscape(subjectId)}"`,
    requestKey: null,
  });
  for (const a of periodAssignments) {
    const revs = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
      filter: `assignment="${pbEscape(a.id)}"`,
      requestKey: null,
    });
    for (const r of revs) alreadyAssignedInPeriod.add(String((r as unknown as { reviewer: string }).reviewer));
  }

  let selectedIds: string[] = [];
  let evidence: Record<string, unknown> = {};
  const method = input.method;

  if (method === "manual") {
    const manual = [...new Set((input.manual_reviewer_ids || []).map(String))];
    if (manual.length !== count) {
      throw new HrApiError(
        `Manual selection harus tepat ${count} reviewer (dikirim ${manual.length}).`,
        400,
      );
    }
    if (manual.includes(subjectId)) {
      throw new HrApiError("Subject tidak boleh menjadi reviewer diri sendiri.", 400);
    }
    const universe = await buildCandidateUniverse(adminPb, subjectCompanies);
    const pool = buildRelevantPool(subjectCtx, universe, {
      excludeUserIds: new Set([subjectId, ...alreadyAssignedInPeriod]),
    });
    const eligibleIds = new Set(pool.map((p) => p.userId));
    for (const id of manual) {
      await assertUserActive(adminPb, id);
      if (!eligibleIds.has(id)) {
        throw new HrApiError(
          `Reviewer ${id} tidak relevan/eligible untuk subject (dept/div/office + company).`,
          400,
        );
      }
    }
    selectedIds = manual;
    evidence = {
      method: "manual",
      eligible_count: pool.length,
      eligible_ids: pool.map((p) => p.userId),
      selected: manual,
    };
  } else {
    const universe = await buildCandidateUniverse(adminPb, subjectCompanies);
    const previous = await previousPeriodReviewerIds(adminPb, period.id, subjectId);
    const pool = buildRelevantPool(subjectCtx, universe, {
      excludeUserIds: new Set([subjectId, ...alreadyAssignedInPeriod]),
    });
    const pick = selectSmartRandomReviewers(pool, count, {
      previousPeriodReviewerIds: previous,
    });
    if (!pick.ok) {
      throw new HrApiError(pick.message, 400);
    }
    selectedIds = pick.selected.map((s) => s.userId);
    evidence = {
      method: "smart_random",
      eligible_count: pick.eligible.length,
      eligible: pick.eligible.map((e) => ({ userId: e.userId, tier: e.tier })),
      selected: pick.selected.map((e) => ({ userId: e.userId, tier: e.tier })),
      previous_period_avoided: pick.previousAvoided,
      previous_period_reviewers: previous,
    };
  }

  const assignment = await adminPb.collection(RATING_COLLECTIONS.assignments).create({
    period: period.id,
    subject: subjectId,
    reviewer_count: count,
    assignment_method: method,
    status: "assigned",
    selection_evidence_json: JSON.stringify(evidence),
    created_by: ctx.userId,
  });

  const reviewerRows = [];
  for (const rid of selectedIds) {
    const tier =
      method === "smart_random"
        ? (evidence as unknown as { selected?: { userId: string; tier: string }[] }).selected?.find(
            (s) => s.userId === rid,
          )?.tier
        : "manual";
    const row = await adminPb.collection(RATING_COLLECTIONS.reviewers).create({
      assignment: assignment.id,
      reviewer: rid,
      status: "assigned",
      relevance_tier: tier || "manual",
      selection_note: method,
    });
    reviewerRows.push(row);
  }

  if (String(period.status) === "open" || String(period.status) === "draft") {
    await adminPb.collection(RATING_COLLECTIONS.periods).update(period.id, {
      status: "in_progress",
    });
  }

  await emitRatingEvent(adminPb, {
    event_code: "hr.rating.assignment_created",
    actor_id: ctx.userId,
    entity_type: RATING_COLLECTIONS.assignments,
    entity_id: assignment.id,
    entity_label: `subject:${subjectId}`,
    payload: { method, reviewer_count: count, reviewers: selectedIds },
  });
  await emitRatingEvent(adminPb, {
    event_code: "hr.rating.reviewers_selected",
    actor_id: ctx.userId,
    entity_type: RATING_COLLECTIONS.assignments,
    entity_id: assignment.id,
    payload: evidence,
  });

  return { assignment, reviewers: reviewerRows, evidence };
}

export async function serverListMyReviewerTasks(adminPb: PocketBase, ctx: HrApiAuthContext) {
  const rows = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
    filter: `reviewer="${pbEscape(ctx.userId)}"`,
    expand: "assignment,assignment.period,assignment.subject",
    sort: "-created",
    requestKey: null,
  });
  // Privacy: never expand other reviewers
  return rows;
}

export async function serverGetReviewerTask(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  reviewerRowId: string,
) {
  const row = (await adminPb.collection(RATING_COLLECTIONS.reviewers).getOne(reviewerRowId, {
    expand: "assignment,assignment.period,assignment.subject",
    requestKey: null,
  })) as Record<string, unknown> & { id: string; reviewer?: string };
  if (String(row.reviewer) !== ctx.userId) {
    assertHrAdminSurface(ctx, "Akses ditolak.");
  }
  const aspects = await listActiveAspects(adminPb);
  const scores = await adminPb.collection(RATING_COLLECTIONS.scores).getFullList({
    filter: `reviewer_row="${pbEscape(reviewerRowId)}"`,
    requestKey: null,
  });
  return { reviewer: row, aspects, scores };
}

export async function serverSaveReviewerDraft(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  reviewerRowId: string,
  input: { scores: { aspect_id: string; score: number; comment?: string }[] },
) {
  await assertUserActive(adminPb, ctx.userId);
  const row = (await adminPb.collection(RATING_COLLECTIONS.reviewers).getOne(reviewerRowId, {
    requestKey: null,
  })) as unknown as { id: string; reviewer: string; status: string; assignment: string };
  if (row.reviewer !== ctx.userId) throw new HrApiError("Bukan tugas Anda.", 403);
  if (row.status === "submitted" || row.status === "locked") {
    throw new HrApiError("Sudah dikirim dan terkunci.", 400);
  }

  const aspects = await listActiveAspects(adminPb);
  const aspectIds = new Set(aspects.map((a) => a.id));
  for (const s of input.scores || []) {
    if (!aspectIds.has(s.aspect_id)) throw new HrApiError("Aspect tidak valid.", 400);
    const score = Number(s.score);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      throw new HrApiError("Skor harus 1–5.", 400);
    }
  }

  const existing = await adminPb.collection(RATING_COLLECTIONS.scores).getFullList({
    filter: `reviewer_row="${pbEscape(reviewerRowId)}"`,
    requestKey: null,
  });
  for (const e of existing) {
    await adminPb.collection(RATING_COLLECTIONS.scores).delete(e.id);
  }
  for (const s of input.scores || []) {
    await adminPb.collection(RATING_COLLECTIONS.scores).create({
      reviewer_row: reviewerRowId,
      aspect: s.aspect_id,
      score: Number(s.score),
      comment: String(s.comment || "").trim() || undefined,
    });
  }
  const updated = await adminPb.collection(RATING_COLLECTIONS.reviewers).update(reviewerRowId, {
    status: "draft",
  });
  return updated;
}

export async function serverSubmitReviewer(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  reviewerRowId: string,
) {
  await assertUserActive(adminPb, ctx.userId);
  const row = (await adminPb.collection(RATING_COLLECTIONS.reviewers).getOne(reviewerRowId, {
    requestKey: null,
  })) as unknown as { id: string; reviewer: string; status: string; assignment: string };
  if (row.reviewer !== ctx.userId) throw new HrApiError("Bukan tugas Anda.", 403);
  if (row.status === "submitted" || row.status === "locked") {
    throw new HrApiError("Sudah dikirim dan terkunci.", 400);
  }

  const aspects = await listActiveAspects(adminPb);
  const scores = await adminPb.collection(RATING_COLLECTIONS.scores).getFullList({
    filter: `reviewer_row="${pbEscape(reviewerRowId)}"`,
    requestKey: null,
  });
  if (scores.length < aspects.length) {
    throw new HrApiError("Lengkapi semua aspek sebelum submit.", 400);
  }

  const updated = await adminPb.collection(RATING_COLLECTIONS.reviewers).update(reviewerRowId, {
    status: "locked",
    submitted_at: new Date().toISOString(),
  });

  await emitRatingEvent(adminPb, {
    event_code: "hr.rating.reviewer_submitted",
    actor_id: ctx.userId,
    entity_type: RATING_COLLECTIONS.reviewers,
    entity_id: reviewerRowId,
    payload: { assignment: row.assignment },
  });

  await recalculateAssignmentResult(adminPb, row.assignment);
  return updated;
}

export async function recalculateAssignmentResult(adminPb: PocketBase, assignmentId: string) {
  const aspects = await listActiveAspects(adminPb);
  const aspectMap = new Map(aspects.map((a) => [a.id, a]));
  const reviewers = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
    filter: `assignment="${pbEscape(assignmentId)}" && (status="submitted" || status="locked")`,
    requestKey: null,
  });

  const inputs = [];
  for (const r of reviewers) {
    const scores = await adminPb.collection(RATING_COLLECTIONS.scores).getFullList({
      filter: `reviewer_row="${pbEscape(r.id)}"`,
      requestKey: null,
    });
    inputs.push({
      reviewerRowId: r.id,
      aspectScores: scores.map((s) => {
        const aspectId = String((s as unknown as { aspect: string }).aspect);
        const a = aspectMap.get(aspectId);
        return {
          aspectId,
          aspectCode: String(a?.code || ""),
          aspectName: String(a?.name || aspectId),
          score: Number((s as unknown as { score: number }).score),
        };
      }),
    });
  }

  const calc = calculateSubjectRating(inputs);
  const narrative = buildRatingNarrative(calc.overallScore, calc.category, calc.aspectAggregates);

  const existing = await adminPb.collection(RATING_COLLECTIONS.results).getFullList({
    filter: `assignment="${pbEscape(assignmentId)}"`,
    requestKey: null,
  });
  const payload = {
    assignment: assignmentId,
    overall_score: calc.overallScore,
    category: calc.category,
    respondent_count: calc.respondentCount,
    aspect_scores_json: JSON.stringify(calc.aspectAggregates),
    summary: narrative.summary,
    strengths: narrative.strengths,
    improvements: narrative.improvements,
    suggestions: narrative.suggestions,
    calculated_at: new Date().toISOString(),
  };
  if (existing[0]) {
    await adminPb.collection(RATING_COLLECTIONS.results).update(existing[0].id, payload);
  } else {
    await adminPb.collection(RATING_COLLECTIONS.results).create(payload);
  }

  const all = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
    filter: `assignment="${pbEscape(assignmentId)}"`,
    requestKey: null,
  });
  const done = all.filter((r) => ["submitted", "locked"].includes(String((r as unknown as { status: string }).status)));
  const progress = buildRatingProgress({
    requested: Number(
      (
        await adminPb.collection(RATING_COLLECTIONS.assignments).getOne(assignmentId, {
          requestKey: null,
        })
      ).reviewer_count,
    ),
    selected: all.length,
    completed: done.length,
  });
  if (all.length && done.length === all.length) {
    await adminPb.collection(RATING_COLLECTIONS.assignments).update(assignmentId, {
      status: "completed",
    });
  } else if (done.length > 0) {
    await adminPb.collection(RATING_COLLECTIONS.assignments).update(assignmentId, {
      status: "in_progress",
    });
  }

  return { ...calc, progress };
}

/** Subject-safe aggregate only. */
export async function serverGetMyResult(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  assignmentId?: string,
) {
  let assignment;
  if (assignmentId) {
    assignment = await adminPb.collection(RATING_COLLECTIONS.assignments).getOne(assignmentId, {
      expand: "period",
      requestKey: null,
    });
  } else {
    const list = await adminPb.collection(RATING_COLLECTIONS.assignments).getList(1, 1, {
      filter: `subject="${pbEscape(ctx.userId)}" && status!="cancelled"`,
      sort: "-created",
      expand: "period",
      requestKey: null,
    });
    assignment = list.items[0];
  }
  if (!assignment) return null;
  if (String((assignment as unknown as { subject: string }).subject) !== ctx.userId) {
    throw new HrApiError("Akses ditolak.", 403);
  }
  const results = await adminPb.collection(RATING_COLLECTIONS.results).getFullList({
    filter: `assignment="${pbEscape(assignment.id)}"`,
    requestKey: null,
  });
  const reviewers = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
    filter: `assignment="${pbEscape(assignment.id)}"`,
    requestKey: null,
  });
  const completed = reviewers.filter((r) =>
    ["submitted", "locked"].includes(String((r as unknown as { status: string }).status)),
  ).length;
  const evidence = safeParseJson(
    (assignment as unknown as { selection_evidence_json?: string }).selection_evidence_json,
  ) as { eligible_count?: number };
  const progress = buildRatingProgress({
    requested: Number((assignment as unknown as { reviewer_count?: number }).reviewer_count || reviewers.length),
    selected: reviewers.length,
    completed,
    eligible: evidence.eligible_count ?? null,
    assignmentStatus: String((assignment as unknown as { status: string }).status),
  });
  const result = results[0] as Record<string, unknown> | undefined;
  const base = {
    assignment_id: assignment.id,
    period: (assignment as unknown as { expand?: { period?: unknown } }).expand?.period ?? null,
    status: (assignment as unknown as { status: string }).status,
    progress,
  };
  if (!result) {
    return { ...base, result: null };
  }
  // Strip anything that could leak reviewers
  return {
    ...base,
    result: {
      overall_score: result.overall_score,
      category: result.category,
      respondent_count: result.respondent_count,
      respondents_label: progress.respondents_label,
      is_complete: progress.is_complete,
      aggregate_kind: progress.aggregate_kind,
      aspect_scores: safeParseJson(result.aspect_scores_json),
      summary: result.summary,
      strengths: result.strengths,
      improvements: result.improvements,
      suggestions: result.suggestions,
      calculated_at: result.calculated_at,
    },
  };
}

function safeParseJson(raw: unknown) {
  try {
    return JSON.parse(String(raw || "[]"));
  } catch {
    return [];
  }
}

/** Full HR/Owner drill-down. */
export async function serverGetAssignmentDetail(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  assignmentId: string,
) {
  assertHrAdminSurface(ctx);
  const assignment = (await adminPb
    .collection(RATING_COLLECTIONS.assignments)
    .getOne(assignmentId, {
      expand: "period,subject,created_by",
      requestKey: null,
    })) as Record<string, unknown> & { id: string; subject: string };
  await assertSubjectInActorScope(adminPb, ctx, String(assignment.subject));

  const reviewers = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
    filter: `assignment="${pbEscape(assignmentId)}"`,
    expand: "reviewer",
    requestKey: null,
  });
  const aspects = await listActiveAspects(adminPb);
  const detail = [];
  for (const r of reviewers) {
    const scores = await adminPb.collection(RATING_COLLECTIONS.scores).getFullList({
      filter: `reviewer_row="${pbEscape(r.id)}"`,
      expand: "aspect",
      requestKey: null,
    });
    detail.push({ reviewer_row: r, scores });
  }
  const results = await adminPb.collection(RATING_COLLECTIONS.results).getFullList({
    filter: `assignment="${pbEscape(assignmentId)}"`,
    requestKey: null,
  });
  const evidence = safeParseJson(assignment.selection_evidence_json) as {
    eligible_count?: number;
    previous_period_avoided?: string[];
  };
  const completed = detail.filter((d) =>
    ["submitted", "locked"].includes(String((d.reviewer_row as { status?: string }).status)),
  ).length;
  const progress = buildRatingProgress({
    requested: Number((assignment as { reviewer_count?: number }).reviewer_count || detail.length),
    selected: detail.length,
    completed,
    eligible: evidence.eligible_count ?? null,
    assignmentStatus: String((assignment as { status?: string }).status),
  });
  return {
    assignment,
    aspects,
    reviewers: detail,
    result: results[0] || null,
    selection_evidence: evidence,
    progress,
    previous_period_avoided: evidence.previous_period_avoided || [],
  };
}

export async function serverListAssignmentsForHr(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  periodId?: string,
) {
  assertHrAdminSurface(ctx);
  const filter = periodId ? `period="${pbEscape(periodId)}"` : "";
  const list = await adminPb.collection(RATING_COLLECTIONS.assignments).getFullList({
    filter,
    expand: "subject,period",
    sort: "-created",
    requestKey: null,
  });
  if (ctx.isOwner) return enrichAssignmentsWithProgress(adminPb, list);
  const out = [];
  for (const a of list) {
    try {
      await assertSubjectInActorScope(adminPb, ctx, String((a as unknown as { subject: string }).subject));
      out.push(a);
    } catch {
      /* skip out of scope */
    }
  }
  return enrichAssignmentsWithProgress(adminPb, out);
}

async function enrichAssignmentsWithProgress(adminPb: PocketBase, list: { id: string }[]) {
  const out = [];
  for (const a of list) {
    const reviewers = await adminPb.collection(RATING_COLLECTIONS.reviewers).getFullList({
      filter: `assignment="${pbEscape(a.id)}"`,
      requestKey: null,
    });
    const completed = reviewers.filter((r) =>
      ["submitted", "locked"].includes(String((r as unknown as { status: string }).status)),
    ).length;
    const evidence = safeParseJson(
      (a as unknown as { selection_evidence_json?: string }).selection_evidence_json,
    ) as { eligible_count?: number };
    const progress = buildRatingProgress({
      requested: Number((a as unknown as { reviewer_count?: number }).reviewer_count || reviewers.length),
      selected: reviewers.length,
      completed,
      eligible: evidence.eligible_count ?? null,
      assignmentStatus: String((a as unknown as { status?: string }).status),
    });
    out.push({ ...a, progress });
  }
  return out;
}

export async function serverPreviewAssignment(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  input: { period_id: string; subject_user_id: string; reviewer_count: number },
) {
  assertHrAdminSurface(ctx);
  const subjectId = String(input.subject_user_id || "").trim();
  const count = Math.floor(Number(input.reviewer_count));
  if (!subjectId || count < 1) throw new HrApiError("Subject dan jumlah reviewer wajib.", 400);
  assertNotSelfRatingSubject(ctx, subjectId);
  await assertSubjectInActorScope(adminPb, ctx, subjectId);
  await assertUserActive(adminPb, subjectId);
  const subjectCompanies = await getAccessibleCompanyIds(adminPb, subjectId);
  if (!subjectCompanies.length) {
    throw new HrApiError("Subject tidak memiliki company membership.", 400);
  }
  const org = await loadProfileOrg(adminPb, subjectId);
  const subjectCtx: SubjectContext = {
    userId: subjectId,
    department: org.department,
    division: org.division,
    officeId: org.officeId,
    companyIds: subjectCompanies,
  };
  const universe = await buildCandidateUniverse(adminPb, subjectCompanies);
  const previous = input.period_id
    ? await previousPeriodReviewerIds(adminPb, input.period_id, subjectId)
    : [];
  const pool = buildRelevantPool(subjectCtx, universe, {
    excludeUserIds: new Set([subjectId]),
  });
  const byTier = { department: 0, division: 0, office: 0 };
  for (const p of pool) {
    if (p.tier === "department") byTier.department += 1;
    else if (p.tier === "division") byTier.division += 1;
    else if (p.tier === "office") byTier.office += 1;
  }
  const sufficient = pool.length >= count;
  return {
    subject_user_id: subjectId,
    requested: count,
    eligible_count: pool.length,
    sufficient,
    warning: sufficient
      ? null
      : `Reviewer tersedia hanya ${pool.length} orang dari ${count} yang diminta.`,
    will_select: sufficient ? count : 0,
    tiers: byTier,
    previous_period_reviewer_count: previous.length,
    eligible_preview: pool.map((p) => ({ userId: p.userId, tier: p.tier })),
  };
}

export async function serverGetRatingDashboard(adminPb: PocketBase, ctx: HrApiAuthContext) {
  const assignments = await serverListAssignmentsForHr(adminPb, ctx);
  const periods = await serverListPeriods(adminPb, ctx);
  const active =
    periods.find((p) => ["in_progress", "open"].includes(String((p as { status?: string }).status))) ||
    periods[0] ||
    null;
  const scoped = active
    ? assignments.filter(
        (a) => String((a as { period?: string }).period) === String((active as { id: string }).id),
      )
    : assignments;
  const completed = scoped.filter((a) => (a as { progress?: { is_complete?: boolean } }).progress?.is_complete);
  const inProgress = scoped.filter(
    (a) => String((a as { status?: string }).status) === "in_progress" ||
      ((a as { progress?: { completed?: number } }).progress?.completed || 0) > 0,
  );
  const results = [];
  for (const a of scoped) {
    const rows = await adminPb.collection(RATING_COLLECTIONS.results).getFullList({
      filter: `assignment="${pbEscape(a.id)}"`,
      requestKey: null,
    });
    if (rows[0]) results.push(rows[0] as { overall_score?: number; category?: string });
  }
  const scores = results.map((r) => Number(r.overall_score)).filter((n) => Number.isFinite(n));
  const average =
    scores.length === 0 ? null : Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 100) / 100;
  const attention = results.filter((r) => String(r.category) === "Perlu Perhatian HR").length;
  return {
    period: active,
    total_subjects: scoped.length,
    total_assignments: scoped.length,
    completed: completed.length,
    in_progress: inProgress.length,
    average_score: average,
    attention_count: attention,
  };
}

export async function serverListRatingResults(adminPb: PocketBase, ctx: HrApiAuthContext, periodId?: string) {
  const assignments = await serverListAssignmentsForHr(adminPb, ctx, periodId);
  const out = [];
  for (const a of assignments) {
    const rows = await adminPb.collection(RATING_COLLECTIONS.results).getFullList({
      filter: `assignment="${pbEscape(a.id)}"`,
      requestKey: null,
    });
    const result = (rows[0] as Record<string, unknown> | undefined) || null;
    out.push({
      assignment: a,
      progress: (a as { progress?: unknown }).progress,
      result: result
        ? {
            overall_score: result.overall_score,
            category: result.category,
            respondent_count: result.respondent_count,
            summary: result.summary,
            suggestions: result.suggestions,
          }
        : null,
    });
  }
  return out;
}

export async function serverListAspects(adminPb: PocketBase) {
  return listActiveAspects(adminPb);
}
