// Fetch wrapper: access token in memory, refresh token in an httpOnly cookie,
// organization chosen with the X-Organization header.

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const ORG_KEY = "dhara:org";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

export function getOrgId(): string | null {
  try {
    return localStorage.getItem(ORG_KEY);
  } catch {
    return null;
  }
}
export function setOrgId(id: number | string | null) {
  try {
    if (id == null) localStorage.removeItem(ORG_KEY);
    else localStorage.setItem(ORG_KEY, String(id));
  } catch {
    /* storage unavailable */
  }
}

export async function refreshAccess(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) return false;
        const data = await r.json();
        accessToken = data.access;
        return true;
      })
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; org?: boolean };

export async function api<T = any>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const headers = new Headers(opts.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const orgId = getOrgId();
  if (opts.org !== false && orgId) headers.set("X-Organization", orgId);
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api/v1${path}`, { ...opts, headers, body, credentials: "same-origin" });
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshAccess()) return api<T>(path, opts, true);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data.message || `Request failed (${res.status})`);
  return data as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const patch = <T = any>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const del = <T = any>(path: string) => api<T>(path, { method: "DELETE" });
