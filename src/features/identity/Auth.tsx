import { Skeleton } from "../../components/ui/skeleton";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import { meSchema, type MeResponse } from "@lapnet/contracts";
import { apiRequest, ApiError, setCsrfToken } from "../../lib/api";
import { LoginPage, type LoginCredentials } from "@/components/ui/sign-in-page";

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
    setMe(parsed);
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
          void refresh();
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

export function PasswordChange({embedded=false}:{embedded?:boolean}={}) {
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    if (form.get("newPassword") !== form.get("confirmation")) {
      setError("ລະຫັດຜ່ານທັງສອງບໍ່ກົງກັນ.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest("/auth/change-password", "POST", {
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
      });
      setCsrfToken(meSchema.parse(result).csrfToken);
      await refresh();
      setSaved(true);
      element.reset();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <section className="panel auth-card">
      {embedded?<h2>ປ່ຽນລະຫັດຜ່ານ</h2>:<h1>ບັນຊີຂອງຂ້ອຍ</h1>}
      <p>ລະຫັດຜ່ານໃໝ່ຕ້ອງມີ 6–128 ຕົວອັກສອນ. ສາມາດໃຊ້ວະລີທີ່ຈື່ໄດ້ງ່າຍ.</p>
      <form className="identity-form" onSubmit={submit}>
        <label>
          ລະຫັດຜ່ານປັດຈຸບັນ
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <label>
          ລະຫັດຜ່ານໃໝ່
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            maxLength={128}
            required
          />
        </label>
        <label>
          ຢືນຢັນລະຫັດຜ່ານໃໝ່
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={6}
            maxLength={128}
            required
          />
        </label>
        {error && (
          <p className="identity-error" role="alert">
            {error}
          </p>
        )}
        {saved && <p role="status">ປ່ຽນລະຫັດຜ່ານສຳເລັດແລ້ວ.</p>}
        <button className="button primary" disabled={busy} aria-busy={busy}>
          {busy && <Skeleton variant="inline" label="ກຳລັງບັນທຶກ..." />}
          ບັນທຶກລະຫັດຜ່ານ
        </button>
      </form>
    </section>
  );
  return content;
}
