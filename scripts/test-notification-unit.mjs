/**
 * scripts/test-notification-unit.mjs
 * Phase 24 — Unit tests for notification system (pure logic, no I/O).
 *
 * Run: node scripts/test-notification-unit.mjs
 * Or:  npm run test:notification-unit
 *
 * Tests:
 *  1.  create notification record (mock)
 *  2.  recipient resolution capability mapping
 *  3.  RBAC filtering (only HR/Owner can be approvers)
 *  4.  User A isolation from User B
 *  5.  mark-read authorization
 *  6.  duplicate prevention (idempotency_key)
 *  7.  malformed event (missing type)
 *  8.  unknown recipient (empty list)
 *  9.  missing capability (non-HR caps return empty)
 * 10.  multi-device token behavior
 * 11.  invalid token handling
 * 12.  privacy-safe notification payload
 * 13.  deep-link action field (no auth in payload)
 */

// ─── Inline notification types ────────────────────────────────────────────────
// Mirrors lib/notifications/types.ts

const NOTIFICATION_SAFE_TEXTS = {
  "leave.created":           { title: "Pengajuan Cuti Baru",         body: "Ada pengajuan cuti yang memerlukan persetujuan Anda." },
  "leave.approved":          { title: "Cuti Disetujui",              body: "Pengajuan cuti Anda telah disetujui." },
  "leave.rejected":          { title: "Cuti Ditolak",                body: "Pengajuan cuti Anda tidak disetujui. Buka detail untuk informasi lengkap." },
  "leave.cancelled":         { title: "Pengajuan Cuti Dibatalkan",   body: "Sebuah pengajuan cuti telah dibatalkan." },
  "overtime.created":        { title: "Pengajuan Lembur Baru",       body: "Ada pengajuan lembur yang memerlukan persetujuan Anda." },
  "overtime.approved":       { title: "Lembur Disetujui",            body: "Pengajuan lembur Anda telah disetujui." },
  "overtime.rejected":       { title: "Lembur Ditolak",              body: "Pengajuan lembur Anda tidak disetujui." },
  "field_activity.created":  { title: "Aktivitas Luar Kantor Baru",  body: "Ada aktivitas luar kantor yang memerlukan persetujuan Anda." },
  "field_activity.approved": { title: "Aktivitas Disetujui",         body: "Aktivitas luar kantor Anda telah disetujui." },
  "field_activity.rejected": { title: "Aktivitas Ditolak",           body: "Aktivitas luar kantor Anda tidak disetujui." },
  "report.created":          { title: "Laporan Baru Masuk",          body: "Ada laporan staf baru yang perlu ditinjau." },
  "report.closed":           { title: "Laporan Ditutup",             body: "Laporan Anda telah diproses. Buka detail untuk informasi." },
  "finding.created":         { title: "Temuan HR Dicatat",           body: "Temuan HR baru telah dicatat." },
  "rating.task_assigned":    { title: "Tugas Penilaian Baru",        body: "Anda mendapat tugas penilaian baru. Buka tab Rating untuk melihat." },
  "system.test":             { title: "Notifikasi Test",             body: "Ini adalah notifikasi pengujian sistem." },
};

// ─── Inline capability resolver (from Phase 24A) ─────────────────────────────
const VALID_ROLE_CODES = ["hr", "manager", "staff", "staff-basic", "security", "ob"];

function normalizeRoleCode(value) {
  const s = (value || "").toString().toLowerCase().trim();
  return VALID_ROLE_CODES.includes(s) ? s : null;
}

function normalizeAuthModel(user) {
  if (!user) return { accountType: "user", roleCode: "staff-basic", dashboardAccess: false };
  const rawRole = (user.role || user.role_code || "").toString().toLowerCase().trim();
  const accountType = ((user.account_type || (rawRole === "owner" ? "owner" : "user")) || "user").toLowerCase();
  if (accountType === "owner") return { accountType: "owner", roleCode: null, dashboardAccess: true };
  const DASH = ["hr", "manager", "staff"];
  const roleCode = normalizeRoleCode(user.role_code) || normalizeRoleCode(rawRole) || "staff-basic";
  const dashboardAccess = typeof user.dashboard_access === "boolean" ? user.dashboard_access : DASH.includes(roleCode);
  return { accountType: "user", roleCode, dashboardAccess };
}

