import { useWorkspace } from "../lib/workspace";
import * as Dialog from "@radix-ui/react-dialog";
import { XMark, Sparkles, CheckAll } from "./ui/icons";
import { useUi } from "../lib/ui";
import { useUsage } from "../lib/usage";
import { isTauri } from "../lib/tauri";
import { loginUrl, openAccountPage } from "../lib/cloud";

export function UpgradeDialog() {
  const open = useUi((s) => s.upgradeOpen);
  const setOpen = useUi((s) => s.setUpgradeOpen);
  const cloud = useUsage((s) => s.cloud);
  const remaining = useUsage((s) => s.remaining());
  const web = !isTauri();
  const signedIn = !!cloud?.signedIn;
  const onPro = cloud?.plan === "pro" || cloud?.plan === "org";

  const tiers = [
    {
      name: "Free",
      price: "$0",
      cadence: "forever",
      highlight: !onPro,
      features: ["20 AI actions / day", "All editing tools and fonts", "Proofread, translate, write, OCR", "No provider key needed"],
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

  const subtitle = !signedIn ? "Sign in to use Harfsaz AI — free, no card needed."
    : `${remaining.toLocaleString()} AI actions left ${cloud?.window === "month" ? "this month" : "today"}.`;

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
              <Dialog.Description className="mt-1 text-sm text-ink-soft">{subtitle}</Dialog.Description>
            </div>
            <Dialog.Close aria-label="Close plans" className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
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
                  <button className="mt-5 rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white hover:bg-accent-deep"
                    onClick={() => { if (!signedIn && web) window.open(loginUrl(), "_blank", "noopener"); else { setOpen(false); if(isTauri()) useWorkspace.getState().setSection("billing"); else void openAccountPage("pricing"); } }}>
                    {signedIn ? "Upgrade to Pro" : "Sign in to start"}
                  </button>
                ) : (
                  <button disabled className="mt-5 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink opacity-60">
                    {t.cta}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-line px-6 py-3 text-center text-xs text-ink-soft">
            Plans cover Harfsaz AI on desktop and web. Text and scans you submit to AI are sent securely for processing.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
