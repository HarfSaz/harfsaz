import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { XMark, CheckAll } from "./ui/icons";
import { Select } from "./ui/select";
import { useUi } from "../lib/ui";
import { useUsage } from "../lib/usage";
import { getAiSettings, setAiSettings, aiKeyPresent } from "../lib/tauri";

const PROVIDERS = [
  { value: "", label: "Claude (default / env)" },
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "deepseek", label: "DeepSeek (cheap)" },
  { value: "mistral", label: "Mistral" },
  { value: "openai", label: "OpenAI" },
  { value: "claude-cli", label: "Claude CLI (dev only)" },
];

/** AI provider + key settings, stored locally (not in source). Saving a key
 *  also unlocks the paywall as "bring-your-own-key" (uncapped usage). */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const setPlan = useUsage((s) => s.setPlan);

  const [provider, setProvider] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    getAiSettings().then((s) => {
      setProvider(s.provider);
      setModel(s.model);
      setHasKey(s.has_key);
      setApiKey(""); // never prefill the key (we don't read it back)
    });
  }, [open]);

  const needsKey = provider !== "claude-cli";

  async function save(asByok: boolean) {
    setBusy(true);
    try {
      // Empty key field → Rust preserves the existing saved key.
      await setAiSettings(provider, apiKey.trim(), model.trim());
      const present = await aiKeyPresent();
      setHasKey(present);
      setApiKey("");
      if (asByok && present) setPlan("byok"); // uncap the paywall
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 animate-in fade-in-0" />
        <Dialog.Content
          dir="ltr"
          className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface shadow-qalam animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <Dialog.Title className="text-base font-semibold">AI Settings</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
              <XMark size={18} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-4 px-5 py-5">
            <Field label="Provider">
              <Select value={provider} onChange={setProvider} options={PROVIDERS} className="w-full" />
            </Field>

            {needsKey && (
              <Field label={`API key${hasKey ? " (saved — leave blank to keep)" : ""}`}>
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={hasKey ? "•••••••••• (saved)" : "Paste your key…"}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </Field>
            )}

            <Field label="Model (optional override)">
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. deepseek-chat, claude-opus-4-8"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none"
              />
            </Field>

            <p className="rounded-md bg-paper-edge px-3 py-2 text-xs text-ink-soft">
              Your key is stored locally on this machine (not in the app source).
              Saving a key with “Use my key” removes the daily free limit (bring-your-own-key).
            </p>

            {saved && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-accent-deep">
                <CheckAll size={14} /> Saved — takes effect immediately.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Dialog.Close className="rounded-md border border-line px-4 py-1.5 text-sm hover:bg-paper-edge">
              Close
            </Dialog.Close>
            <button
              onClick={() => save(false)}
              disabled={busy}
              className="rounded-md border border-line px-4 py-1.5 text-sm hover:bg-paper-edge disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => save(true)}
              disabled={busy}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-deep disabled:opacity-50"
            >
              Use my key (unlimited)
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
