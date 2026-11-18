import { useState } from "react";
import { useAuth } from "@/features/identity/Auth";
import "./account-avatar.css";

export function AccountAvatar({
  small = false,
  className = "",
}: {
  small?: boolean;
  className?: string;
}) {
  const { me } = useAuth();
  const [failed, setFailed] = useState<string | null>(null);
  const url = me?.user.avatarUrl;
  return (
    <span
      className={`avatar account-avatar ${small ? "small" : ""} ${className}`}
      aria-hidden="true"
    >
      {url && url !== failed ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        me?.user.displayName.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
