import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";

/** A top menu-bar entry (File, Edit, …) with a dropdown of items. */
export function Menu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink-soft outline-none transition-colors hover:bg-paper-edge hover:text-ink data-[state=open]:bg-paper-edge data-[state=open]:text-ink">
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[220px] rounded-xl border border-line bg-surface p-1.5 shadow-qalam animate-in fade-in-0 zoom-in-95"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  children,
  onSelect,
  shortcut,
  disabled,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-6 rounded-lg px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors",
        "data-[highlighted]:bg-accent data-[highlighted]:text-white",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
      )}
    >
      <span>{children}</span>
      {shortcut && <span className="text-[11px] tabular-nums opacity-55">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}
