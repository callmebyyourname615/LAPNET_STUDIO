import { Skeleton } from "../../components/ui/skeleton";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { meSchema, type MeResponse } from "@lapnet/contracts";
import { apiRequest, ApiError, setCsrfToken } from "../../lib/api";
import { LoginPage, type LoginCredentials } from "@/components/ui/sign-in-page";
import { PasswordChangeCard, type PasswordValues } from "@/components/ui/password-change-card";

const errors: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ ຫຼື ບັນຊີນີ້ບໍ່ສາມາດເຂົ້າໃຊ້ໄດ້.",
  ACCESS_DENIED: "ທ່ານບໍ່ມີສິດດຳເນີນການນີ້.",
  VALIDATION_FAILED: "ກະລຸນາກວດຂໍ້ມູນທີ່ປ້ອນ.",
  CONFLICT: "ຂໍ້ມູນຊ້ຳ ຫຼື ມີການປ່ຽນແປງ. ກະລຸນາໂຫຼດໃໝ່.",
  RATE_LIMITED: "ມີການລອງຫຼາຍເກີນໄປ. ກະລຸນາລໍຖ້າແລ້ວລອງໃໝ່.",
  NOT_FOUND: "ບໍ່ພົບຂໍ້ມູນ ຫຼື ທ່ານບໍ່ມີສິດເຂົ້າເຖິງ.",
};
export function errorText(error: unknown) {
  return error instanceof ApiError
    ? (errors[error.code] ?? "ບໍ່ສາມາດດຳເນີນການໄດ້. ກະລຸນາລອງໃໝ່.")
    : "ບໍ່ສາມາດເຊື່ອມຕໍ່ລະບົບໄດ້. ກະລຸນາກວດກາການເຊື່ອມຕໍ່.";
}
type AuthContextValue = {
  me: MeResponse | null;
  preview: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth context unavailable");
  return value;
}

export function Authentication({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const authenticated = !!me;
  const generation = useRef(0);
  const accept = useCallback((value: unknown) => {
    const parsed = meSchema.parse(value);
    generation.current++;
    try {
      sessionStorage.removeItem("lapnet-ui-preview");
      sessionStorage.removeItem("lapnet-auth-mode");
    } catch {
      /* Browser storage may be disabled. */
    }
    setCsrfToken(parsed.csrfToken);
    setMe((previous) => (JSON.stringify(previous) === JSON.stringify(parsed) ? previous : parsed));
    setFailure("");
  }, []);
  const refresh = useCallback(async () => {
    const started = generation.current;
    try {
      const result = await apiRequest("/api/v1/me");
      if (generation.current === started) accept(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && generation.current === started) {
        generation.current++;
        setMe(null);
        setCsrfToken("");
        setFailure("");
      } else if (generation.current === started) setFailure(errorText(error));
    } finally {
      setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    void refresh();
    const onUnauthorized = () => {
      generation.current++;
      setMe(null);
      setCsrfToken("");
      setFailure("");
    };
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("lapnet:unauthorized", onUnauthorized);
    window.addEventListener("focus", onFocus);
    const timer = authenticated
      ? window.setInterval(() => {
          if (!document.hidden) void refresh();
        }, 60000)
      : undefined;
    return () => {
      window.removeEventListener("lapnet:unauthorized", onUnauthorized);
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearInterval(timer);
    };
  }, [refresh, authenticated]);
  const logout = useCallback(async () => {
    await apiRequest("/auth/logout", "POST");
    generation.current++;
    try {
      sessionStorage.removeItem("lapnet-ui-preview");
      sessionStorage.removeItem("lapnet-auth-mode");
    } catch {
      /* Browser storage may be disabled. */
    }
    setCsrfToken("");
    setMe(null);
    window.history.replaceState({}, "", "/sign-in");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);
  if (loading)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <Skeleton variant="form" label="ກຳລັງກວດສອບບັນຊີ..." />
        </div>
      </div>
    );
  return (
    <AuthContext.Provider value={{ me, preview: false, refresh, logout }}>
      {failure ? (
        <div className="auth-page">
          <section className="panel auth-card">
            <h1>ບໍ່ສາມາດເຊື່ອມຕໍ່ໄດ້</h1>
            <p role="alert">{failure}</p>
            <button
              className="button primary"
              onClick={() => {
                void refresh();
              }}
            >
              ລອງໃໝ່
            </button>
          </section>
        </div>
      ) : !me ? (
        <SignIn onSuccess={accept} />
      ) : (
        <div key={me.user.id}>{children}</div>
      )}
    </AuthContext.Provider>
  );
}

function SignIn({ onSuccess }: { onSuccess: (value: unknown) => void }) {
  const [error, setError] = useState("");
  async function submit(credentials: LoginCredentials) {
    setError("");
    try {
      onSuccess(await apiRequest("/auth/login", "POST", credentials));
      window.history.replaceState({}, "", "/dashboard");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (error) {
      setError(errorText(error));
    }
  }
  return <LoginPage onSubmit={submit} error={error} />;
}

export function PasswordChange({ embedded = false }: { embedded?: boolean } = {}) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  async function submit(values: PasswordValues) {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const result = await apiRequest("/auth/change-password", "POST", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setCsrfToken(meSchema.parse(result).csrfToken);
      await refresh();
      setSaved(true);
      return true;
    } catch (error) {
      setError(errorText(error));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <PasswordChangeCard
      embedded={embedded}
      pending={busy}
      error={error}
      success={saved}
      onEdit={() => {
        setError("");
        setSaved(false);
      }}
      onSubmit={submit}
    />
  );
}
