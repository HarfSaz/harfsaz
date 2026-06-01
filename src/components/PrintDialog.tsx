import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { XMark, Export } from "./ui/icons";
import { useDoc } from "../lib/store";
import { useUi } from "../lib/ui";
import { Select } from "./ui/select";
import { listPrinters, printFile, isTauri, PrinterInfo } from "../lib/tauri";
import { renderPagesToPdfFile } from "../lib/pdf";

// Page presets in px @96dpi (portrait). Orientation swaps W/H.
const PAGE_SIZES: Record<string, { w: number; h: number; label: string }> = {
  a4: { w: 794, h: 1123, label: "A4 (210 × 297 mm)" },
  letter: { w: 816, h: 1056, label: "Letter (8.5 × 11 in)" },
  legal: { w: 816, h: 1344, label: "Legal (8.5 × 14 in)" },
  a3: { w: 1123, h: 1587, label: "A3 (297 × 420 mm)" },
  a5: { w: 559, h: 794, label: "A5 (148 × 210 mm)" },
};

/**
 * Print / Document setup dialog. Lets the user choose page size, orientation,
 * margins, copies, range, and color mode, then opens the OS print dialog (where
 * the actual printer is selected). Also drives the on-canvas print preview.
 */
export function PrintDialog() {
  const open = useUi((s) => s.printOpen);
  const setOpen = useUi((s) => s.setPrintOpen);
  const pages = useDoc((s) => s.pages);

  const [size, setSize] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [margin, setMargin] = useState(40);
  const [copies, setCopies] = useState(1);
  const [rangeMode, setRangeMode] = useState<"all" | "custom">("all");
  const [range, setRange] = useState("");
  const [color, setColor] = useState<"color" | "grayscale">("color");
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printer, setPrinter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Load system printers when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatus(null);
    listPrinters()
      .then((list) => {
        setPrinters(list);
        const def = list.find((p) => p.is_default) ?? list[0];
        if (def) setPrinter(def.name);
      })
      .catch((e) => setError(String(e)));
  }, [open]);

  const preset = PAGE_SIZES[size];
  const dims =
    orientation === "portrait"
      ? { w: preset.w, h: preset.h }
      : { w: preset.h, h: preset.w };

  async function handlePrint() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!isTauri()) {
        // Browser fallback: native print dialog.
        window.print();
        return;
      }
      setStatus("Rendering document…");
      const filePath = await renderPagesToPdfFile({
        pageWidthPx: dims.w,
        pageHeightPx: dims.h,
        orientation,
      });
      setStatus("Sending to printer…");
      const job = await printFile({
        filePath,
        printer: printer || undefined,
        copies,
        range: rangeMode === "custom" ? range : undefined,
        grayscale: color === "grayscale",
      });
      setStatus(`Sent ✓ ${job}`);
      setTimeout(() => setOpen(false), 1200);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 animate-in fade-in-0" />
        <Dialog.Content dir="ltr" className="fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface shadow-qalam animate-in fade-in-0 zoom-in-95">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <Dialog.Title className="text-base font-semibold">Print / Document setup</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 text-ink-soft hover:bg-paper-edge">
              <XMark size={18} />
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5">
            {/* Printer */}
            <div className="col-span-2">
              <Field label="Printer">
                {printers.length > 0 ? (
                  <Select
                    value={printer}
                    onChange={setPrinter}
                    options={printers.map((p) => ({
                      value: p.name,
                      label: p.is_default ? `${p.name} (default)` : p.name,
                    }))}
                    className="w-full"
                  />
                ) : (
                  <div className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft">
                    {isTauri() ? "No printers found on this system." : "Printers load in the desktop app."}
                  </div>
                )}
              </Field>
            </div>

            {/* Page size */}
            <Field label="Page size">
              <Select
                value={size}
                onChange={setSize}
                options={Object.entries(PAGE_SIZES).map(([k, v]) => ({ value: k, label: v.label }))}
                className="w-full"
              />
            </Field>

            {/* Orientation */}
            <Field label="Orientation">
              <div className="flex overflow-hidden rounded-md border border-line">
                {(["portrait", "landscape"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => setOrientation(o)}
                    className={`flex-1 py-1.5 text-sm capitalize ${
                      orientation === o ? "bg-accent text-white" : "hover:bg-paper-edge"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </Field>

            {/* Margins */}
            <Field label="Margin (px)">
              <input
                type="number"
                min={0}
                max={200}
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value) || 0)}
                className="w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none"
              />
            </Field>

            {/* Copies */}
            <Field label="Copies">
              <input
                type="number"
                min={1}
                max={999}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-md border border-line px-3 py-1.5 text-sm outline-none"
              />
            </Field>

            {/* Page range */}
            <Field label="Pages">
              <div className="flex items-center gap-2">
                <Select
                  value={rangeMode}
                  onChange={(v) => setRangeMode(v as "all" | "custom")}
                  options={[
                    { value: "all", label: `All (${pages.length})` },
                    { value: "custom", label: "Range…" },
                  ]}
                  className="w-28"
                />
                {rangeMode === "custom" && (
                  <input
                    placeholder="e.g. 1-3, 5"
                    value={range}
                    onChange={(e) => setRange(e.target.value)}
                    className="flex-1 rounded-md border border-line px-3 py-1.5 text-sm outline-none"
                  />
                )}
              </div>
            </Field>

            {/* Color */}
            <Field label="Color">
              <div className="flex overflow-hidden rounded-md border border-line">
                {(["color", "grayscale"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`flex-1 py-1.5 text-sm capitalize ${
                      color === c ? "bg-accent text-white" : "hover:bg-paper-edge"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* Status + actions */}
          <div className="border-t border-line px-5 py-3">
            {error && <p className="mb-2 text-xs text-danger">{error}</p>}
            {!error && status && <p className="mb-2 text-xs text-accent-deep">{status}</p>}
            {!error && !status && (
              <p className="mb-3 text-xs text-ink-soft">
                Choose a printer above; the document is rendered and sent directly.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Dialog.Close className="rounded-md border border-line px-4 py-1.5 text-sm hover:bg-paper-edge">
                Cancel
              </Dialog.Close>
              <button
                onClick={handlePrint}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-deep disabled:opacity-50"
              >
                <Export size={15} /> {busy ? "Printing…" : "Print"}
              </button>
            </div>
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
