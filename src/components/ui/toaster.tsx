import { useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { CircleCheck, CircleX, TriangleAlert, Info, X } from "lucide-react";
import { getToasts, subscribeToasts, removeToast, toast, type ToastNotice } from "@/lib/toast";
import "./toaster.css";

gsap.registerPlugin(useGSAP);
const icons = { success: CircleCheck, error: CircleX, warning: TriangleAlert, info: Info };
const titles = {
  lo: { success: "ສຳເລັດ", error: "ດຳເນີນການບໍ່ສຳເລັດ", warning: "ກະລຸນາກວດສອບ", info: "ແຈ້ງໃຫ້ຊາບ" },
  en: { success: "Success", error: "Action failed", warning: "Please check", info: "Notice" },
};

function ToastCard({ notice }: { notice: ToastNotice }) {
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const Icon = icons[notice.kind];
  const lang = document.documentElement.lang === "en" ? "en" : "lo";

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        {
          reduced: "(prefers-reduced-motion: reduce)",
          normal: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const node = root.current!;
          const reduced = context.conditions?.reduced;
          const styles = getComputedStyle(node);
          if (notice.closing) {
            gsap.to(node, {
              opacity: 0,
              x: reduced ? 0 : 16,
              duration: reduced
                ? 0
                : parseFloat(styles.getPropertyValue("--duration-toast-exit")) / 1000,
              ease: "power2.in",
              overwrite: true,
              onComplete: () => removeToast(notice.id),
            });
          } else {
            const duration = reduced
              ? 0
              : parseFloat(styles.getPropertyValue("--duration-toast-enter")) / 1000;
            gsap.fromTo(
              node,
              {
                opacity: 0,
                x: reduced ? 0 : parseFloat(styles.getPropertyValue("--distance-toast-enter")),
                y: reduced ? 0 : -8,
                scale: reduced ? 1 : 0.96,
              },
              {
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                duration,
                ease: "power3.out",
              },
            );
            if (!reduced)
              gsap.fromTo(
                node.querySelector(".toast-icon"),
                { scale: 0.75 },
                {
                  scale: 1,
                  duration: duration * 0.8,
                  delay: duration * 0.15,
                  ease: "back.out(1.7)",
                },
              );
          }
        },
        root,
      );
      return () => media.revert();
    },
    { scope: root, dependencies: [notice.closing], revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const node = root.current!;
      const styles = getComputedStyle(node);
      const duration =
        parseFloat(
          styles.getPropertyValue(
            notice.kind === "error" ? "--duration-toast-error-visible" : "--duration-toast-visible",
          ),
        ) / 1000;
      const clock = { remaining: duration };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      gsap.set(progress.current, { scaleX: 1 });
      const setProgress = gsap.quickSetter(progress.current, "scaleX");
      let lastSecond = -1;
      const update = () => {
        const seconds = Math.max(0, Math.ceil(clock.remaining));
        const changed = seconds !== lastSecond;
        if (changed) lastSecond = seconds;
        if (!reduced.matches || changed) setProgress(Math.max(0, clock.remaining / duration));
      };
      gsap.to(clock, {
        remaining: 0,
        duration,
        ease: "none",
        onUpdate: update,
        onComplete: () => toast.dismiss(notice.id),
      });
      update();
    },
    { scope: root, dependencies: [notice.id, notice.kind], revertOnUpdate: true },
  );

  return (
    <div
      ref={root}
      className="toast-card"
      data-toast={notice.kind}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span className="toast-icon">
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="toast-copy">
        <strong>{titles[lang][notice.kind]}</strong>
        <p>{notice.message}</p>
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label={lang === "en" ? "Dismiss notification" : "ປິດການແຈ້ງເຕືອນ"}
        onClick={() => toast.dismiss(notice.id)}
      >
        <X size={16} aria-hidden="true" />
      </button>
      <span className="toast-progress-track" aria-hidden="true">
        <span ref={progress} className="toast-progress-fill" />
      </span>
    </div>
  );
}

/** Mounted once outside route transitions, with no transformed ancestor. */
export function Toaster() {
  const notices = useSyncExternalStore(subscribeToasts, getToasts);
  return createPortal(
    <section className="toast-viewport" aria-label="ການແຈ້ງເຕືອນ / Notifications" aria-live="off">
      {notices.map((notice) => (
        <ToastCard key={notice.id} notice={notice} />
      ))}
    </section>,
    document.body,
  );
}
