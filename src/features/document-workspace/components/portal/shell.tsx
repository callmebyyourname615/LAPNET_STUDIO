import { createContext, useContext, useState, type ReactNode } from "react";
import { Globe } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { Badge, Button, Menu, MenuContent, MenuRadio, MenuRadioGroup, MenuTrigger } from "./ui";

type DrawerName = "folders" | null;
const ShellContext = createContext<{ drawer: DrawerName; setDrawer: (name: DrawerName) => void; switcher: ReactNode; actions: ReactNode }>({ drawer: null, setDrawer: () => {}, switcher: null, actions: null });
export const useShell = () => useContext(ShellContext);
export function DemoLabel() { const { t } = useI18n(); return <Badge tone="warn">{t("demo")}</Badge>; }
export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return <Menu><MenuTrigger asChild><Button size="sm" variant="ghost" aria-label={t("language")}><Globe size={16} aria-hidden />{lang === "lo" ? "ລາວ" : "EN"}</Button></MenuTrigger><MenuContent><MenuRadioGroup value={lang} onValueChange={value => setLang(value as "lo" | "en")}><MenuRadio value="lo">ລາວ</MenuRadio><MenuRadio value="en">English</MenuRadio></MenuRadioGroup></MenuContent></Menu>;
}
export function AppShell({ children, switcher, actions }: { children: ReactNode; switcher: ReactNode; actions: ReactNode }) {
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const { t } = useI18n();
  return <ShellContext.Provider value={{ drawer, setDrawer, switcher, actions }}>
    <a href="#document-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:bg-raised focus:p-3">{t("skip")}</a>
    <div className="shell shell-docs">{children}</div>
  </ShellContext.Provider>;
}