// ─── Inline recipient resolution (mirrors lib/notifications/recipients.ts) ────
const HR_OWNER_CAPS = new Set([
  "leave.approve", "overtime.approve", "field_activity.approve",
  "report.view_all", "report.review", "report.close",
  "finding.view", "finding.create", "finding.manage",
  "rating.manage", "hr.queue.leave", "hr.queue.overtime",
  "hr.queue.field_activity", "hr.staff.view",
]);

function userHasCapability(user, cap) {
  const auth = normalizeAuthModel(user);
  const isOwner = auth.accountType === "owner";
  const isHr = !isOwner && auth.roleCode === "hr";
  const isHrOrOwner = isOwner || isHr;
  if (HR_OWNER_CAPS.has(cap)) return isHrOrOwner;
  return true; // universal caps
}

function resolveCapabilityHoldersFromList(users, cap) {
  if (!HR_OWNER_CAPS.has(cap)) return [];
  return users.filter((u) => userHasCapability(u, cap)).map((u) => u.id);
}

// ─── Mock notification DB ─────────────────────────────────────────────────────
const notificationDB = [];
let nextId = 1;

function createNotification(input) {
  if (!input.type) throw new Error("type is required");
  if (!input.recipient) throw new Error("recipient is required");
  // Idempotency check
  if (input.idempotency_key) {
    const existing = notificationDB.find((n) => n.idempotency_key === input.idempotency_key);
    if (existing) return existing.id; // duplicate — return existing
  }
  const id = `notif_${nextId++}`;
  notificationDB.push({
    id,
    recipient: input.recipient,
    type: input.type,
    title: input.title,
    body: input.body,
    resource_type: input.resource_type || "",
    resource_id: input.resource_id || "",
    action: input.action || "",
    read_at: null,
    idempotency_key: input.idempotency_key || "",
    created: new Date().toISOString(),
  });
  return id;
}

function getNotificationsForUser(userId) {
  return notificationDB.filter((n) => n.recipient === userId);
}

function markRead(userId, notifId) {
  const n = notificationDB.find((x) => x.id === notifId);
  if (!n) return { ok: false, error: "not found" };
  if (n.recipient !== userId) return { ok: false, error: "403 forbidden" };
  if (n.read_at) return { ok: true, alreadyRead: true };
  n.read_at = new Date().toISOString();
  return { ok: true };
}

// ─── Mock push token DB ───────────────────────────────────────────────────────
const tokenDB = [];

function isValidExpoPushToken(token) {
  return /^Expo(nent)?PushToken\[.+\]$/.test((token || "").trim());
}

function registerToken(userId, token, platform, deviceId) {
  if (!isValidExpoPushToken(token)) return { ok: false, error: "invalid token format" };
  const existingIdx = tokenDB.findIndex(
    (t) => t.user === userId && (deviceId ? t.device_id === deviceId : t.token === token),
  );
  if (existingIdx >= 0) {
    tokenDB[existingIdx] = { ...tokenDB[existingIdx], token, platform, is_active: true, last_seen: new Date().toISOString() };
    return { ok: true, updated: true };
  }
  tokenDB.push({ id: `tok_${tokenDB.length + 1}`, user: userId, token, platform, device_id: deviceId || "", is_active: true, last_seen: new Date().toISOString() });
  return { ok: true, created: true };
}

function getActiveTokensForUser(userId) {
  return tokenDB.filter((t) => t.user === userId && t.is_active && isValidExpoPushToken(t.token));
}

function deactivateToken(tokenId) {
  const t = tokenDB.find((x) => x.id === tokenId);
  if (t) t.is_active = false;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition) {
  if (condition) {
    process.stdout.write("  ✓ " + label + "\n");
    passed++;
  } else {
    process.stdout.write("  ✗ " + label + "\n");
    failed++;
    failures.push(label);
  }
}

function section(title) {
  process.stdout.write("\n── " + title + " ──\n");
}

