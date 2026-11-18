import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { strings, type Lang, type StringKey } from "./strings";

type I18n = { lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey, vars?: Record<string, string | number>) => string };
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("lo");
  useEffect(() => {
    try {
      const s = window.sessionStorage.getItem("lapnet.document-workspace.language");
      if (s === "en" || s === "lo") setLangState(s);
    } catch { /* Language selection also works when browser storage is disabled. */ }
  }, []);
  useEffect(() => { const previous = document.documentElement.lang; document.documentElement.lang = lang; return () => { document.documentElement.lang = previous; }; }, [lang]);
  const setLang = (l: Lang) => { setLangState(l); try { window.sessionStorage.setItem("lapnet.document-workspace.language", l); } catch { /* Optional preference only. */ } };
  const t: I18n["t"] = (k, vars) => {
    let s: string = strings[lang][k] ?? strings.en[k];
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b));
    return s;
  };
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export function useI18n() { const c = useContext(Ctx); if (!c) throw new Error("I18nProvider missing"); return c; }
