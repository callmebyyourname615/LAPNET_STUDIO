import { useEffect } from "react";
import { useAuth } from "./Auth";

/** Navigation is client-reported; business events are recorded independently by the server. */
export function usePageAudit(path: string) {
  const { me } = useAuth();
  const userId = me?.user.id,
    csrf = me?.csrfToken;
  useEffect(() => {
    if (!userId || !csrf) return;
    const request = new AbortController();
    void fetch("/api/v1/activity/page-view", {
      method: "POST",
      credentials: "same-origin",
      signal: request.signal,
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: JSON.stringify({ path }),
    }).catch(() => {
      /* Navigation remains usable when activity reporting is offline. */
    });
    return () => request.abort();
  }, [path, userId, csrf]);
}
