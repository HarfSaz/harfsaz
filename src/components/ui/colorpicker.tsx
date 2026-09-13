import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown } from "./icons";
import { cn } from "../../lib/utils";
import { normalizeHex } from "../../lib/colors";

const COLORS = [
  ["Ink", "#262722"], ["White", "#ffffff"], ["Gray", "#6b7280"], ["Silver", "#cbd5e1"],
  ["Red", "#c0392b"], ["Orange", "#d97706"], ["Gold", "#c99a2e"], ["Bronze", "#87633e"],
  ["Green", "#15803d"], ["Teal", "#0f766e"], ["Blue", "#2563eb"], ["Navy", "#1e3a5f"],
  ["Purple", "#7e22ce"], ["Rose", "#be185d"], ["Blush", "#fecdd3"], ["Ivory", "#f8f7f3"],
] as const;

/** Labeled color control with palette, native custom picker, and exact hex input. */
export function ColorButton({ value, onChange, title, disabled, className, allowTransparent = false, onOpen }: {
  value: string; onChange: (value: string) => void; title: string; disabled?: boolean;
  className?: string; allowTransparent?: boolean; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const pending = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const color = normalizeHex(draft);
  const valid = color !== null || (allowTransparent && draft === "transparent");
  const transparent = value === "transparent";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (next) { pending.current = null; setDraft(value); onOpen?.(); }
      setOpen(next);
    }}>
      <Dialog.Trigger asChild>
        <button ref={trigger} type="button" disabled={disabled} aria-label={title}
          className={cn("color-trigger inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs text-ink", className)}>
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-sm border border-ink-soft/40"
            style={{ background: transparent ? "repeating-linear-gradient(135deg,#fff 0 4px,#d1d5db 4px 8px)" : value }} />
          <span>{title}</span><ChevronDown size={12} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/15" />
        <Dialog.Content dir="ltr" className="fixed left-1/2 top-1/2 z-[70] w-[min(320px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-harfsaz"
          onCloseAutoFocus={(event) => {
            if (pending.current === null) return;
            event.preventDefault();
            const chosen = pending.current; pending.current = null;
            trigger.current?.focus();
            onChange(chosen);
          }}>
          <Dialog.Title className="text-sm font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-ink-soft">Choose a swatch or enter a custom color.</Dialog.Description>
          <div className="my-4 grid grid-cols-8 gap-2" role="group" aria-label="Color palette">
            {COLORS.map(([name, hex]) => (
              <button key={hex} type="button" aria-label={`${name} ${hex}`} aria-pressed={color === hex}
                title={name} onClick={() => setDraft(hex)}
                className="flex h-7 w-7 items-center justify-center rounded border border-ink-soft/40 p-0 text-xs"
                style={{ backgroundColor: hex }}>
                {color === hex && <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">✓</span>}
              </button>
            ))}
          </div>
          {allowTransparent && <button type="button" aria-pressed={draft === "transparent"}
            className="mb-4 w-full rounded-md border border-line py-1.5 text-xs" onClick={() => setDraft("transparent")}>No fill {draft === "transparent" ? "✓" : ""}</button>}
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-ink-soft">Custom
              <input type="color" aria-label={`Custom ${title.toLowerCase()}`} value={color ?? "#ffffff"}
                onChange={(e) => setDraft(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line bg-surface p-1" />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-soft">Hex color
              <input value={draft} aria-invalid={!valid} spellCheck={false}
                onChange={(e) => setDraft(e.target.value)} placeholder="#87633e"
                className="h-9 w-full rounded-md border border-line px-2 font-mono text-xs text-ink" />
            </label>
          </div>
          {!valid && <p role="status" className="mt-2 text-xs text-danger">Enter a valid color, such as #87633e.</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild><button type="button" className="rounded-md px-3 py-1.5 text-xs">Cancel</button></Dialog.Close>
            <button type="button" disabled={!valid} className="rounded-md bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-45"
              onClick={() => { pending.current = color ?? "transparent"; setOpen(false); }}>Apply color</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
