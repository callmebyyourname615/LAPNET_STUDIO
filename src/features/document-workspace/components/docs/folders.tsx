import { LanguageSwitch } from "../portal/shell";
import { useNavigate } from "@/features/document-workspace/router";
import { ChevronDown, ChevronRight, Folder as FolderIcon, FolderOpen, FolderPlus, FolderInput, Pencil, Trash2, MoreHorizontal, Search, Tag as TagIcon } from "lucide-react";
import { createContext, useContext, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { folderCount, folderPath, visibleDocs, wouldCycle, descendantIds } from "@/features/document-workspace/lib/domain/selectors";
import type { Folder } from "@/features/document-workspace/lib/domain/types";
import { fmtBytes } from "@/features/document-workspace/lib/format";
import { useI18n } from "@/features/document-workspace/lib/i18n";
import type { StringKey } from "@/features/document-workspace/lib/i18n/strings";
import { useData, useMe, useNetwork, useService } from "@/features/document-workspace/lib/portal";
import { cn } from "@/features/document-workspace/lib/utils";
import { Button, CountBadge, Dialog, Field, IconButton, Input, Menu, MenuContent, MenuItem, MenuTrigger, SegmentedControl, Select } from "@/features/document-workspace/components/portal/ui";

/* ---------- Folder dialogs context (create / rename / move / delete with validation) ---------- */
type FolderAction = { mode: "create"; parentId: string | null } | { mode: "rename" | "move" | "delete"; folderId: string };
const FolderCtx = createContext<{ open: (a: FolderAction) => void; selectedId: string | null }>({ open: () => {}, selectedId: null });
export const useFolderActions = () => useContext(FolderCtx);

export function folderOptions(folders: Folder[], exclude?: Set<string>) {
  const out: { id: string; label: string }[] = [];
  const walk = (parent: string | null, depth: number) => folders.filter((f) => f.parentId === parent || (parent === null && !!f.parentId && !folders.some(candidate => candidate.id === f.parentId))).sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => {
    if (exclude?.has(f.id)) return; out.push({ id: f.id, label: `${"— ".repeat(depth)}${f.name}` }); walk(f.id, depth + 1);
  });
  walk(null, 0); return out;
}

