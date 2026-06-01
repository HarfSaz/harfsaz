import { ChevronDown } from "./icons";
import { cn } from "../../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

/** Lightweight styled native select — reliable, accessible, keyboard-friendly. */
export function Select({
  value,
  onChange,
  options,
  className,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const groups = Array.from(new Set(options.map((o) => o.group ?? "")));

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 appearance-none rounded-md border border-line bg-surface pl-3 pr-8 text-sm text-ink",
          "outline-none transition-colors hover:border-accent focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:opacity-45"
        )}
      >
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => (o.group ?? "") === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ) : (
            options
              .filter((o) => (o.group ?? "") === "")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
          )
        )}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-2.5 text-ink-soft"
      />
    </div>
  );
}
