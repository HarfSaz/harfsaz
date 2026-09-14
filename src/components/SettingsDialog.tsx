import * as Dialog from "@radix-ui/react-dialog";
import { useUi } from "../lib/ui";
import { openAccountPage } from "../lib/cloud";
export function SettingsDialog() {
  const open = useUi(s => s.settingsOpen), setOpen = useUi(s => s.setSettingsOpen);
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[420px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-harfsaz">
      <Dialog.Title className="text-lg font-semibold">Account settings</Dialog.Title>
      <Dialog.Description className="mt-3 text-sm text-ink-soft">Manage your personal information, password, Google sign-in, and connected devices.</Dialog.Description>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="rounded-lg border border-line px-4 py-2" onClick={() => void openAccountPage()}>Manage account ↗</button>
        <Dialog.Close className="rounded-lg border border-line px-4 py-2">Close</Dialog.Close>
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
