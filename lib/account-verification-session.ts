/**
 * Client session rules for account verification (payslip + personal documents).
 * - Hard grant TTL is enforced server-side (15m JWT).
 * - Idle 15m without interaction → revoke early.
 * - Away from all sensitive modules for 15m → revoke on re-entry.
 */

export const ACCOUNT_VERIFICATION_WINDOW_MS = 15 * 60 * 1000;
export const ACCOUNT_VERIFICATION_WINDOW_MINUTES = 15;

export type SensitiveVerificationModule = "payslip" | "documents";

const LEFT_AT_KEY = "serba_av_left_at";
const ACTIVE_MODULES_KEY = "serba_av_active_modules";

function readActiveModules(): Set<SensitiveVerificationModule> {
  try {
    const raw = sessionStorage.getItem(ACTIVE_MODULES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((x): x is SensitiveVerificationModule => x === "payslip" || x === "documents"),
    );
  } catch {
    return new Set();
  }
}

function writeActiveModules(mods: Set<SensitiveVerificationModule>) {
  try {
    sessionStorage.setItem(ACTIVE_MODULES_KEY, JSON.stringify([...mods]));
  } catch {
    /* ignore */
  }
}

/** Enter a sensitive module. Returns true if grant should be revoked (away ≥ 15m). */
export function enterSensitiveVerificationModule(module: SensitiveVerificationModule): boolean {
  if (typeof window === "undefined") return false;
  const mods = readActiveModules();
  const wasEmpty = mods.size === 0;
  mods.add(module);
  writeActiveModules(mods);

  if (!wasEmpty) return false;

  try {
    const leftRaw = sessionStorage.getItem(LEFT_AT_KEY);
    sessionStorage.removeItem(LEFT_AT_KEY);
    if (!leftRaw) return false;
    const leftAt = Number(leftRaw);
    if (!Number.isFinite(leftAt)) return false;
    return Date.now() - leftAt >= ACCOUNT_VERIFICATION_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Leave a sensitive module; starts away clock when none remain. */
export function leaveSensitiveVerificationModule(module: SensitiveVerificationModule): void {
  if (typeof window === "undefined") return;
  const mods = readActiveModules();
  mods.delete(module);
  writeActiveModules(mods);
  if (mods.size === 0) {
    try {
      sessionStorage.setItem(LEFT_AT_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }
}

export function clearSensitiveVerificationAwayState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LEFT_AT_KEY);
    sessionStorage.removeItem(ACTIVE_MODULES_KEY);
  } catch {
    /* ignore */
  }
}
