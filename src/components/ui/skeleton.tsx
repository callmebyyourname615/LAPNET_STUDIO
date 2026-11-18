import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import "./skeleton.css";

gsap.registerPlugin(useGSAP);

export type SkeletonVariant = "page" | "rows" | "card" | "dashboard" | "form" | "detail" | "inline";
type SkeletonProps = { variant?: SkeletonVariant; rows?: number; label?: string };

/** Shared loading placeholder. Animate transforms only; never animate the layout. */
export function Skeleton({ variant = "rows", rows = 3, label = "ກຳລັງໂຫຼດ..." }: SkeletonProps) {
  const root = useRef<HTMLSpanElement>(null);
  const count = Math.max(1, Math.min(12, Math.floor(rows) || 3));

  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          const animation = gsap.fromTo(
            ".skeleton-sweep",
            { x: 0, xPercent: -110 },
            {
              xPercent: 110,
              duration: 1.5,
              repeat: -1,
              ease: "none",
              stagger: 0.04,
            },
          );
          let visible = true;
          const update = () => animation.paused(document.hidden || !visible);
          const observer = new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            update();
          });
          observer.observe(root.current!);
          document.addEventListener("visibilitychange", update);
          update();
          return () => {
            observer.disconnect();
            document.removeEventListener("visibilitychange", update);
          };
        },
        root,
      );
      return () => media.revert();
    },
    { scope: root, dependencies: [variant, count], revertOnUpdate: true },
  );

  const block = (kind: string, key: number) => (
    <span key={key} className={`skeleton-block skeleton-${kind}`}>
      <i className="skeleton-sweep" />
    </span>
  );
  return (
    <span
      ref={root}
      className={`skeleton-layout skeleton-${variant}`}
      role="status"
      aria-busy="true"
      data-skeleton={variant}
    >
      <span className="sr-only">{label}</span>
      <span className="skeleton-placeholders" aria-hidden="true">
        {(variant === "page" || variant === "detail") && (
          <span className="skeleton-heading">
            {block("title", 100)}
            {block("text", 101)}
          </span>
        )}
        {variant === "inline" ? (
          block("indicator", 0)
        ) : variant === "dashboard" ? (
          <span className="skeleton-bento">
            {Array.from({ length: 8 }, (_, i) =>
              block(
                i === 0
                  ? "hero"
                  : i === 3
                    ? "chart"
                    : i === 4
                      ? "distribution"
                      : i === 5
                        ? "upcoming"
                        : i === 6
                          ? "priorities"
                          : i === 7
                            ? "recent"
                            : "tile",
                i,
              ),
            )}
          </span>
        ) : (
          Array.from({ length: count }, (_, i) => (
            <span className="skeleton-row" key={i}>
              {variant !== "form" && block("avatar", i * 3)}
              <span className="skeleton-copy">
                {block(variant === "form" ? "short" : "line", i * 3 + 1)}
                {block(variant === "form" ? "field" : "short", i * 3 + 2)}
              </span>
            </span>
          ))
        )}
      </span>
    </span>
  );
}
