import { useWorkspace } from "./workspace";
// Account-managed AI for web and desktop. Desktop credentials stay in Rust.
import { invoke } from "@tauri-apps/api/core";
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
  user: { id: string; email: string; name: string | null; firstName?: string | null; lastName?: string | null };
  plan: "free" | "pro" | "org";
  planName: string;
  interval?: string | null;
  status?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  billing?: {canManage:boolean;currency:string;proMonthly:number;proYearly:number|null;proActions:number};
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
    if (isTauri()) {
      const result = await invoke<{status:string;profile?:CloudMe}>("desktop_account", {action:"status"});
      return result.status === "signed_in" ? result.profile ?? null : null;
    }
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
  if (isTauri()) {
    const result = await invoke<{status:number;body:T & {error?:string;code?:"auth"|"quota"}}>("desktop_ai", {body});
    if (result.status >= 400) throw new CloudError(result.body.error ?? "Harfsaz AI is unavailable.", result.status, result.body.code);
    return result.body;
  }
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

/** Open account pages in the desktop browser, using the configured server. */
export async function openAccountPage(page: "account" | "pricing" = "account") {
  if (isTauri()) await invoke("desktop_account", {action:page === "pricing" ? "pricing" : "manage"});
  else if (page === "pricing") useWorkspace.getState().setSection("billing");
  else window.open(siteUrl(`/${page}`), "_blank", "noopener");
}
