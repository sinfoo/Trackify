// Typed same-origin fetch client. Next rewrites /api/v1/* to the FastAPI backend; auth lives in httpOnly cookies.

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Turn any non-OK response body into an ApiError. Accepts the contract envelope, FastAPI `detail`, or plain text. */
export function parseApiError(status: number, body: unknown): ApiError {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const err = b.error as Record<string, unknown> | undefined;
    if (err && typeof err === "object") {
      return new ApiError(
        status,
        typeof err.code === "string" ? err.code : `HTTP_${status}`,
        typeof err.message === "string" ? err.message : "Request failed",
        (err.details as Record<string, unknown>) ?? {},
      );
    }
    if ("detail" in b) {
      const msg = typeof b.detail === "string" ? b.detail : "Validation failed";
      return new ApiError(status, status === 422 ? "VALIDATION_ERROR" : `HTTP_${status}`, msg, { detail: b.detail });
    }
  }
  if (typeof body === "string" && body.trim()) return new ApiError(status, `HTTP_${status}`, body.slice(0, 300));
  return new ApiError(status, `HTTP_${status}`, status >= 500 ? "Server error. Try again." : "Request failed");
}

// Endpoints where a 401 is a normal answer (bad credentials, anonymous visitor), not an expired session.
const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/register", "/auth/forgot-password", "/auth/reset-password", "/public/"];

let refreshing: Promise<boolean> | null = null;
function refreshOnce(): Promise<boolean> {
  // Share one refresh between concurrent 401s; the refresh token rotates, so a second call would fail.
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname.startsWith("/login")) return;
  // Called outside React (fetch layer), so no router is available; a full navigation also drops stale cache.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(pathname + search)}`);
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip refresh + login redirect on 401 (e.g. probing /auth/me on a public page). */
  noAuthRedirect?: boolean;
}

export function buildUrl(path: string, query?: Query) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    signal: opts.signal,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
  const url = buildUrl(path, opts.query);
  let res = await fetch(url, init);

  const canRefresh = !opts.noAuthRedirect && !NO_REFRESH.some((p) => path.startsWith(p));
  if (res.status === 401 && canRefresh) {
    if (await refreshOnce()) res = await fetch(url, init);
    if (res.status === 401) {
      redirectToLogin();
    }
  }

  const data = await readBody(res);
  if (!res.ok) throw parseApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body ?? {}, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body ?? {}, opts),
  del: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts),
};

/** Fresh Idempotency-Key for payment calls. Generate once per user intent, reuse on retry. */
export const newIdempotencyKey = () => crypto.randomUUID();
