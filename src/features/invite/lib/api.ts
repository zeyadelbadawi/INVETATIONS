// Thin wrappers over the guest API. Mutations are same-origin JSON POSTs, which
// is what the server requires (security rule 4).

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: string; data: Record<string, unknown> };

async function read<T>(response: Response): Promise<ApiResult<T>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok) return { ok: true, status: response.status, data: body as T };
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return { ok: false, status: response.status, error: typeof data.error === "string" ? data.error : "error", data };
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<ApiResult<T>> {
  try {
    return await read<T>(await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, signal }));
  } catch {
    return { ok: false, status: 0, error: "network", data: {} };
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    return await read<T>(
      await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      }),
    );
  } catch {
    return { ok: false, status: 0, error: "network", data: {} };
  }
}

export const guestPath = (slug: string, action: "me" | "session" | "join" | "rsvp" | "reveal") => `/api/guest/${encodeURIComponent(slug)}/${action}`;
export const livePath = (slug: string) => `/api/live/${encodeURIComponent(slug)}`;
