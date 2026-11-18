import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleAlert, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Skeleton } from "./skeleton";
import "./password-change-card.css";

export type PasswordValues = { currentPassword: string; newPassword: string; confirmation: string };
type Field = keyof PasswordValues;
const empty: PasswordValues = { currentPassword: "", newPassword: "", confirmation: "" };
const labels: Record<Field, string> = {
  currentPassword: "ລະຫັດຜ່ານປັດຈຸບັນ",
  newPassword: "ລະຫັດຜ່ານໃໝ່",
  confirmation: "ຢືນຢັນລະຫັດຜ່ານໃໝ່",
};

export function PasswordChangeCard({
  embedded = false,
  pending = false,
  disabled = false,
  error = "",
  success = false,
  className = "",
  onEdit,
  onSubmit,
}: {
  embedded?: boolean;
  pending?: boolean;
  disabled?: boolean;
  error?: string;
  success?: boolean;
  className?: string;
  onEdit?: () => void;
  onSubmit: (values: PasswordValues) => Promise<boolean>;
}) {
  const uid = useId();
  const [values, setValues] = useState(empty);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [visible, setVisible] = useState<Partial<Record<Field, boolean>>>({});
  const inputs = useRef<Partial<Record<Field, HTMLInputElement | null>>>({});
  const errorNotice = useRef<HTMLParagraphElement>(null);
  const blocked = pending || disabled;
  useEffect(() => {
    if (error) errorNotice.current?.focus({ preventScroll: true });
  }, [error]);
  function validation(key: Field) {
    const value = values[key];
    if (!value) return "ກະລຸນາປ້ອນ" + labels[key] + ".";
    if (key !== "currentPassword" && (value.length < 6 || value.length > 128))
      return "ໃຊ້ລະຫັດຜ່ານ 6–128 ຕົວອັກສອນ.";
    if (key === "newPassword" && value === values.currentPassword)
      return "ເລືອກລະຫັດໃໝ່ທີ່ຕ່າງຈາກລະຫັດປັດຈຸບັນ.";
    if (key === "confirmation" && value !== values.newPassword)
      return "ລະຫັດຜ່ານບໍ່ກົງກັນ. ກະລຸນາກວດ ແລະ ປ້ອນໃໝ່.";
    return "";
  }
  function reset() {
    setValues(empty);
    setTouched({});
    setVisible({});
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    setTouched({ currentPassword: true, newPassword: true, confirmation: true });
    const invalid = (Object.keys(labels) as Field[]).find((key) => validation(key));
    if (invalid) {
      inputs.current[invalid]?.focus();
      return;
    }
    if (await onSubmit(values)) reset();
  }
  const Heading = embedded ? "h2" : "h1";
  return (
    <section
      className={"password-change-card " + className}
      aria-labelledby={uid + "-title"}
      data-state={pending ? "loading" : error ? "error" : success ? "success" : undefined}
    >
      <header className="password-change-heading">
        <span className="password-change-mark">
          <ShieldCheck size={22} aria-hidden="true" />
        </span>
        <div>
          <Heading id={uid + "-title"}>ປ່ຽນລະຫັດຜ່ານ</Heading>
          <p>ອັບເດດລະຫັດທີ່ໃຊ້ເຂົ້າບັນຊີຂອງທ່ານ.</p>
        </div>
      </header>
      <form className="password-change-form" noValidate onSubmit={(event) => void submit(event)}>
        {error && (
          <p
            ref={errorNotice}
            tabIndex={-1}
            className="password-change-notice password-change-error"
            role="alert"
          >
            <CircleAlert size={18} aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
        <div className="password-change-fields">
          {(Object.keys(labels) as Field[]).map((key) => {
            const message = touched[key] ? validation(key) : "";
            const inputId = uid + "-" + key;
            return (
              <div className={"password-change-field password-change-field--" + key} key={key}>
                <label htmlFor={inputId}>{labels[key]}</label>
                <div className="password-change-input" data-invalid={!!message || undefined}>
                  <input
                    id={inputId}
                    ref={(element) => {
                      inputs.current[key] = element;
                    }}
                    name={key}
                    type={visible[key] ? "text" : "password"}
                    autoComplete={key === "currentPassword" ? "current-password" : "new-password"}
                    autoCapitalize="none"
                    spellCheck={false}
                    minLength={key === "currentPassword" ? 1 : 6}
                    maxLength={128}
                    required
                    disabled={blocked}
                    value={values[key]}
                    aria-invalid={!!message}
                    aria-describedby={
                      message
                        ? inputId + "-error"
                        : key === "newPassword"
                          ? uid + "-hint"
                          : undefined
                    }
                    onBlur={() => setTouched((current) => ({ ...current, [key]: true }))}
                    onChange={(event) => {
                      onEdit?.();
                      setValues((current) => ({ ...current, [key]: event.target.value }));
                    }}
                  />
                  <button
                    type="button"
                    className="password-change-visibility"
                    aria-label={(visible[key] ? "ເຊື່ອງ " : "ສະແດງ ") + labels[key]}
                    aria-pressed={!!visible[key]}
                    aria-controls={inputId}
                    disabled={blocked}
                    onClick={() => setVisible((current) => ({ ...current, [key]: !current[key] }))}
                  >
                    {visible[key] ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {message ? (
                  <small id={inputId + "-error"} className="password-change-field-error">
                    {message}
                  </small>
                ) : (
                  key === "newPassword" && <small id={uid + "-hint"}>ໃຊ້ 6–128 ຕົວອັກສອນ.</small>
                )}
              </div>
            );
          })}
        </div>
        {success && (
          <p className="password-change-notice password-change-success" role="status">
            <Check size={18} aria-hidden="true" />
            <span>ປ່ຽນລະຫັດຜ່ານສຳເລັດແລ້ວ.</span>
          </p>
        )}
        <footer className="password-change-footer">
          <p>ອຸປະກອນອື່ນຈະຕ້ອງເຂົ້າລະບົບໃໝ່.</p>
          <div>
            <button
              type="button"
              className="password-change-reset"
              disabled={blocked}
              onClick={() => {
                reset();
                onEdit?.();
                inputs.current.currentPassword?.focus();
              }}
            >
              ລ້າງຂໍ້ມູນ
            </button>
            <button
              type="submit"
              className="password-change-save"
              disabled={blocked}
              aria-busy={pending}
            >
              ບັນທຶກລະຫັດຜ່ານ
              {pending ? (
                <Skeleton variant="inline" label="ກຳລັງບັນທຶກ..." />
              ) : (
                <ArrowRight size={17} aria-hidden="true" />
              )}
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}
