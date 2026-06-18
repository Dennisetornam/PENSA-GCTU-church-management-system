// Same-origin API client. Auth rides on the __Host-at cookie (credentials).
// On a 401 it transparently refreshes the access token via the rotating
// __Secure-rt cookie and retries once, so sessions survive past the 15-min
// access-token lifetime (up to the 30-day refresh window).
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch("/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });

  // Transparent refresh-and-retry on an expired access token.
  if (res.status === 401 && !retried && !path.startsWith("/auth/")) {
    if (await refreshSession()) return request<T>(path, init, true);
  }

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Multipart upload (no JSON content-type) with the same refresh-and-retry behaviour.
async function uploadRequest<T>(path: string, form: FormData, retried = false): Promise<T> {
  const res = await fetch(path, { method: "POST", credentials: "include", body: form });
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return uploadRequest<T>(path, form, true);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : "{}" }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : "{}" }),
  upload: <T>(path: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadRequest<T>(path, fd);
  },
};

// Every query whose data is derived from finance entries/expenses. Invalidate
// them together after ANY finance mutation so the Quota section (and the
// coffers + analytics figures) react immediately to the change.
export const FINANCE_QUERY_KEYS = ["finance-summary", "finance-list", "finance-expenses", "quota", "coffers", "a-finance"] as const;

export function invalidateFinance(qc: { invalidateQueries: (f: { queryKey: unknown[] }) => unknown }) {
  for (const key of FINANCE_QUERY_KEYS) qc.invalidateQueries({ queryKey: [key] });
}
