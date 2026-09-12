// Harfsaz cloud: the hosted account + AI API used by the web editor.
//
// The web editor is served by the same origin as the API (harfsaz.com/app), so
// the session cookie authenticates every call and no token is handled here.
// The desktop app keeps its own key locally and does not use this module for
// AI; it only uses `siteUrl()` to link to pricing and sign-in pages.
import { isTauri } from "./tauri";

/** Public site origin for links (the desktop app has no same-origin site). */
export function siteUrl(path = ""): string {
  const base = (import.meta.env.VITE_HARFSAZ_SITE as string | undefined) ?? (isTauri() ? "https://harfsaz.com" : "");
  return `${base.replace(/\/$/, "")}${path}`;
}

/** Where the web editor should send the user to sign in (and come back). */
export function loginUrl(): string {
  return siteUrl("/login?next=/app");
}

export interface CloudMe {
  user: { id: string; email: string; name: string | null };
  plan: "free" | "pro" | "org";
  planName: string;
  quota: { window: "day" | "month"; actions: number; used: number; remaining: number; resetsAt: string };
}

export class CloudError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: "auth" | "quota"
  ) {
    super(message);
  }
}

/** Who is signed in (null when anonymous or offline). */
export async function cloudMe(): Promise<CloudMe | null> {
  try {
    const r = await fetch(siteUrl("/api/v1/me"), { credentials: "include", cache: "no-store" });
    if (r.status === 401) return null;
    if (!r.ok) return null;
    return (await r.json()) as CloudMe;
  } catch {
    return null;
  }
}

/** POST one AI operation to the hosted proxy; response shapes match the Rust commands. */
export async function cloudAi<T>(body: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch(siteUrl("/api/v1/ai"), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CloudError("Could not reach Harfsaz AI — check your connection.", 0);
  }
  const j = (await r.json().catch(() => ({}))) as { error?: string; code?: "auth" | "quota" } & T;
  if (!r.ok) {
    const code = j.code ?? (r.status === 401 ? "auth" : r.status === 402 ? "quota" : undefined);
    throw new CloudError(j.error ?? `AI request failed (${r.status}).`, r.status, code);
  }
  return j as T;
}
