/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { useRef, useState, type ReactElement } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LogOut, Settings } from "lucide-react";
import { errorText, useAuth } from "@/features/identity/Auth";
import { Skeleton } from "./skeleton";
import "./profile-menu.css";

gsap.registerPlugin(useGSAP);

/** Both platforms share the same account actions and authenticated session. */
export function ProfileMenu({
  children,
  go,
  side = "bottom",
}: {
  children: ReactElement;
  go: (path: string) => void;
  side?: "top" | "bottom";
}) {
  const { me, logout } = useAuth();
  const panel = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const english = document.documentElement.lang === "en";
  const labels = {
    settings: english ? "Settings" : "ຕັ້ງຄ່າ",
    logout: english ? "Logout" : "ອອກຈາກລະບົບ",
    pending: english ? "Signing out…" : "ກຳລັງອອກຈາກລະບົບ…",
  };

  const { contextSafe } = useGSAP(
    () => {
      if (!open || !panel.current) return;
      const media = gsap.matchMedia();
      media.add(
        {
          reduced: "(prefers-reduced-motion: reduce)",
          normal: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const reduced = context.conditions?.reduced;
          const styles = getComputedStyle(panel.current!);
          gsap.fromTo(
            panel.current,
            {
              autoAlpha: 0,
              y: reduced
                ? 0
                : (side === "bottom" ? -1 : 1) *
                  parseFloat(styles.getPropertyValue("--distance-profile-enter")),
              scale: reduced ? 1 : 0.98,
            },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: reduced
                ? 0
                : parseFloat(styles.getPropertyValue("--duration-profile-enter")) / 1000,
              ease: "power2.out",
              overwrite: "auto",
            },
          );
        },
        panel,
      );
      return () => media.revert();
    },
    { scope: panel, dependencies: [open, side], revertOnUpdate: true },
  );

  const close = contextSafe((after?: () => void) => {
    if (closing.current || busy) return;
    closing.current = true;
    const finish = () => {
      closing.current = false;
      setOpen(false);
      after?.();
    };
    if (!panel.current) {
      finish();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration =
      parseFloat(getComputedStyle(panel.current).getPropertyValue("--duration-profile-exit")) /
      1000;
    gsap.to(panel.current, {
      autoAlpha: 0,
      y: reduced ? 0 : side === "bottom" ? -4 : 4,
      scale: reduced ? 1 : 0.99,
      duration: reduced ? 0 : duration,
      ease: "power1.in",
      overwrite: "auto",
      onComplete: finish,
    });
  });

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <Dropdown.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          closing.current = false;
          setError("");
          setOpen(true);
        } else close();
      }}
    >
      <Dropdown.Trigger asChild>{children}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          ref={panel}
          className="profile-menu"
          side={side}
          sideOffset={8}
          align="end"
          collisionPadding={12}
          aria-label={english ? "Account menu" : "ເມນູບັນຊີ"}
          aria-busy={busy}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <Dropdown.Label className="profile-menu-identity">
            <strong>{me?.user.displayName}</strong>
            <span>{me?.user.username}</span>
          </Dropdown.Label>
          <Dropdown.Separator className="profile-menu-divider" />
          <Dropdown.Item
            className="profile-menu-item"
            disabled={busy}
            onSelect={(event) => {
              event.preventDefault();
              close(() => go("/settings"));
            }}
          >
            <Settings size={18} aria-hidden="true" />
            <span>{labels.settings}</span>
          </Dropdown.Item>
          <Dropdown.Item
            className="profile-menu-item profile-menu-logout"
            disabled={busy}
            onSelect={(event) => {
              event.preventDefault();
              void signOut();
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            <span>{labels.logout}</span>
            {busy && <Skeleton variant="inline" label={labels.pending} />}
          </Dropdown.Item>
          {error && (
            <p className="profile-menu-error" role="alert">
              {error}
            </p>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
