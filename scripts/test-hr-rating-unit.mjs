/**
 * Phase 12 — pure unit tests (calc + smart random + categories).
 * Self-contained JS mirror of lib/hr/rating-*.ts (no business drift: keep in sync).
 * Run: npm run test:hr-rating-unit
 */

function categorizeOverallScore(score) {
  const cents = Math.round(Number(score) * 100);
  if (!Number.isFinite(cents)) return "Perlu Perhatian HR";
  if (cents >= 450) return "Sangat Baik";
  if (cents >= 400) return "Baik";
  if (cents >= 300) return "Perlu Peningkatan";
  return "Perlu Perhatian HR";
}

function roundScore2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function calculateSubjectRating(reviewers) {
  const submitted = reviewers.filter((r) => r.aspectScores.length > 0);
  const reviewerMeans = submitted.map((r) => {
    const sum = r.aspectScores.reduce((a, s) => a + Number(s.score), 0);
    return { reviewerRowId: r.reviewerRowId, mean: roundScore2(sum / r.aspectScores.length) };
  });
  const overallScore =
    reviewerMeans.length === 0
      ? 0
      : roundScore2(reviewerMeans.reduce((a, m) => a + m.mean, 0) / reviewerMeans.length);
  const byAspect = new Map();
  for (const r of submitted) {
    for (const s of r.aspectScores) {
      const cur = byAspect.get(s.aspectId) || {
        aspectId: s.aspectId,
        aspectCode: s.aspectCode,
        aspectName: s.aspectName,
        scores: [],
      };
      cur.scores.push(Number(s.score));
      byAspect.set(s.aspectId, cur);
    }
  }
  const aspectAggregates = [...byAspect.values()].map((a) => ({
    aspectId: a.aspectId,
    aspectCode: a.aspectCode,
    aspectName: a.aspectName,
    average: roundScore2(a.scores.reduce((x, y) => x + y, 0) / a.scores.length),
  }));
  return {
    overallScore,
    category: categorizeOverallScore(overallScore),
    respondentCount: submitted.length,
    aspectAggregates,
    reviewerMeans,
  };
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildRelevantPool(subject, candidates, opts) {
  const subDept = norm(subject.department);
  const subDiv = norm(subject.division);
  const subOffice = String(subject.officeId || "").trim();
  const out = [];
  for (const c of candidates) {
    if (opts.excludeUserIds.has(c.userId)) continue;
    if (c.userId === subject.userId) continue;
    const st = String(c.status || "active").trim().toLowerCase();
    if (st && st !== "active") continue;
    if (!c.companyIds.some((id) => subject.companyIds.includes(id))) continue;
    const cDept = norm(c.department);
    const cDiv = norm(c.division);
    const cOffice = String(c.officeId || "").trim();
    let tier = null;
    let tierRank = 99;
    if (subDept && cDept && subDept === cDept) {
      tier = "department";
      tierRank = 1;
    } else if (subDiv && cDiv && subDiv === cDiv) {
      tier = "division";
      tierRank = 2;
    } else if (subOffice && cOffice && subOffice === cOffice) {
      tier = "office";
      tierRank = 3;
    }
    if (!tier) continue;
    out.push({ userId: c.userId, tier, tierRank });
  }
  return out;
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function insufficientReviewersMessage(available, requested) {
  return `Reviewer tersedia hanya ${available} orang dari ${requested} yang diminta.`;
}

function buildRatingProgress(input) {
  const requested = Math.max(0, Math.floor(Number(input.requested) || 0));
  const selected = Math.max(0, Math.floor(Number(input.selected) || 0));
  const completed = Math.max(0, Math.floor(Number(input.completed) || 0));
  const denom = selected || requested;
  const isComplete = selected > 0 && completed >= selected && denom > 0;
  return {
    requested,
    selected,
    completed,
    is_complete: isComplete,
    respondents_label: `${completed} / ${denom}`,
    status_label: isComplete ? "Complete" : completed > 0 ? "In Progress" : "Assigned",
    aggregate_kind: completed === 0 ? "none" : isComplete ? "final" : "current",
  };
}

function selectSmartRandomReviewers(pool, count, opts = {}) {
  const rng = opts.rng || Math.random;
  const previous = new Set(opts.previousPeriodReviewerIds || []);
  const eligible = [...pool].sort((a, b) => a.tierRank - b.tierRank);
  if (count < 1 || eligible.length < count) {
    return {
      ok: false,
      message: insufficientReviewersMessage(eligible.length, count),
      eligible,
    };
  }
  const byTier = new Map();
  for (const c of eligible) {
    const list = byTier.get(c.tierRank) || [];
    list.push(c);
    byTier.set(c.tierRank, list);
  }
  const ranks = [...byTier.keys()].sort((a, b) => a - b);
  const selected = [];
  const selectedIds = new Set();
  const tryPick = (preferAvoidPrevious) => {
    for (const rank of ranks) {
      if (selected.length >= count) break;
      const bucket = [...(byTier.get(rank) || [])].filter((c) => !selectedIds.has(c.userId));
      shuffleInPlace(bucket, rng);
      const ordered = preferAvoidPrevious
        ? [...bucket.filter((c) => !previous.has(c.userId)), ...bucket.filter((c) => previous.has(c.userId))]
        : bucket;
      for (const c of ordered) {
        if (selected.length >= count) break;
        if (
          preferAvoidPrevious &&
          previous.has(c.userId) &&
          bucket.some((x) => !previous.has(x.userId) && !selectedIds.has(x.userId))
        ) {
          continue;
        }
        selected.push(c);
        selectedIds.add(c.userId);
      }
    }
  };
  tryPick(true);
  if (selected.length < count) tryPick(false);
  return { ok: true, selected: selected.slice(0, count), eligible };
}

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
}

record("cat 4.50 Sangat Baik", categorizeOverallScore(4.5) === "Sangat Baik");
record("cat 4.49 Baik", categorizeOverallScore(4.49) === "Baik");
record("cat 4.00 Baik", categorizeOverallScore(4.0) === "Baik");
record("cat 3.99 Perlu Peningkatan", categorizeOverallScore(3.99) === "Perlu Peningkatan");
record("cat 2.99 Perlu Perhatian HR", categorizeOverallScore(2.99) === "Perlu Perhatian HR");

const calc = calculateSubjectRating([
  {
    reviewerRowId: "r1",
    aspectScores: [
      { aspectId: "a1", aspectCode: "discipline", aspectName: "Discipline", score: 5 },
      { aspectId: "a2", aspectCode: "teamwork", aspectName: "Teamwork", score: 4 },
    ],
  },
  {
    reviewerRowId: "r2",
    aspectScores: [
      { aspectId: "a1", aspectCode: "discipline", aspectName: "Discipline", score: 4 },
      { aspectId: "a2", aspectCode: "teamwork", aspectName: "Teamwork", score: 4 },
    ],
  },
]);
record("overall calc 4.25", calc.overallScore === 4.25, String(calc.overallScore));
record("respondents 2", calc.respondentCount === 2);
record(
  "discipline avg 4.5",
  calc.aspectAggregates.find((a) => a.aspectCode === "discipline")?.average === 4.5,
);
record("category Baik", calc.category === "Baik");

const subject = {
  userId: "andi",
  department: "Ops",
  division: "Warehouse",
  officeId: "off1",
  companyIds: ["c1"],
};
const candidates = [
  { userId: "andi", status: "active", department: "Ops", division: "Warehouse", officeId: "off1", companyIds: ["c1"] },
  { userId: "budi", status: "active", department: "Ops", division: "X", officeId: "off2", companyIds: ["c1"] },
  { userId: "citra", status: "active", department: "Sales", division: "Warehouse", officeId: "off3", companyIds: ["c1"] },
  { userId: "deni", status: "inactive", department: "Ops", division: "Warehouse", officeId: "off1", companyIds: ["c1"] },
  { userId: "eka", status: "active", department: "Ops", division: "Warehouse", officeId: "off1", companyIds: ["c2"] },
  { userId: "fajar", status: "active", department: "Finance", division: "HQ", officeId: "off9", companyIds: ["c1"] },
  { userId: "gita", status: "active", department: "Ops", division: "Y", officeId: "off1", companyIds: ["c1"] },
];
const pool = buildRelevantPool(subject, candidates, { excludeUserIds: new Set() });
const ids = pool.map((p) => p.userId);
record("excludes self", !ids.includes("andi"));
record("excludes inactive", !ids.includes("deni"));
record("excludes wrong company", !ids.includes("eka"));
record("excludes company-only irrelevant", !ids.includes("fajar"));
record("includes dept", ids.includes("budi"));
record("includes div", ids.includes("citra"));
record("includes office", ids.includes("gita"));

const pick = selectSmartRandomReviewers(pool, 3, { rng: () => 0.1 });
record("smart random selects 3", pick.ok && pick.selected.length === 3);
const insuf = selectSmartRandomReviewers(pool, 99);
record("insufficient pool", !insuf.ok && String(insuf.message).includes("Reviewer tersedia hanya"));

const incomplete = calculateSubjectRating([
  {
    reviewerRowId: "r1",
    aspectScores: [
      { aspectId: "a1", aspectCode: "discipline", aspectName: "Discipline", score: 4 },
      { aspectId: "a2", aspectCode: "teamwork", aspectName: "Teamwork", score: 4 },
    ],
  },
]);
record("incomplete still aggregates 1 reviewer", incomplete.respondentCount === 1 && incomplete.overallScore === 4);

const p1 = buildRatingProgress({ requested: 2, selected: 2, completed: 1 });
record("progress 1/2", p1.respondents_label === "1 / 2" && p1.status_label === "In Progress" && p1.aggregate_kind === "current");
const p2 = buildRatingProgress({ requested: 2, selected: 2, completed: 2 });
record("progress 2/2 complete", p2.respondents_label === "2 / 2" && p2.status_label === "Complete" && p2.aggregate_kind === "final");
record("reviewer count 1", buildRatingProgress({ requested: 1, selected: 1, completed: 1 }).is_complete);
record("reviewer count 4 incomplete", !buildRatingProgress({ requested: 4, selected: 4, completed: 1 }).is_complete);
record("eligible < requested message", insufficientReviewersMessage(2, 4) === "Reviewer tersedia hanya 2 orang dari 4 yang diminta.");

const fail = results.filter((r) => !r.ok).length;
console.log(`\nPASS=${results.length - fail} FAIL=${fail}`);
process.exit(fail > 0 ? 1 : 0);
