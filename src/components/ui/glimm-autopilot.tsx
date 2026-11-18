"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GlimmScope, type GlimmScopeHandle, type ScopePlayHandle } from "glimm/react";
import type { PortalService } from "@/features/document-workspace/lib/services/portal-service";

export const isDocumentWorkspace = (path: string) => path === "/document-workspace" || path.startsWith("/document-workspace/");
type Platform = "portal" | "document";
const TransitionContext = createContext<{
  platform: Platform;
  busy: boolean;
  error: string;
  documentService: RefObject<PortalService | null>;
  switchTo: (platform: Platform, trigger: HTMLElement) => void;
} | null>(null);

/** The supplied Glimm interaction, applied to the real platform switch. */
export default function GlimmAutopilot({ children }: { children: ReactNode }) {
  const scope = useRef<GlimmScopeHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scrollport = useRef<HTMLDivElement>(null);
  const playing = useRef<ScopePlayHandle | null>(null);
  const locked = useRef(false);
  const documentService = useRef<PortalService | null>(null);
  const focusDestination = useRef(false);
  const lastPortal = useRef("/dashboard");
  const lastDocument = useRef("/document-workspace");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const platform: Platform = isDocumentWorkspace(location.pathname) ? "document" : "portal";

  useEffect(() => {
    const current = location.pathname + location.search;
    if (isDocumentWorkspace(location.pathname)) lastDocument.current = current;
    else lastPortal.current = current;
    if (focusDestination.current) {
      stage.current?.querySelector<HTMLButtonElement>('.platform-switcher button[aria-pressed="true"]')?.focus({ preventScroll: true });
      focusDestination.current = false;
    }
  }, [location.pathname, location.search]);
  useEffect(() => { scrollport.current?.scrollTo({ top: 0 }); }, [location.pathname]);
  useEffect(() => () => { playing.current?.cancel(); documentService.current?.dispose(); documentService.current = null; }, []);

  function switchTo(next: Platform, trigger: HTMLElement) {
    if (next === platform || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const rect = trigger.getBoundingClientRect();
    const box = stage.current?.getBoundingClientRect();
    const change = () => { focusDestination.current = true; navigate(next === "document" ? lastDocument.current : lastPortal.current); };
    const finish = () => { locked.current = false; setBusy(false); };
    const fail = () => { setError("ບໍ່ສາມາດເປີດລະບົບໄດ້. ກະລຸນາກົດລອງໃໝ່."); finish(); };
    const work = async () => { if (next === "document") await import("../../features/document-workspace/Workspace"); };
    if (!scope.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void work().then(change).then(finish).catch(fail);
      return;
    }
    try {
      playing.current = scope.current.play({
        at: [rect.left + rect.width / 2 - (box?.left ?? 0), rect.top + rect.height / 2 - (box?.top ?? 0)],
        work,
        change,
        onBurst: finish,
        onLeave: finish,
        onFail: fail,
      });
    } catch { void work().then(change).then(finish).catch(fail); }
  }

  return <TransitionContext.Provider value={{ platform, busy, error, switchTo, documentService }}>
    <div className="platform-stage" ref={stage}>
      <GlimmScope ref={scope} palette="azure" sweepMs={2700} brightness={0.85} style={{ position: "relative", height: "100dvh" }}>
        <div ref={scrollport} className="platform-scrollport">{children}</div>
      </GlimmScope>
    </div>
  </TransitionContext.Provider>;
}

export function usePlatformTransition() {
  const value = useContext(TransitionContext);
  if (!value) throw new Error("Platform transition provider missing");
  return value;
}

export { GlimmAutopilot };
