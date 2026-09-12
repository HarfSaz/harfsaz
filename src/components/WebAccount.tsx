import { useEffect } from "react";
import { isTauri } from "../lib/tauri";
import { loginUrl, siteUrl } from "../lib/cloud";
import { useUsage } from "../lib/usage";

/**
 * Account badge for the web editor: who is signed in, their plan, and links to
 * the account page and the desktop download. Renders nothing in the desktop app.
 *
 * Sign-in opens in a new tab so an unsaved document in this tab survives; the
 * badge re-checks the session whenever this tab regains focus.
 */
export function WebAccount() {
  const cloud = useUsage((s) => s.cloud);
  const syncCloud = useUsage((s) => s.syncCloud);

  useEffect(() => {
    if (isTauri()) return;
    syncCloud();
    const onFocus = () => syncCloud();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncCloud]);

  if (isTauri()) return null;

  return (
    <span className="mr-2 flex items-center gap-2 text-xs">
      <a
        href={siteUrl("/download")}
        target="_blank"
        rel="noopener"
        className="hidden rounded-md px-2 py-1 text-ink-soft hover:bg-paper-edge hover:text-ink lg:inline"
        title="The desktop app adds print-grade vector PDF, InPage import and printing"
      >
        Get the desktop app
      </a>
      {cloud?.signedIn ? (
        <a
          href={siteUrl("/account")}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-ink hover:border-accent"
          title={cloud.email ?? undefined}
        >
          <span className="max-w-[140px] truncate">{cloud.email}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${cloud.plan === "free" ? "bg-paper-edge text-ink-soft" : "bg-accent text-white"}`}>
            {cloud.plan}
          </span>
        </a>
      ) : (
        <a href={loginUrl()} target="_blank" rel="noopener" className="rounded-md border border-accent px-2.5 py-1 font-medium text-accent-deep hover:bg-accent/10">
          Sign in
        </a>
      )}
    </span>
  );
}
