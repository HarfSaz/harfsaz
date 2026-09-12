import * as Dialog from "@radix-ui/react-dialog";
import { XMark, Sparkles, CheckAll } from "./ui/icons";
import { useUi } from "../lib/ui";
import { useUsage, FREE_DAILY_TOKENS } from "../lib/usage";
import { isTauri } from "../lib/tauri";
import { loginUrl, siteUrl } from "../lib/cloud";

/**
 * Paywall / upgrade modal. Prices and quotas mirror web/src/lib/plans.ts.
 *
 * Web editor: the buttons go to the site's pricing page (same account, Stripe
 * Checkout there). Desktop: the app cannot open a checkout itself yet, so it
 * shows the address; the free path there is "use your own key" in Settings.
 */
export function UpgradeDialog() {
  const open = useUi((s) => s.upgradeOpen);
  const setOpen = useUi((s) => s.setUpgradeOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const plan = useUsage((s) => s.plan);
  const cloud = useUsage((s) => s.cloud);
  const remaining = useUsage((s) => s.remaining());
  const web = !isTauri();
  const signedIn = web && !!cloud?.signedIn;
  const onPro = web ? cloud?.plan === "pro" || cloud?.plan === "org" : plan === "pro";

  const tiers = [
    {
      name: "Free",
      price: "$0",
      cadence: "forever",
      highlight: !onPro,
      features: web
        ? ["20 hosted AI actions / day", "The whole editor — nothing locked", "Proofread, translate, write, OCR", "Resets daily"]
        : [`${FREE_DAILY_TOKENS.toLocaleString()} AI tokens / day`, "All editing & fonts", "Proofread, translate, write", "Or your own API key: unlimited"],
      cta: onPro ? "Included" : "Current plan",
    },
    {
      name: "Pro",
      price: "$12",
      cadence: "/ month · $99 / year",
      highlight: true,
      features: ["600 AI actions / month", "Best model tier", "Handwriting & scan OCR", "Web editor on any computer", "Cancel anytime"],
      cta: onPro ? "Current plan" : "Upgrade to Pro",
    },
  ];

  const subtitle = web
    ? !signedIn
      ? "Sign in to use hosted AI — free, no card needed."
      : remaining <= 0
        ? `You've used this ${cloud?.window === "month" ? "month" : "day"}'s AI actions.`
        : `${remaining.toLocaleString()} AI actions left ${cloud?.window === "month" ? "this month" : "today"}.`
    : remaining <= 0
      ? "You've used today's free AI tokens."
      : `${remaining.toLocaleString()} free tokens left today.`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 animate-in fade-in-0" />
        <Dialog.Content
          dir="ltr"
          className="fixed left-1/2 top-1/2 z-50 w-[640px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface shadow-harfsaz animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-start justify-between border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-lg font-semibold">
                <Sparkles size={18} /> Harfsaz AI plans
              </Dialog.Title>
              <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
            </div>
            <Dialog.Close className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
              <XMark size={18} />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-4 p-6">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`flex flex-col rounded-xl border p-5 ${t.highlight ? "border-accent bg-paper" : "border-line"}`}
              >
                <span className="text-base font-semibold">{t.name}</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-ink">{t.price}</span>
                  <span className="text-sm text-ink-soft">{t.cadence}</span>
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-ink">
                      <CheckAll size={14} /> {f}
                    </li>
                  ))}
                </ul>
                {t.name === "Pro" && !onPro ? (
                  web ? (
                    <a
                      href={signedIn ? siteUrl("/pricing") : loginUrl()}
                      target="_blank"
                      rel="noopener"
                      className="mt-5 rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-deep"
                    >
                      {signedIn ? "Upgrade to Pro" : "Sign in to start"}
                    </a>
                  ) : (
                    <div className="mt-5 rounded-lg border border-accent/50 bg-accent/5 px-3 py-2 text-center text-xs text-ink-soft">
                      Subscribe at <span className="font-semibold text-accent-deep">harfsaz.com/pricing</span>
                      <br />
                      or{" "}
                      <button className="underline" onClick={() => { setOpen(false); setSettingsOpen(true); }}>
                        use your own API key
                      </button>{" "}
                      — free, unlimited
                    </div>
                  )
                ) : (
                  <button disabled className="mt-5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink opacity-60">
                    {t.cta}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-line px-6 py-3 text-center text-xs text-ink-soft">
            The editor is free and open source. Plans only cover hosted AI; your documents never leave your computer.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