// ─── Sample user set ─────────────────────────────────────────────────────────
const USERS = [
  { id: "user_owner",   account_type: "owner", role: "owner" },
  { id: "user_hr",      account_type: "user", role_code: "hr" },
  { id: "user_manager", account_type: "user", role_code: "manager" },
  { id: "user_staff",   account_type: "user", role_code: "staff" },
  { id: "user_sb",      account_type: "user", role_code: "staff-basic" },
  { id: "user_sec",     account_type: "user", role_code: "security" },
  { id: "user_ob",      account_type: "user", role_code: "ob" },
];

// ─── TEST 1: Create notification record ───────────────────────────────────────
section("1. Create notification record");
{
  const id = createNotification({
    recipient: "user_staff",
    type: "leave.approved",
    title: NOTIFICATION_SAFE_TEXTS["leave.approved"].title,
    body: NOTIFICATION_SAFE_TEXTS["leave.approved"].body,
    resource_type: "leave_requests",
    resource_id: "req_001",
    action: "/leave",
    idempotency_key: "leave.approved:req_001:user_staff",
  });
  assert("notification created", !!id);
  const notifs = getNotificationsForUser("user_staff");
  assert("recipient can read own notification", notifs.length === 1);
  assert("notification has correct type", notifs[0].type === "leave.approved");
  assert("notification action is plain path (no auth in payload)", notifs[0].action === "/leave");
}

// ─── TEST 2: Recipient resolution — capability mapping ────────────────────────
section("2. Recipient resolution — leave.approve capability");
{
  const approvers = resolveCapabilityHoldersFromList(USERS, "leave.approve");
  assert("owner is a leave approver", approvers.includes("user_owner"));
  assert("hr is a leave approver", approvers.includes("user_hr"));
  assert("manager is NOT a leave approver", !approvers.includes("user_manager"));
  assert("staff is NOT a leave approver", !approvers.includes("user_staff"));
  assert("staff-basic is NOT a leave approver", !approvers.includes("user_sb"));
  assert("security is NOT a leave approver", !approvers.includes("user_sec"));
  assert("ob is NOT a leave approver", !approvers.includes("user_ob"));
  assert("exactly 2 approvers (owner + hr)", approvers.length === 2);
}

// ─── TEST 3: RBAC filtering — all approval caps ───────────────────────────────
section("3. RBAC filtering — all approval capabilities");
{
  const capCases = [
    "leave.approve", "overtime.approve", "field_activity.approve",
    "report.review", "finding.view", "rating.manage",
    "hr.queue.leave", "hr.queue.overtime", "hr.staff.view",
  ];
  for (const cap of capCases) {
    const holders = resolveCapabilityHoldersFromList(USERS, cap);
    assert(`${cap}: owner is holder`, holders.includes("user_owner"));
    assert(`${cap}: hr is holder`, holders.includes("user_hr"));
    assert(`${cap}: non-privileged users NOT holders`, holders.every((id) => id === "user_owner" || id === "user_hr"));
  }
}

// ─── TEST 4: User isolation (User A cannot see User B notifications) ──────────
section("4. User isolation");
{
  createNotification({ recipient: "user_hr", type: "leave.created", title: "T", body: "B", idempotency_key: "" });
  createNotification({ recipient: "user_manager", type: "overtime.created", title: "T2", body: "B2", idempotency_key: "" });

  const hrNotifs = getNotificationsForUser("user_hr");
  const managerNotifs = getNotificationsForUser("user_manager");

  assert("hr sees only hr notifications", hrNotifs.every((n) => n.recipient === "user_hr"));
  assert("manager sees only manager notifications", managerNotifs.every((n) => n.recipient === "user_manager"));
  assert("hr cannot see manager notifications", !hrNotifs.find((n) => n.recipient === "user_manager"));
  assert("manager cannot see hr notifications", !managerNotifs.find((n) => n.recipient === "user_hr"));
}

// ─── TEST 5: Mark-read authorization ─────────────────────────────────────────
section("5. Mark-read authorization");
{
  const notifId = createNotification({ recipient: "user_staff", type: "leave.rejected", title: "X", body: "Y", idempotency_key: "test5" });

  const deny = markRead("user_manager", notifId); // wrong user
  assert("other user cannot mark staff notification read", !deny.ok && deny.error.includes("403"));

  const allow = markRead("user_staff", notifId); // correct user
  assert("owner of notification can mark read", allow.ok);

  const idempotent = markRead("user_staff", notifId); // already read
  assert("marking already-read is idempotent (ok)", idempotent.ok);
}

