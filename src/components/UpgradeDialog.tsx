import * as Dialog from "@radix-ui/react-dialog";
import { XMark, Sparkles, CheckAll } from "./ui/icons";
import { useUi } from "../lib/ui";
import { useUsage, FREE_DAILY_TOKENS } from "../lib/usage";

/** Paywall / upgrade modal. Free tier has a daily token cap; Pro removes it.
 *  Billing is a placeholder for now ("coming soon") — the gate + UX are real. */
export function UpgradeDialog() {
  const open = useUi((s) => s.upgradeOpen);
  const setOpen = useUi((s) => s.setUpgradeOpen);
  const plan = useUsage((s) => s.plan);
  const setPlan = useUsage((s) => s.setPlan);
  const remaining = useUsage((s) => s.remaining());

  const tiers = [
    {
      name: "Free",
      price: "$0",
      cadence: "forever",
      highlight: plan === "free",
      features: [
        `${FREE_DAILY_TOKENS.toLocaleString()} AI tokens / day`,
        "All editing & fonts",
        "Proofread, translate, write",
        "Resets daily",
      ],
      cta: plan === "free" ? "Current plan" : "Downgrade",
      ctaDisabled: plan === "free",
      onClick: () => setPlan("free"),
    },
    {
      name: "Pro",
      price: "$9",
      cadence: "/ month",
      highlight: true,
      features: [
        "Unlimited AI tokens",
        "Priority (Claude) model",
        "Everything in Free",
        "Cancel anytime",
      ],
      cta: "Upgrade (coming soon)",
      ctaDisabled: true,
      onClick: () => {},
    },
  ];

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
                <Sparkles size={18} /> Upgrade Harfsaz AI
              </Dialog.Title>
              <p className="mt-1 text-sm text-ink-soft">
                {remaining <= 0
                  ? "You've used today's free AI tokens. Upgrade for unlimited."
                  : `${remaining.toLocaleString()} free tokens left today.`}
              </p>
            </div>
            <Dialog.Close className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
              <XMark size={18} />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-4 p-6">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`flex flex-col rounded-xl border p-5 ${
                  t.highlight ? "border-accent bg-paper" : "border-line"
                }`}
              >
                <div className="flex items-baseline gap-1">
                  <span className="text-base font-semibold">{t.name}</span>
                </div>
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
                <button
                  disabled={t.ctaDisabled}
                  onClick={t.onClick}
                  className={`mt-5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    t.highlight
                      ? "bg-accent text-white hover:bg-accent-deep disabled:opacity-60"
                      : "border border-line text-ink hover:bg-paper-edge disabled:opacity-50"
                  }`}
                >
                  {t.cta}
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-line px-6 py-3 text-center text-xs text-ink-soft">
            Billing isn't live yet — this is a preview of the plans. Your daily free
            quota resets at midnight.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
