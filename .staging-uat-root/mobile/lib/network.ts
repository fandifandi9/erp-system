/**
 * Fetch dengan retry ringkas untuk API ERP (Next) dari mobile.
 * Hindari loop panjang — max 3 percobaan, backoff eksponensial singkat.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|failed|abort/i.test(msg);
}

/** Error jaringan / timeout / PB status 0 — cocok untuk enqueue offline. */
export function isRetriableTransportError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (/network|fetch|Failed to fetch|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|aborted/i.test(msg))
    return true;
  if (
    err &&
    typeof err === "object" &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number" &&
    (err as { status: number }).status === 0
  ) {
    return true;
  }
  return false;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts?: { retries?: number; baseDelayMs?: number }
): Promise<Response> {
  const max = opts?.retries ?? 3;
  const base = opts?.baseDelayMs ?? 400;
  let lastErr: unknown;

  for (let attempt = 0; attempt < max; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      if (!isRetryableStatus(res.status) || attempt === max - 1) return res;
      await sleep(base * Math.pow(2, attempt));
    } catch (e) {
      lastErr = e;
      if (!isRetryableError(e) || attempt === max - 1) throw e;
      await sleep(base * Math.pow(2, attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry failed");
}