export function FolderActionsProvider({ selectedId, children }: { selectedId: string | null; children: ReactNode }) {
  const { t } = useI18n(); const d = useData(); const svc = useService(); const me = useMe(); const nav = useNavigate();
  const {pending}=useNetwork();
  const [action, setAction] = useState<FolderAction | null>(null);
  const [name, setName] = useState(""); const [parent, setParent] = useState<string>(""); const [error, setError] = useState<string | null>(null);
  const parentDepartmentId = d.folders.find((folder) => folder.id === parent)?.departmentId;
  const canCreate = svc.getConfig()?.departments.some((department) => department.canCreate && (!parent || department.id === parentDepartmentId)) ?? false;
  const open = (a: FolderAction) => {
    setError(null); setConfirmation(""); setAction(a);
    if (a.mode === "create") { setName(""); setParent(a.parentId ?? ""); }
    else { const f = d.folders.find((x) => x.id === a.folderId); setName(f?.name ?? ""); setParent(f?.parentId ?? ""); }
  };
  const close = () => setAction(null);
  const [confirmation, setConfirmation] = useState("");
  const confirmationDescriptionId = useId();
  const submit = async () => {
    if (!action||pending) return;
    const p = parent || null;
    const r = await (action.mode === "create" ? svc.createFolder(name, p, me.id) : action.mode === "rename" ? svc.renameFolder(action.folderId, name, me.id) : action.mode === "move" ? svc.moveFolder(action.folderId, p, me.id) : null);
    if (!r) return;
    if (!r.ok) { setError(t(r.error as StringKey)); return; }
    if (action.mode === "create" && typeof r.value === "string") nav({ to: "/documents/folders/$folderId", params: { folderId: r.value } });
    close();
  };
  const target = action && action.mode !== "create" ? d.folders.find((f) => f.id === action.folderId) : undefined;
  const excluded = action?.mode === "move" ? descendantIds(d.folders, action.folderId) : undefined;
  const remove = async () => {
    if (!target || pending || confirmation !== target.name) return;
    const removingSelection = !!selectedId && descendantIds(d.folders, target.id).has(selectedId);
    const result = await svc.deleteFolder(target.id, confirmation, me.id);
    if (!result.ok) { setError(t(result.error as StringKey)); return; }
    if (removingSelection) nav({ to: "/documents" });
    close();
  };
  return (
    <FolderCtx.Provider value={{ open, selectedId }}>
      {children}
      <Dialog open={!!action && action.mode !== "delete"} onOpenChange={(o) => !pending && !o && close()}
        title={action?.mode === "create" ? t("new_folder") : action?.mode === "rename" ? `${t("rename")}: ${target?.name}` : `${t("move_to")} ${target?.name ?? ""}`}
        footer={<><Button disabled={pending} onClick={close}>{t("cancel")}</Button><Button disabled={action?.mode === "create" && !canCreate} pending={pending} variant="primary" onClick={submit}>{action?.mode === "create" ? t("create") : t("save")}</Button></>}>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {action?.mode === "create" && !canCreate && <p role="alert" className="t-body text-danger">{t("folder_create_access_required")}</p>}
          {action?.mode !== "move" && <Field label={t("folder_name")} required error={error ?? undefined}>{(id, db) => <Input id={id} aria-describedby={db} aria-invalid={!!error} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />}</Field>}
          {action?.mode !== "rename" && <Field label={t("parent_folder")} error={action?.mode === "move" ? error ?? undefined : undefined} hint={action?.mode === "move" ? t("cycle") : undefined}>{(id, db) => (
            <Select id={id} aria-describedby={db} value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">{t("root")}</option>
              {folderOptions(d.folders.filter(f => action?.mode !== "move" || f.departmentId === target?.departmentId), excluded).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>)}</Field>}
          <button type="submit" hidden />
        </form>
      </Dialog>
      {action?.mode === "delete" && target && <Dialog open onOpenChange={o => !pending && !o && close()} title={`${t("delete")}: ${target.name}`}
        footer={<><Button disabled={pending} onClick={close}>{t("cancel")}</Button><Button variant="danger" pending={pending} disabled={confirmation !== target.name} onClick={() => void remove()}>{t("delete")}</Button></>}>
        <form className="flex flex-col gap-4" onSubmit={e => { e.preventDefault(); void remove(); }}>
          <p id={confirmationDescriptionId} className="t-body text-danger">{t("delete_folder_intro")} <span className="inline-block max-w-full select-all break-all rounded-sm border border-line bg-raised px-2 py-0.5 align-middle font-medium text-fg">{target.name}</span>{t("delete_folder_warning")}</p>
          <Field label={t("delete_folder_confirm")} required error={error ?? undefined}>{(id, db) => <Input id={id} aria-describedby={[db, confirmationDescriptionId].filter(Boolean).join(" ")} aria-invalid={!!error} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" autoFocus />}</Field>
        </form>
      </Dialog>}

    </FolderCtx.Provider>
  );
}

/* ---------- Tree ---------- */
type Node = { folder: Folder; depth: number; hasChildren: boolean; count: number };

export function FolderNavigator({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n(); const d = useData(); const me = useMe(); const nav = useNavigate();
  const { open: openFolder, selectedId } = useFolderActions();
  const open = (action: FolderAction) => { onNavigate?.(); openFolder(action); };
  const [q, setQ] = useState(""); const [tab, setTab] = useState<"folders" | "tags">("folders");
  const ancestors = useMemo(() => new Set(folderPath(d.folders, selectedId).map((f) => f.id)), [d.folders, selectedId]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const docs = useMemo(() => visibleDocs(d, me), [d, me]);
  const isExpanded = (id: string) => expanded.has(id) || ancestors.has(id) && id !== selectedId || (q !== "");
  const matches = useMemo(() => {
    if (!q.trim()) return null; const s = new Set<string>(); const ql = q.toLowerCase();
    d.folders.filter((f) => f.name.toLowerCase().includes(ql)).forEach((f) => folderPath(d.folders, f.id).forEach((a) => s.add(a.id)));
    return s;
  }, [q, d.folders]);
  const nodes: Node[] = [];
  const walk = (parent: string | null, depth: number) => d.folders.filter((f) => f.parentId === parent).sort((a, b) => a.name.localeCompare(b.name)).forEach((f) => {
    if (matches && !matches.has(f.id)) return;
    const kids = d.folders.some((c) => c.parentId === f.id);
    nodes.push({ folder: f, depth, hasChildren: kids, count: folderCount(d, me, f.id, docs) });
    if (kids && isExpanded(f.id)) walk(f.id, depth + 1);
  });
  walk(null, 1);
  const [focusId, setFocusId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const focusTo = (id: string) => { setFocusId(id); refs.current.get(id)?.focus(); };
  const toggle = (id: string, to?: boolean) => setExpanded((s) => { const n = new Set(s); (to ?? !isExpanded(id)) ? n.add(id) : n.delete(id); return n; });
  const select = (id: string) => { nav({ to: "/documents/folders/$folderId", params: { folderId: id } }); onNavigate?.(); };
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = nodes[i]; const k = e.key;
    if (k === "ArrowDown" && nodes[i + 1]) focusTo(nodes[i + 1].folder.id);
    else if (k === "ArrowUp" && nodes[i - 1]) focusTo(nodes[i - 1].folder.id);
    else if (k === "Home") focusTo(nodes[0].folder.id);
    else if (k === "End") focusTo(nodes[nodes.length - 1].folder.id);
    else if (k === "ArrowRight") { if (n.hasChildren && !isExpanded(n.folder.id)) toggle(n.folder.id, true); else if (n.hasChildren && nodes[i + 1]) focusTo(nodes[i + 1].folder.id); }
    else if (k === "ArrowLeft") { if (n.hasChildren && isExpanded(n.folder.id)) toggle(n.folder.id, false); else if (n.folder.parentId) focusTo(n.folder.parentId); }
    else if (k === "Enter" || k === " ") select(n.folder.id);
    else return;
    e.preventDefault();
  };
  const tabStop = focusId && nodes.some((n) => n.folder.id === focusId) ? focusId : (selectedId && nodes.some((n) => n.folder.id === selectedId) ? selectedId : nodes[0]?.folder.id);
  const service=useService();const usedBytes=service.getConfig()?.storage.usedBytes??0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--docs-tree-bg)]">
      <div className="document-folder-brand">
        <button type="button" className="document-brand-link" aria-label="LAPNet Studio Docs" onClick={() => { nav({ to: "/documents" }); onNavigate?.(); }}>
          <span className="brand-logo"><img src="/branding/lapnet-studio-original.png" alt="LAPNet Studio" width="2172" height="724" /></span>
        </button>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <label className="relative block">
          <span className="sr-only">{t("search_folders")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search_folders")} className="pl-9 h-ctl-sm bg-sidebar" />
        </label>
        <SegmentedControl label={`${t("folders")} / ${t("tags")}`} value={tab} onChange={setTab} options={[{ value: "folders", label: t("folders") }, { value: "tags", label: t("tags") }]} />
        <Button className="w-full justify-center" onClick={() => open({ mode: "create", parentId: selectedId })}>
          <FolderPlus className="size-4" aria-hidden />{t("new_folder")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {tab === "folders" ? (
          nodes.length === 0 ? <p className="px-2 py-4 t-body text-fg-2">{t("no_results")}</p> :
          <div role="tree" aria-label={t("folders")}>
            {nodes.map((n, i) => {
              const sel = n.folder.id === selectedId; const exp = n.hasChildren ? isExpanded(n.folder.id) : undefined;
              return (
                <div key={n.folder.id} ref={(el) => { if (el) refs.current.set(n.folder.id, el); else refs.current.delete(n.folder.id); }}
                  role="treeitem" aria-level={n.depth} aria-selected={sel} aria-expanded={exp} tabIndex={tabStop === n.folder.id ? 0 : -1}
                  onKeyDown={(e) => onKey(e, i)} onFocus={() => setFocusId(n.folder.id)} onClick={() => select(n.folder.id)}
                  className={cn("hover-row group relative flex min-h-[var(--docs-tree-row-min-height)] cursor-pointer items-center gap-1.5 rounded-md pr-1 t-label ease-token transition-colors", sel ? "bg-[var(--docs-selected-bg)] text-fg" : "text-fg-2 hover:bg-hover hover:text-fg")}
                  style={{ paddingLeft: `calc(${n.depth - 1} * var(--docs-tree-indent) + 4px)` }}>
                  {sel && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-[var(--docs-selected-marker)]" />}
                  {n.depth > 1 && <span aria-hidden className="absolute top-0 bottom-0 border-l border-[var(--docs-tree-connector)]" style={{ left: `calc(${n.depth - 2} * var(--docs-tree-indent) + 12px)` }} />}
                  {n.hasChildren ? <button type="button" tabIndex={-1} aria-hidden onClick={(e) => { e.stopPropagation(); toggle(n.folder.id); }} className="grid size-6 shrink-0 place-items-center rounded-sm hover:bg-raised">{exp ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button> : <span className="w-6 shrink-0" />}
                  {sel ? <FolderOpen className="size-4 shrink-0 text-accent" aria-hidden /> : <FolderIcon className="size-4 shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate" title={n.folder.name}>{n.folder.name}</span>
                  <CountBadge n={n.count} />
                  <Menu><MenuTrigger asChild><button type="button" tabIndex={-1} aria-label={`${n.folder.name} — ${t("col_actions")}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="grid size-6 shrink-0 place-items-center rounded-sm opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-raised"><MoreHorizontal className="size-4" /></button></MenuTrigger>
                    <MenuContent><MenuItem disabled={!service.getConfig()?.departments.some(dep => dep.id === n.folder.departmentId && dep.canCreate)} onSelect={() => open({ mode: "create", parentId: n.folder.id })}><FolderPlus className="size-4 shrink-0" aria-hidden />{t("new_folder")}</MenuItem><MenuItem disabled={!n.folder.canManage} onSelect={() => open({ mode: "rename", folderId: n.folder.id })}><Pencil className="size-4 shrink-0" aria-hidden />{t("rename")}</MenuItem><MenuItem disabled={!n.folder.canManage} onSelect={() => open({ mode: "move", folderId: n.folder.id })}><FolderInput className="size-4 shrink-0" aria-hidden />{t("move_to")}</MenuItem><MenuItem danger disabled={!n.folder.canManage} onSelect={() => open({ mode: "delete", folderId: n.folder.id })}><Trash2 className="size-4 shrink-0" aria-hidden />{t("delete")}</MenuItem></MenuContent></Menu>
                </div>
              );
            })}
          </div>
        ) : <TagList onNavigate={onNavigate} />}
      </div>
      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between gap-2"><p className="t-caption text-fg-2">{t("storage")}</p><LanguageSwitch /></div>
        <p className="mt-1 t-caption text-fg-2">{fmtBytes(usedBytes)}</p>
      </div>
    </div>
  );
}

function TagList({ onNavigate }: { onNavigate?: () => void }) {
  const d = useData(); const me = useMe(); const nav = useNavigate(); const { t } = useI18n();
  const docs = visibleDocs(d, me);
  return (
    <ul className="flex flex-col gap-0.5" aria-label={t("tags")}>
      {d.tags.map((tg) => (
        <li key={tg.id}><button type="button" onClick={() => { nav({ to: "/documents", search: { tag: tg.id } }); onNavigate?.(); }} className="hover-row flex min-h-[var(--docs-tree-row-min-height)] w-full items-center gap-2 rounded-md px-2 t-label text-fg-2 hover:bg-hover hover:text-fg">
          <TagIcon className="size-4 shrink-0" aria-hidden /><span className="truncate">{tg.name}</span><CountBadge n={docs.filter((x) => x.tagIds.includes(tg.id)).length} /></button></li>
      ))}
    </ul>
  );
}
export { wouldCycle };
