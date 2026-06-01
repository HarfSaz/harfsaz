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
        <button className="rounded px-2.5 py-1 text-sm text-ink outline-none hover:bg-paper-edge data-[state=open]:bg-paper-edge">
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[200px] rounded-lg border border-line bg-surface p-1 shadow-qalam animate-in fade-in-0 zoom-in-95"
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
        "flex cursor-pointer items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-sm text-ink outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-white",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
      )}
    >
      <span>{children}</span>
      {shortcut && <span className="text-xs opacity-60">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-line" />;
}
