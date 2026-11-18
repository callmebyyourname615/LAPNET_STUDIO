"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "./skeleton";
import "./sign-in-page.css";

export type LoginCredentials = { username: string; password: string; rememberMe: boolean };
export type LoginPageProps = {
  onSubmit: (credentials: LoginCredentials) => Promise<void>;
  error?: string;
};

export function LoginPage({ onSubmit, error }: LoginPageProps) {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<LoginCredentials>({
    username: "",
    password: "",
    rememberMe: false,
  });
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = event.target;
    setFormData((previous) => ({ ...previous, [name]: type === "checkbox" ? checked : value }));
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(formData);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page flex min-h-svh w-full">
      <div className="login-art relative hidden min-h-svh flex-1 overflow-hidden md:block">
        <div className="absolute left-6 top-6 z-10">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="ກັບໄປໜ້າຫຼັກ"
            className="login-back"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <img
          src="/images/sign-in-macbook-dark.jpg"
          alt="MacBook ໃນແສງສີມ່ວງ ແລະ ສີຟ້າ"
          className="absolute inset-0 h-full w-full object-cover"
          width="4000"
          height="6000"
          fetchPriority="high"
        />
        <img
          src="/images/login-cat.jpg"
          alt="ແມວຍົກນິ້ວໂປ້"
          width="399"
          height="501"
          className="pointer-events-none absolute right-8 top-20 h-24 w-auto rounded-md object-contain"
        />
      </div>
      <div className="login-panel">
        <div className="login-content">
          <div className="login-header">
            <div className="auth-logo login-logo">
              <img
                src="/branding/lapnet-studio-original.png"
                alt="LAPNet Studio"
                width="2172"
                height="724"
              />
            </div>
            <h1 className="login-title">ຍິນດີຕ້ອນຮັບ</h1>
            <p className="login-subtitle">
              ຍັງບໍ່ມີບັນຊີ?{" "}
              <button
                type="button"
                onClick={() => setHelp(!help)}
                aria-expanded={help}
                aria-controls="login-help"
                className="login-link"
              >
                ຕິດຕໍ່ຜູ້ດູແລ
              </button>
            </p>
          </div>
          <form
            onSubmit={handleSubmit}
            className="login-form"
            aria-busy={busy}
            aria-label="ເຂົ້າລະບົບ"
          >
            <div>
              <label htmlFor="login-username" className="login-label">
                ຊື່ຜູ້ໃຊ້
              </label>
              <input
                id="login-username"
                type="text"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="ຊື່ຜູ້ໃຊ້"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                minLength={3}
                maxLength={64}
                className="login-input"
                required
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="login-password" className="login-label">
                ລະຫັດຜ່ານ
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="ລະຫັດຜ່ານ"
                  autoComplete="current-password"
                  minLength={6}
                  maxLength={128}
                  className="login-input login-password"
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={showPassword ? "ເຊື່ອງລະຫັດຜ່ານ" : "ສະແດງລະຫັດຜ່ານ"}
                  aria-pressed={showPassword}
                  disabled={busy}
                  className="login-eye"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>
            <div className="login-options">
              <label className="login-remember">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleInputChange}
                  className="login-checkbox"
                  disabled={busy}
                />
                <span>ຈື່ການເຂົ້າໃຊ້</span>
              </label>
              <button
                type="button"
                onClick={() => setHelp(!help)}
                aria-expanded={help}
                aria-controls="login-help"
                className="login-link"
              >
                ລືມລະຫັດຜ່ານ?
              </button>
            </div>
            {help && (
              <div id="login-help" className="login-notice" role="status">
                ກະລຸນາຕິດຕໍ່ຜູ້ດູແລລະບົບຂອງບໍລິສັດ ເພື່ອຂໍບັນຊີ ຫຼື ອອກລະຫັດຜ່ານຊົ່ວຄາວໃໝ່.
              </div>
            )}
            {error && (
              <p className="login-notice login-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="login-submit">
              {busy && <Skeleton variant="inline" label="ກຳລັງເຂົ້າລະບົບ..." />}
              {busy ? "ກຳລັງເຂົ້າລະບົບ..." : "ເຂົ້າລະບົບ"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
