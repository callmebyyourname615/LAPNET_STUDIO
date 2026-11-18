import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MonitorDown, X } from "lucide-react";
import { Skeleton } from "./skeleton";
import { toast } from "@/lib/toast";
import "./install-app.css";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const InstallContext = createContext<{
  prompt: InstallPrompt | null;
  consume: () => void;
  installed: boolean;
} | null>(null);

/** Capture the browser event even while authentication is still loading. */
export function InstallAppProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const completed = () => {
      setInstalled(true);
      setPrompt(null);
      toast.success("ຕິດຕັ້ງ LAPNet Studio Portal ສຳເລັດ.");
    };
    const changed = () => setInstalled(mode.matches);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", completed);
    mode.addEventListener("change", changed);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", completed);
      mode.removeEventListener("change", changed);
    };
  }, []);
  return (
    <InstallContext.Provider value={{ prompt, consume: () => setPrompt(null), installed }}>
      {children}
    </InstallContext.Provider>
  );
}

export function InstallAppButton() {
  const install = useContext(InstallContext);
  const trigger = useRef<HTMLButtonElement>(null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!install || install.installed) return null;
  const requestInstall = async () => {
    if (busy) return;
    if (!install.prompt) {
      setHelp(true);
      return;
    }
    const prompt = install.prompt;
    install.consume();
    setBusy(true);
    try {
      // A deferred browser prompt is single-use and must start from this user gesture.
      await prompt.prompt();
      await prompt.userChoice;
      setHelp(false);
    } catch {
      setHelp(true);
      toast.error("ບໍ່ສາມາດເປີດໜ້າຕິດຕັ້ງໄດ້. ກະລຸນາໃຊ້ເມນູຕິດຕັ້ງຂອງ browser.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button secondary pwa-install-button"
        aria-label="ຕິດຕັ້ງແອັບ"
        title="ຕິດຕັ້ງ LAPNet Studio Portal"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void requestInstall()}
      >
        <MonitorDown size={18} aria-hidden="true" />
        <span>ຕິດຕັ້ງແອັບ</span>
        {busy && <Skeleton variant="inline" />}
      </button>
      <Dialog.Root open={help} onOpenChange={setHelp}>
        <Dialog.Portal>
          <Dialog.Overlay className="pwa-install-overlay" />
          <Dialog.Content
            className="panel pwa-install-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
          >
            <Dialog.Close asChild>
              <button className="icon-button pwa-install-close" aria-label="ປິດ">
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
            <img src="/icons/pwa-192.png" alt="" width="64" height="64" />
            <Dialog.Title>ຕິດຕັ້ງ LAPNet Studio Portal</Dialog.Title>
            <Dialog.Description>
              ເປີດຈາກໄອຄອນໃນຄອມພິວເຕີ ແລະ ໃຊ້ງານໃນໜ້າຕ່າງແຍກ. ຕ້ອງເຊື່ອມຕໍ່ລະບົບເພື່ອໃຊ້ງານ.
            </Dialog.Description>
            <p>
              <strong>Chrome / Edge</strong>
              <br />
              ເລືອກໄອຄອນຕິດຕັ້ງໃນແຖບທີ່ຢູ່ ຫຼື ເມນູ browser → ຕິດຕັ້ງໜ້ານີ້ເປັນແອັບ (Install page as app).
            </p>
            <p>
              <strong>Safari ໃນ Mac</strong>
              <br />
              ເລືອກ File → Add to Dock.
            </p>
            <div className="pwa-install-actions">
              <Dialog.Close asChild>
                <button className="button secondary">ປິດ</button>
              </Dialog.Close>
              {install.prompt && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void requestInstall()}
                >
                  ຕິດຕັ້ງດຽວນີ້
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
