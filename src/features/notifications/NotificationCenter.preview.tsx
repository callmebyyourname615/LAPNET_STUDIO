import { Bell, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "./notifications.css";

/** Design review only: controlled states, never mounted in the production inbox. */
export default function NotificationStatesPreview() {
  const states = [
    "default",
    "hover",
    "focus",
    "active",
    "disabled",
    "loading",
    "error",
    "success",
  ] as const;
  return (
    <section className="notify-state-preview" aria-label="Notification control states">
      {states.map((state) => (
        <div key={state}>
          <span>{state}</span>
          <button
            type="button"
            className={`notify-icon-button notify-bell is-${state}`}
            disabled={state === "disabled" || state === "loading"}
            aria-busy={state === "loading"}
            aria-label={`Notifications: ${state}`}
          >
            {state === "loading" ? (
              <Skeleton variant="inline" />
            ) : state === "success" ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Bell size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      ))}
    </section>
  );
}
