import { cn } from "../../lib/utils";

/** Compact swatch that opens the native color input. */
export function ColorButton({
  value,
  onChange,
  title,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  title: string;
  disabled?: boolean;
  className?: string;
}) {
  const isTransparent = value === "transparent";
  return (
    <label
      title={title}
      className={cn(
        "relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-line",
        disabled && "pointer-events-none opacity-45",
        className
      )}
    >
      <span
        className="h-4 w-4 rounded-[3px] border border-line"
        style={
          isTransparent
            ? {
                backgroundImage:
                  "linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)",
                backgroundSize: "6px 6px",
                backgroundPosition: "0 0,0 3px,3px -3px,-3px 0",
              }
            : { background: value }
        }
      />
      <input
        type="color"
        value={isTransparent ? "#ffffff" : value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}
