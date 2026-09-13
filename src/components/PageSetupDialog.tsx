import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDoc } from "../lib/store";
import { PageSetup, NumberStyle, validPageSetup } from "../editor/publishing";

export function PageSetupDialog() {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<PageSetup>({ width: 794, height: 1123, margin: 40, numbering: false, numberStyle: "persian", start: 1 });
  const valid = validPageSetup(setup);
  return <Dialog.Root open={open} onOpenChange={value => {
    if (value) {
      const first = useDoc.getState().pages[0];
      setSetup({ width: first.width, height: first.height, margin: first.margin ?? 40,
        numbering: !!first.pageNumber, numberStyle: first.pageNumber?.style ?? "persian", start: first.pageNumber?.value ?? 1 });
    }
    setOpen(value);
  }}>
    <Dialog.Trigger asChild><button className="text-xs">Page setup…</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/20" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-6 shadow-harfsaz">
        <Dialog.Title className="font-semibold">Page setup</Dialog.Title>
        <Dialog.Description className="mt-2 text-xs text-ink-soft">Apply to every page. Main writing areas follow the margins; placed objects retain their positions. Text does not automatically flow between pages.</Dialog.Description>
        <label className="mt-4 flex flex-col gap-2 text-xs">Paper
          <select value={`${setup.width}x${setup.height}`} onChange={e => { const [width, height] = e.target.value.split("x").map(Number); setSetup({ ...setup, width, height }); }}>
            <option value="794x1123">A4 portrait</option><option value="1123x794">A4 landscape</option>
            <option value="559x794">A5 portrait</option><option value="794x559">A5 landscape</option>
            <option value="816x1056">Letter portrait</option><option value="1056x816">Letter landscape</option>
          </select>
        </label>
        <label className="mt-4 flex flex-col gap-2 text-xs">Margins (mm)
          <input type="number" min="7" max="100" step="1" value={Math.round(setup.margin * 25.4 / 96)} onChange={e => setSetup({ ...setup, margin: Number(e.target.value) * 96 / 25.4 })} />
        </label>
        <label className="mt-4 flex items-center gap-2 text-xs"><input type="checkbox" checked={setup.numbering} onChange={e => setSetup({ ...setup, numbering: e.target.checked })} />Page numbers at bottom center</label>
        {setup.numbering && <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-xs">Digits<select value={setup.numberStyle} onChange={e => setSetup({ ...setup, numberStyle: e.target.value as NumberStyle })}><option value="decimal">123</option><option value="arabic-indic">١٢٣</option><option value="persian">۱۲۳</option></select></label>
          <label className="flex flex-col gap-2 text-xs">Start at<input type="number" min="1" max="99999" value={setup.start} onChange={e => setSetup({ ...setup, start: Number(e.target.value) })} /></label>
        </div>}
        {!valid && <p role="alert" className="mt-3 text-xs text-danger">Use valid margins that leave at least 100 px of writing space, and a whole starting number.</p>}
        <div className="mt-6 flex justify-end gap-3"><Dialog.Close asChild><button>Cancel</button></Dialog.Close><button disabled={!valid} className="bg-accent text-white" onClick={() => { useDoc.getState().configurePages(setup); setOpen(false); }}>Apply to document</button></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
