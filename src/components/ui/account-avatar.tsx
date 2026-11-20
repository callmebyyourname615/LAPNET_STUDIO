import { useState } from "react";
import { useAuth } from "@/features/identity/Auth";
import "./account-avatar.css";

export function AccountAvatar({
  small = false,
  className = "",
  person,
}: {
  small?: boolean;
  className?: string;
  person?: { displayName: string; avatarUrl: string | null };
}) {
  const { me } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);
  const identity = person ?? me?.user;
  const url = identity?.avatarUrl;
  return (
    <span
      className={`avatar account-avatar ${small ? "small" : ""} ${className}`}
      aria-hidden="true"
    >
      {url && url !== failed ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        identity?.displayName.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
