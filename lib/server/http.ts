import "server-only";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type FetchOpts = RequestInit & { timeoutMs?: number; retries?: number; label?: string };

/**
 * fetch with timeout, exponential backoff (+ jitter) and Retry-After support.
 * Retries on network errors, 429 and 5xx. Never logs headers (may hold keys).
 */
export async function fetchRetry(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { timeoutMs = 20_000, retries = 2, label = new URL(url).host, ...init } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
      if (res.status === 429 || res.status >= 500) {
        const ra = res.headers.get("retry-after");
        const raMs = ra ? (Number.isFinite(Number(ra)) ? Number(ra) * 1000 : Date.parse(ra) - Date.now()) : undefined;
        lastErr = new HttpError(res.status, `${label} responded ${res.status}`, raMs);
        if (attempt < retries && (raMs ?? 0) < 30_000) {
          await sleep(Math.max(raMs ?? 0, 2 ** attempt * 800 + Math.random() * 300));
          continue;
        }
        throw lastErr;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError) throw e;
      if (attempt < retries) {
        await sleep(2 ** attempt * 800 + Math.random() * 300);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`${label}: ${msg.includes("abort") ? "timed out" : msg}`);
}
