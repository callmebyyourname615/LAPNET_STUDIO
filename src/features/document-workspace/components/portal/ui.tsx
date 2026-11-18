import { Skeleton } from "@/components/ui/skeleton";
import * as RD from "@radix-ui/react-dialog";
import * as RM from "@radix-ui/react-dropdown-menu";
import * as RT from "@radix-ui/react-tooltip";
import { AlertTriangle, Inbox, X, type LucideIcon } from "lucide-react";
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/features/document-workspace/lib/utils";

/* ---------- Button ---------- */
const variants = {
  primary: "bg-[var(--color-action-primary-bg)] text-[var(--color-action-primary-fg)] hover:bg-[var(--color-action-primary-hover)]",
  brand: "bg-[var(--color-action-brand-bg)] text-[var(--color-action-brand-fg)] hover:bg-[var(--color-action-brand-hover)]",
  secondary: "bg-raised text-fg border border-line hover:bg-hover",
  ghost: "text-fg-2 hover:bg-hover hover:text-fg",
  danger: "bg-danger-bg text-danger border border-line hover:bg-hover",
};
const sizes = { md: "h-ctl px-4 gap-2", sm: "h-ctl-sm px-3 gap-2", icon: "h-ctl-sm w-ctl-sm justify-center" };
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes; pending?:boolean };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", className, type = "button", pending, children, disabled, ...p }, ref) {
  return <button ref={ref} type={type} disabled={disabled||pending} aria-busy={pending||undefined} className={cn("inline-flex shrink-0 items-center rounded-md t-label ease-token transition-colors disabled:cursor-not-allowed disabled:opacity-50 touch-target", variants[variant], sizes[size], className)} {...p}>{children}{pending&&<Skeleton variant="inline" label="ກຳລັງບັນທຶກ"/>}</button>;
});
export function IconButton({ label, icon: Icon, ...p }: Omit<ButtonProps, "children"> & { label: string; icon: LucideIcon }) {
  return <Tip label={label}><Button size="icon" variant="ghost" aria-label={label} {...p}><Icon className="size-icon" aria-hidden /></Button></Tip>;
}

/* ---------- Tooltip ---------- */
export function Tip({ label, children, side = "right" }: { label: string; children: ReactNode; side?: "right" | "top" | "bottom" }) {
  return (
    <RT.Root delayDuration={300}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal container={document.querySelector<HTMLElement>("[data-document-workspace]")}><RT.Content side={side} sideOffset={6} className="z-[var(--z-popover)] rounded-sm bg-raised px-2 py-1 t-caption text-fg border border-line shadow-[var(--shadow-overlay)]">{label}</RT.Content></RT.Portal>
    </RT.Root>
  );
}
export const TipProvider = RT.Provider;

/* ---------- Form controls ---------- */
const control = "w-full rounded-md border border-line-control bg-surface px-3 t-body text-fg placeholder:text-fg-3 ease-token transition-colors aria-[invalid=true]:border-danger";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(control, "h-ctl", className)} {...p} />;
});
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-ctl pr-8", className)} {...p}>{children}</select>;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...p} />;
}
export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; required?: boolean; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId(); const dId = error || hint ? `${id}-d` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="t-label text-fg-2">{label}{required && <span aria-hidden className="text-red-600 font-bold"> *</span>}</label>
      {children(id, dId)}
      {error ? <p id={dId} className="t-caption text-danger flex items-center gap-1"><AlertTriangle className="size-3.5" aria-hidden />{error}</p> : hint ? <p id={dId} className="t-caption text-fg-3">{hint}</p> : null}
    </div>
  );
}

/* ---------- Badge ---------- */
const tones = { neutral: "bg-raised text-fg-2", accent: "bg-accent-soft text-accent", ok: "bg-ok-bg text-ok", warn: "bg-warn-bg text-warn", danger: "bg-danger-bg text-danger", info: "bg-info-bg text-info" };
export type Tone = keyof typeof tones;
export function Badge({ tone = "neutral", children, className, icon: Icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: LucideIcon }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 t-caption font-medium whitespace-nowrap", tones[tone], className)}>{Icon && <Icon className="size-3.5" aria-hidden />}{children}</span>;
}
export function CountBadge({ n }: { n: number }) { return <span className="ml-auto min-w-6 shrink-0 rounded-sm bg-raised px-1.5 text-center t-caption text-fg-2">{n}</span>; }

/* ---------- Dialog (focus trap, Escape, focus return, inert background via Radix) ---------- */
export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal container={document.querySelector<HTMLElement>("[data-document-workspace]")}>
        <RD.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-[var(--color-overlay)]" />
        <RD.Content className={cn("fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-[var(--shadow-overlay)]", wide ? "max-w-2xl" : "max-w-md")}>
          <div className="flex items-start justify-between gap-4 border-b border-line p-5">
            <div className="min-w-0"><RD.Title className="t-section">{title}</RD.Title>{description ? <RD.Description className="t-body text-fg-2 mt-1">{description}</RD.Description> : <RD.Description className="sr-only">{title}</RD.Description>}</div>
            <RD.Close asChild><Button size="icon" variant="ghost" aria-label="Close"><X className="size-icon" /></Button></RD.Close>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">{footer}</div>}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
