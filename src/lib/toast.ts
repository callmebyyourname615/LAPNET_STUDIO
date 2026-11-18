export type ToastKind = "success" | "error" | "warning" | "info";
export type ToastNotice = { id: number; kind: ToastKind; message: string; closing: boolean };

let notices: ToastNotice[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function show(kind: ToastKind, message: string) {
  const duplicate = notices.find(
    (notice) => notice.kind === kind && notice.message === message && !notice.closing,
  );
  if (duplicate) return duplicate.id;
  const id = ++sequence;
  notices = [...notices, { id, kind, message, closing: false }].slice(-4);
  emit();
  return id;
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
  warning: (message: string) => show("warning", message),
  info: (message: string) => show("info", message),
  dismiss(id: number) {
    if (!notices.some((notice) => notice.id === id && !notice.closing)) return;
    notices = notices.map((notice) => (notice.id === id ? { ...notice, closing: true } : notice));
    emit();
  },
  clear() {
    notices = [];
    emit();
  },
};

export const getToasts = () => notices;
export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function removeToast(id: number) {
  notices = notices.filter((notice) => notice.id !== id);
  emit();
}