// ─── TEST 6: Duplicate prevention (idempotency_key) ──────────────────────────
section("6. Duplicate prevention");
{
  const countBefore = notificationDB.length;
  const key = "leave.created:req_dup:user_hr";
  const id1 = createNotification({ recipient: "user_hr", type: "leave.created", title: "T", body: "B", idempotency_key: key });
  const id2 = createNotification({ recipient: "user_hr", type: "leave.created", title: "T", body: "B", idempotency_key: key });
  const countAfter = notificationDB.length;

  assert("same idempotency key returns same record id", id1 === id2);
  assert("no duplicate record created", countAfter === countBefore + 1);
}

// ─── TEST 7: Malformed event (missing type) ───────────────────────────────────
section("7. Malformed event handling");
{
  let threw = false;
  try {
    createNotification({ recipient: "user_staff", type: "", title: "T", body: "B" });
  } catch (e) {
    threw = true;
  }
  assert("empty type throws", threw);

  let threwNoRecipient = false;
  try {
    createNotification({ recipient: "", type: "leave.created", title: "T", body: "B" });
  } catch {
    threwNoRecipient = true;
  }
  assert("empty recipient throws", threwNoRecipient);
}

// ─── TEST 8: Unknown recipient (empty list → no dispatch) ─────────────────────
section("8. Unknown recipient / empty recipient list");
{
  const emptyRecipients = resolveCapabilityHoldersFromList([], "leave.approve");
  assert("no users → no approvers", emptyRecipients.length === 0);

  // Non-HR/Owner cap returns empty
  const nonPriv = resolveCapabilityHoldersFromList(USERS, "attendance.view");
  assert("universal cap returns empty from recipient resolver", nonPriv.length === 0);
}

// ─── TEST 9: Missing capability / unsupported cap ─────────────────────────────
section("9. Missing / unsupported capability");
{
  const none = resolveCapabilityHoldersFromList(USERS, "NONEXISTENT_CAP");
  assert("unknown cap returns empty", none.length === 0);

  const universalCap = resolveCapabilityHoldersFromList(USERS, "attendance.check_in");
  assert("universal cap (non-targeted) returns empty from targeted resolver", universalCap.length === 0);
}

// ─── TEST 10: Multi-device token behavior ────────────────────────────────────
section("10. Multi-device token behavior");
{
  const TOKEN_A = "ExponentPushToken[device_A_token_here]";
  const TOKEN_B = "ExponentPushToken[device_B_token_here]";

  const reg1 = registerToken("user_staff", TOKEN_A, "android", "device_A");
  const reg2 = registerToken("user_staff", TOKEN_B, "android", "device_B");

  assert("device A registered", reg1.ok);
  assert("device B registered", reg2.ok);

  const tokens = getActiveTokensForUser("user_staff");
  assert("user has 2 active tokens", tokens.length === 2);
  assert("both tokens are active", tokens.every((t) => t.is_active));

  // Update existing device A token
  const NEW_TOKEN_A = "ExponentPushToken[device_A_new_token]";
  const upd = registerToken("user_staff", NEW_TOKEN_A, "android", "device_A");
  assert("device A token update is idempotent (no new record)", upd.updated === true);

  const tokensAfter = getActiveTokensForUser("user_staff");
  assert("still 2 tokens after update (no duplication)", tokensAfter.length === 2);
  assert("device A has new token value", tokensAfter.find((t) => t.device_id === "device_A")?.token === NEW_TOKEN_A);
}