export function ConfirmDialog({ open, onOpenChange, title, body, confirmLabel, cancelLabel, onConfirm, danger }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void|boolean|Promise<void|boolean>; danger?: boolean }) {
  const [pending,setPending]=useState(false);
  return <Dialog open={open} onOpenChange={o=>!pending&&onOpenChange(o)} title={title} footer={<><Button disabled={pending} onClick={() => onOpenChange(false)}>{cancelLabel}</Button><Button pending={pending} variant={danger ? "danger" : "primary"} onClick={async () => {setPending(true);try{if(await onConfirm()!==false)onOpenChange(false);}finally{setPending(false);}}}>{confirmLabel}</Button></>}><p className="t-body text-fg-2">{body}</p></Dialog>;
}

/* ---------- Drawer (closed drawers are unmounted, so never interactive) ---------- */
export function Drawer({ open, onOpenChange, title, children, side = "left" }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; side?: "left" | "right" }) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal container={document.querySelector<HTMLElement>("[data-document-workspace]")}>
        <RD.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-[var(--color-overlay)]" />
        <RD.Content className={cn("drawer-content fixed inset-y-0 z-[var(--z-modal)] flex flex-col border-line bg-sidebar shadow-[var(--shadow-overlay)]", side === "left" ? "left-0 border-r" : "right-0 border-l")}>
          <div className="flex h-topbar shrink-0 items-center justify-between border-b border-line px-4"><RD.Title className="t-label">{title}</RD.Title><RD.Description className="sr-only">{title}</RD.Description>
            <RD.Close asChild><Button size="icon" variant="ghost" aria-label="Close"><X className="size-icon" /></Button></RD.Close></div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/* ---------- Menu ---------- */
export const Menu = RM.Root;
export const MenuTrigger = RM.Trigger;
export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return <RM.Portal container={document.querySelector<HTMLElement>("[data-document-workspace]")}><RM.Content align={align} sideOffset={4} className="z-[var(--z-popover)] max-h-[70vh] min-w-48 overflow-y-auto rounded-md border border-line bg-raised p-1 shadow-[var(--shadow-overlay)]">{children}</RM.Content></RM.Portal>;
}
export function MenuItem({ children, onSelect, disabled, danger }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; danger?: boolean }) {
  return <RM.Item disabled={disabled} onSelect={onSelect} className={cn("flex min-h-ctl-sm cursor-pointer items-center gap-2 rounded-sm px-2 t-body outline-none data-[highlighted]:bg-hover data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-2", danger ? "text-danger" : "text-fg")}>{children}</RM.Item>;
}
export const MenuLabel = ({ children }: { children: ReactNode }) => <RM.Label className="px-2 py-1 t-caption text-fg-2">{children}</RM.Label>;
export const MenuSeparator = () => <RM.Separator className="my-1 h-px bg-line" />;
export const MenuRadioGroup = RM.RadioGroup;
export function MenuRadio({ value, children }: { value: string; children: ReactNode }) {
  return <RM.RadioItem value={value} className="flex min-h-ctl-sm cursor-pointer items-center gap-2 rounded-sm px-2 t-body outline-none data-[highlighted]:bg-hover data-[state=checked]:text-accent"><span className="w-3" aria-hidden><RM.ItemIndicator>•</RM.ItemIndicator></span>{children}</RM.RadioItem>;
}

/* ---------- Segmented control ---------- */
export function SegmentedControl<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex rounded-md bg-sidebar p-1 border border-line", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
          className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 h-8 t-label ease-token transition-colors", on ? "bg-raised text-fg shadow-[var(--shadow-subtle)]" : "text-fg-2 hover:text-fg")}>
          {o.icon && <o.icon className="size-4 shrink-0" aria-hidden />}<span className="whitespace-nowrap">{o.label}</span></button>;
      })}
    </div>
  );
}

/* ---------- States ---------- */
export function EmptyState({ icon: Icon = Inbox, title, hint, action }: { icon?: LucideIcon; title: string; hint?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-12 text-center"><Icon className="size-8 text-fg-3" aria-hidden /><p className="t-label text-fg">{title}</p>{hint && <p className="t-body text-fg-2 max-w-md">{hint}</p>}{action && <div className="mt-2">{action}</div>}</div>;
}
export function ErrorState({ title, hint, onRetry, retryLabel }: { title: string; hint?: string; onRetry?: () => void; retryLabel?: string }) {
  return <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-line bg-danger-bg px-6 py-12 text-center"><AlertTriangle className="size-8 text-danger" aria-hidden /><p className="t-label">{title}</p>{hint && <p className="t-body text-fg-2">{hint}</p>}{onRetry && <Button className="mt-2" onClick={onRetry}>{retryLabel}</Button>}</div>;
}
export function LoadingSkeleton({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return <Skeleton variant="rows" rows={rows} label={label} />;
}
export function Card({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn("rounded-lg border border-line bg-surface", className)}>{children}</section>; }
export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) { return <div className="mb-3 flex items-center justify-between gap-2"><h2 id={id} className="t-section">{children}</h2>{action}</div>; }
export function Avatar({ name }: { name: string }) {
  const ini = name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return <span aria-hidden className="grid size-avatar shrink-0 place-items-center rounded-full border border-line bg-raised t-caption text-fg-2">{ini}</span>;
}
export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="min-w-0"><h1 className="t-page break-words">{title}</h1>{meta && <p className="t-body text-fg-2 mt-1">{meta}</p>}</div>{actions && <div className="flex flex-wrap gap-2">{actions}</div>}</div>;
}
