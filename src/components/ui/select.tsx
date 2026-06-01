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
          "h-8 w-full cursor-pointer appearance-none rounded-lg border border-line bg-paper/60 pl-3 pr-8 text-[13px] font-medium text-ink",
          "shadow-sm outline-none transition-all",
          "hover:bg-surface hover:border-accent/50",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
          "disabled:cursor-default disabled:opacity-45"
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
        size={14}
        className="pointer-events-none absolute right-2.5 text-ink-soft"
      />
    </div>
  );
}