// ─── TEST 11: Invalid token handling ─────────────────────────────────────────
section("11. Invalid token handling");
{
  const invalid1 = registerToken("user_hr", "not-a-valid-token", "android", "");
  assert("invalid token rejected", !invalid1.ok && invalid1.error.includes("invalid"));

  const invalid2 = registerToken("user_hr", "", "android", "");
  assert("empty token rejected", !invalid2.ok);

  const invalid3 = registerToken("user_hr", "FCMToken123", "android", ""); // FCM format not Expo
  assert("FCM-style token rejected (not Expo format)", !invalid3.ok);

  const valid = registerToken("user_hr", "ExponentPushToken[valid_hr_token]", "android", "hr_device");
  assert("valid Expo token accepted", valid.ok);

  // Deactivate the token
  const hrTokens = getActiveTokensForUser("user_hr");
  assert("hr has 1 active token", hrTokens.length === 1);
  deactivateToken(hrTokens[0].id);
  const hrTokensAfter = getActiveTokensForUser("user_hr");
  assert("after deactivation, user has 0 active tokens", hrTokensAfter.length === 0);
}

// ─── TEST 12: Privacy-safe notification payload ───────────────────────────────
section("12. Privacy-safe notification payload");
{
  for (const [type, text] of Object.entries(NOTIFICATION_SAFE_TEXTS)) {
    const SENSITIVE_PATTERNS = [
      /\bpassword\b/i,
      /\bsalary\b/i,
      /\bgaji\b/i,
      /\bdiagnos/i,
      /\bpenyakit\b/i,
      /\bpribadi\b/i,
    ];
    const combinedText = `${text.title} ${text.body}`;
    const hasSensitive = SENSITIVE_PATTERNS.some((p) => p.test(combinedText));
    assert(`${type}: no sensitive data in title/body`, !hasSensitive);
  }

  // All notification types have titles and bodies
  for (const [type, text] of Object.entries(NOTIFICATION_SAFE_TEXTS)) {
    assert(`${type}: has non-empty title`, text.title.length > 0);
    assert(`${type}: has non-empty body`, text.body.length > 0);
  }
}

// ─── TEST 13: Deep-link action field ─────────────────────────────────────────
section("13. Deep-link authorization (action field is path only)");
{
  // Action must be a plain path — not contain auth tokens, user IDs, or private data
  const SAFE_ACTIONS = ["/leave", "/overtime", "/reports", "/findings", "/notifications", "/rating", ""];
  const UNSAFE_ACTIONS = [
    "https://evil.com/steal",
    "javascript:alert(1)",
    "/leave?token=secret123",
    "/leave?userId=admin",
  ];

  function isPathSafe(action) {
    if (!action) return true; // empty is ok
    // Must start with / and not contain external URLs
    if (!action.startsWith("/")) return false;
    // Reject query params with identity/auth sensitive keys
    if (/[?&](token|auth|secret|password|key|userId|user_id|uid|id=)=/i.test(action)) return false;
    return true;
  }

  for (const action of SAFE_ACTIONS) {
    assert(`safe action "${action}" passes validation`, isPathSafe(action));
  }
  for (const action of UNSAFE_ACTIONS) {
    assert(`unsafe action "${action}" fails validation`, !isPathSafe(action));
  }

  // Verify notification records in DB don't store sensitive fields
  for (const notif of notificationDB) {
    assert(
      `notif ${notif.id}: action is safe path`,
      isPathSafe(notif.action),
    );
    // Check that auth tokens / passwords are not in payload fields
    const FORBIDDEN_PATTERNS = [/token=/i, /password/i, /auth_key/i];
    const allFields = [notif.title, notif.body, notif.action, notif.resource_id].join(" ");
    const hasForbidden = FORBIDDEN_PATTERNS.some((p) => p.test(allFields));
    assert(`notif ${notif.id}: no auth data in payload`, !hasForbidden);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
process.stdout.write("\n");
process.stdout.write("══════════════════════════════════════════\n");
process.stdout.write("Notification Unit Tests: " + (passed + failed) + " total\n");
process.stdout.write("  PASS: " + passed + "\n");
process.stdout.write("  FAIL: " + failed + "\n");

if (failures.length > 0) {
  process.stdout.write("\nFailed assertions:\n");
  for (const f of failures) process.stdout.write("  ✗ " + f + "\n");
  process.stdout.write("\nStatus: FAIL\n");
  process.exit(1);
} else {
  process.stdout.write("\nStatus: PASS\n");
  process.exit(0);
}
