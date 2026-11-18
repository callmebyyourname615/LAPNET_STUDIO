import { PasswordChangeCard } from "./password-change-card";

/** Visual review only; never mounted in the application and never sends a request. */
export default function PasswordChangeCardPreview() {
  return (
    <div
      style={{
        display: "grid",
        gap: "var(--space-password-section)",
        padding: "var(--space-password-card)",
      }}
    >
      {["default", "hover", "focus", "active", "disabled", "loading", "error", "success"].map(
        (state) => (
          <section key={state}>
            <h2>{state}</h2>
            <PasswordChangeCard
              embedded
              className={"is-" + state}
              disabled={state === "disabled"}
              pending={state === "loading"}
              error={state === "error" ? "ບັນທຶກບໍ່ສຳເລັດ. ກະລຸນາລອງໃໝ່." : ""}
              success={state === "success"}
              onSubmit={async () => false}
            />
          </section>
        ),
      )}
    </div>
  );
}
