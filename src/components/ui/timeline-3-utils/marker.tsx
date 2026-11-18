import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Marker({
  className,
  variant: _variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: "separator" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border",
        className,
      )}
      {...props}
    />
  );
}
export function MarkerContent({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("shrink-0 text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}
