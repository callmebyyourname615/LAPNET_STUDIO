import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import "./toggle-switch.css";

type ToggleSwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "onClick"> & {
  checked: boolean;
  pending?: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function ToggleSwitch({
  checked,
  pending = false,
  disabled,
  onCheckedChange,
  className,
  ...props
}: ToggleSwitchProps) {
  return (
    <button
      {...props}
      type="button"
      role="switch"
      className={cn("portal-toggle-switch", className)}
      aria-checked={checked}
      aria-disabled={disabled || pending || undefined}
      aria-busy={pending || undefined}
      disabled={disabled}
      data-state={checked ? "checked" : "unchecked"}
      onClick={() => {
        if (!disabled && !pending) onCheckedChange(!checked);
      }}
    >
      <span className="portal-toggle-track" aria-hidden="true">
        <span className="portal-toggle-thumb" />
      </span>
    </button>
  );
}
