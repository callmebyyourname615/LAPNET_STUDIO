/** Isolated visual review; not mounted in the application. */
import { LogOut, Settings } from "lucide-react";
import { Skeleton } from "./skeleton";
import "./profile-menu.css";

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
export default function ProfileMenuPreview() {
  return (
    <div className="profile-menu-preview">
      {states.map((state) => (
        <section key={state}>
          <h2>{state}</h2>
          {state === "success" ? (
            <p>Signed out · sign-in screen is shown without a toast.</p>
          ) : (
            <div className="profile-menu" data-preview={state}>
              <div className="profile-menu-identity">
                <strong>Account menu</strong>
              </div>
              <div className="profile-menu-divider" />
              <button
                className="profile-menu-item"
                data-highlighted={state === "hover" ? "" : undefined}
                disabled={state === "disabled" || state === "loading"}
              >
                <Settings size={18} aria-hidden="true" />
                Settings
              </button>
              <button
                className="profile-menu-item profile-menu-logout"
                disabled={state === "disabled" || state === "loading"}
              >
                <LogOut size={18} aria-hidden="true" />
                Logout{state === "loading" && <Skeleton variant="inline" label="Signing out" />}
              </button>
              {state === "error" && (
                <p className="profile-menu-error" role="alert">
                  Could not sign out. Try again.
                </p>
              )}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
