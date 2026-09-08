/**
 * HTTP client for staging PocketBase through SSH local-forward tunnels.
 *
 * Node's built-in `fetch` (undici) often hits `ECONNRESET` on keep-alive
 * connections over `ssh -L` to PocketBase. This helper uses Node `http`/`https`
 * with keepAlive disabled and optional retries — same pattern as curl -N style
 * short-lived requests.
 *
 * Never logs secrets. Staging URL must still be asserted by staging-guard.
 */
import http from "http";
import https from "https";
import { URL } from "url";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} method
 * @param {string} url
 * @param {{ headers?: Record<string,string>, body?: string|null, timeoutMs?: number, retries?: number, label?: string }} [opts]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, text: string, json: any }>}
 */
export async function stagingRequest(method, url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const retries = opts.retries ?? 3;
  const label = opts.label || `${method} ${url}`;
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await once(method, url, opts, timeoutMs);
      return result;
    } catch (err) {
      lastErr = err;
      const code = err?.code || err?.cause?.code || "";
      const retriable = ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN"].includes(
        code,
      );
      console.warn(
        `[staging-http] ${label} attempt ${attempt}/${retries} failed: ${code || err.message}`,
      );
      if (!retriable || attempt === retries) break;
      await sleep(250 * attempt);
    }
  }
  throw lastErr;
}

function once(method, url, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }

    const isHttps = u.protocol === "https:";
    const lib = isHttps ? https : http;
    const body = opts.body != null ? String(opts.body) : null;
    const headers = {
      Connection: "close",
      Accept: "application/json",
      ...(opts.headers || {}),
    };
    if (body != null) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        timeout: timeoutMs,
        agent: false, // no keep-alive pool
        family: 4, // force IPv4 — avoids ::1 quirks with some tunnels
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            json = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, text, json });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(Object.assign(new Error("Request timeout"), { code: "ETIMEDOUT" }));
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

/** Convenience JSON helpers */
export async function stagingJson(method, url, { token, body, label, retries } = {}) {
  const headers = {};
  if (token) headers.Authorization = token;
  const payload = body != null ? JSON.stringify(body) : null;
  return stagingRequest(method, url, {
    headers,
    body: payload,
    label,
    retries,
  });
}
