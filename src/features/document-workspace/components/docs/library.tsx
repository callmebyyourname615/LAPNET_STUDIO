import { useNavigate, useSearch } from "@/features/document-workspace/router";
import { ArrowUpDown, Filter, FolderPlus, FolderTree, LayoutGrid, List, Plus, Search, Table2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parseDocSearch, queryDocuments, type DocSearch } from "@/features/document-workspace/lib/domain/doc-query";
import { folderCount, folderPath, visibleDocs } from "@/features/document-workspace/lib/domain/selectors";
import { useI18n } from "@/features/document-workspace/lib/i18n";
import { useData, useDocumentLoad, useMe, useService } from "@/features/document-workspace/lib/portal";
import { Badge, Button, Dialog, EmptyState, ErrorState, Field, IconButton, Input, LoadingSkeleton, Menu, MenuContent, MenuLabel, MenuRadio, MenuRadioGroup, MenuSeparator, MenuTrigger, Select, SegmentedControl } from "@/features/document-workspace/components/portal/ui";
import { useShell } from "@/features/document-workspace/components/portal/shell";
import { Breadcrumbs, FolderCard } from "./parts";
import { folderOptions, useFolderActions } from "./folders";
import { DocumentGrid, DocumentMobileRow, DocumentTable } from "./table";
import { RegisterDocumentDialog } from "./register";

const PAGE = 12;

export function DocsHeader({ children }: { children?: ReactNode }) {
  const { t } = useI18n(); const { setDrawer, switcher, actions } = useShell();
  return (
    <header className="document-workspace-header">
      <div className="document-header-breadcrumb"><span className="folders-trigger"><IconButton label={t("open_folders")} icon={FolderTree} onClick={() => setDrawer("folders")} /></span><div className="min-w-0 flex-1">{children}</div></div>
      {switcher}
      <div className="document-header-actions">{actions}</div>
    </header>
  );
}

export function DocumentLibrary({ folderId }: { folderId: string | null }) {
  const { t, lang } = useI18n(); const d = useData(); const me = useMe(); const svc = useService();
  const raw = useSearch({ strict: false }) as Record<string, unknown>;
  const s = parseDocSearch(raw);
  const nav = useNavigate();
  const setS = (patch: Partial<DocSearch>) => nav({ to: ".", search: (prev: Record<string, unknown>) => { const n = { ...prev, ...patch, limit: undefined } as Record<string, unknown>; Object.keys(n).forEach((k) => (n[k] === undefined || n[k] === "") && delete n[k]); return n; } } as never);
  const { state, retry, pending } = useDocumentLoad();
  const { open: openFolder } = useFolderActions();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveIds, setMoveIds] = useState<string[] | null>(null); const [moveTarget, setMoveTarget] = useState("");
  const [moveError, setMoveError] = useState("");

  const folder = d.folders.find((f) => f.id === folderId);
  const path = folderPath(d.folders, folderId);
  const docs = useMemo(() => visibleDocs(d, me), [d, me]);
  const children = d.folders.filter((f) => f.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name));
  const rows = useMemo(() => queryDocuments(d, me, folderId, s), [d, me, folderId, s.q, s.dir, s.company, s.dept, s.state, s.tag, s.sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopeTotal = folderId ? folderCount(d, me, folderId, docs) : docs.length;
  const limit = s.limit ?? PAGE; const shown = rows.slice(0, limit);
  const view = s.view === "grid" ? "grid" : "list"; const full = s.mode === "registry";
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((x) => shown.every((r) => x.has(r.doc.id)) ? new Set() : new Set(shown.map((r) => r.doc.id)));
  const canMoveSel = [...selected].every((id) => d.documents.find((x) => x.id === id)?.permissions?.edit);
  const moveFolders = d.folders.filter(f => (moveIds ?? []).every(id => d.documents.find(doc => doc.id === id)?.owningDepartmentId === f.departmentId) && (f.canManage || svc.getConfig()?.departments.some(dep => dep.id === f.departmentId && dep.canCreate)));
  const rowIds = rows.map(row => row.doc.id).join(",");
  useEffect(() => { setSelected(previous => new Set([...previous].filter(id => rowIds.split(",").includes(id)))); }, [rowIds]);
  useEffect(() => { setMoveError(""); }, [moveIds]);

  const filters: { key: keyof DocSearch; label: string }[] = [];
  if (s.dir) filters.push({ key: "dir", label: `${t("direction")}: ${t(`dir_${s.dir}` as "dir_incoming")}` });
  if (s.company) filters.push({ key: "company", label: `${t("company")}: ${d.companies.find((c) => c.id === s.company)?.name}` });
  if (s.dept) filters.push({ key: "dept", label: `${t("department")}: ${d.departments.find((c) => c.id === s.dept)?.name}` });
  if (s.state) filters.push({ key: "state", label: `${t("file_state")}: ${t(`scan_${s.state}` as "scan_pending")}` });
  if (s.tag) filters.push({ key: "tag", label: `${t("tag")}: ${d.tags.find((c) => c.id === s.tag)?.name}` });
  if (s.q) filters.push({ key: "q", label: `“${s.q}”` });

  const FilterSelect = ({ k, label, opts }: { k: keyof DocSearch; label: string; opts: { v: string; l: string }[] }) => (
    <Field label={label}>{(id) => <Select id={id} value={(s[k] as string) ?? ""} onChange={(e) => setS({ [k]: e.target.value || undefined })} className="h-ctl-sm"><option value="">{t("any")}</option>{opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</Select>}</Field>
  );

  return (
    <>
      <DocsHeader><Breadcrumbs path={path} /></DocsHeader>
      <main id="document-main" tabIndex={-1} className="page-pad mx-auto flex w-full max-w-page min-w-0 flex-1 flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0"><h1 className="t-page break-words">{folder?.name ?? t("all_documents")}</h1>
            <p className="t-body text-fg-2">{state === "ready" ? t("documents_count", { n: scopeTotal }) : t("loading")}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton label={t("new_folder")} icon={FolderPlus} onClick={() => openFolder({ mode: "create", parentId: folderId })} />
            <Button variant="primary" disabled={!svc.getConfig()?.departments.some(d=>d.canCreate)} onClick={() => setRegisterOpen(true)}><Plus className="size-4" aria-hidden />{t("register")}</Button>
          </div>
        </div>

        {state === "loading" ? <LoadingSkeleton rows={6} label={t("loading")} /> : state === "error" ? <ErrorState title={t("error_title")} hint={t("error_hint")} onRetry={retry} retryLabel={t("retry")} /> : <>
          {children.length > 0 && (
            <section aria-labelledby="sub-h">
              <h2 id="sub-h" className="t-section mb-3">{t("subfolders")}</h2>
              <div className="folder-grid">{children.map((c) => <FolderCard key={c.id} folder={c} count={folderCount(d, me, c.id, docs)} onOpen={() => nav({ to: "/documents/folders/$folderId", params: { folderId: c.id }, search: s as never })} />)}</div>
            </section>
          )}
          <section aria-labelledby="recent-h" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="recent-h" className="t-section">{t("recent")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl label={t("registry")} value={full ? "registry" : "library"} onChange={(v) => setS({ mode: v === "registry" ? "registry" : undefined, view: undefined })} options={[{ value: "library", label: t("list"), icon: List }, { value: "registry", label: t("registry"), icon: Table2 }]} />
                {!full && <SegmentedControl label={`${t("grid")} / ${t("list")}`} value={view} onChange={(v) => setS({ view: v === "grid" ? "grid" : undefined })} options={[{ value: "list", label: t("list"), icon: List }, { value: "grid", label: t("grid"), icon: LayoutGrid }]} />}
                <Menu><MenuTrigger asChild><Button size="sm"><ArrowUpDown className="size-4" aria-hidden />{t("sort")}</Button></MenuTrigger>
                  <MenuContent><MenuRadioGroup value={s.sort ?? "uploaded"} onValueChange={(v) => setS({ sort: v === "uploaded" ? undefined : v })}>
                    {(["uploaded", "issue", "title", "registry"] as const).map((k) => <MenuRadio key={k} value={k}>{t(`sort_${k}`)}</MenuRadio>)}</MenuRadioGroup></MenuContent></Menu>
                <Menu><MenuTrigger asChild><Button size="sm"><Filter className="size-4" aria-hidden />{t("filter")}{filters.filter((f) => f.key !== "q").length > 0 && <Badge tone="accent">{filters.filter((f) => f.key !== "q").length}</Badge>}</Button></MenuTrigger>
                  <MenuContent><MenuLabel>{t("filter")}</MenuLabel><div className="flex w-64 flex-col gap-3 p-2" onKeyDown={(e) => e.stopPropagation()}>
                    <FilterSelect k="dir" label={t("direction")} opts={(["incoming", "outgoing", "internal"] as const).map((v) => ({ v, l: t(`dir_${v}`) }))} />
                    <FilterSelect k="company" label={t("company")} opts={d.companies.map((c) => ({ v: c.id, l: c.name }))} />
                    <FilterSelect k="dept" label={t("department")} opts={d.departments.map((c) => ({ v: c.id, l: lang === "lo" ? c.nameLo : c.name }))} />
                    <FilterSelect k="state" label={t("file_state")} opts={(["pending", "scanning", "available", "rejected", "failed"] as const).map((v) => ({ v, l: t(`scan_${v}`) }))} />
                    <FilterSelect k="tag" label={t("tag")} opts={d.tags.map((c) => ({ v: c.id, l: c.name }))} />
                  </div><MenuSeparator /></MenuContent></Menu>
              </div>
            </div>
            <label className="relative block max-w-xl"><span className="sr-only">{t("search_docs")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
              <Input type="search" key={folderId ?? "root"} value={s.q ?? ""} placeholder={t("search_docs")} className="pl-9" onChange={(e) => setS({ q: e.target.value || undefined })} />
            </label>
            {filters.length > 0 && <div className="flex flex-wrap items-center gap-2" aria-label={t("filter")}>
              {filters.map((f) => <button key={f.key} type="button" onClick={() => setS({ [f.key]: undefined })} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-raised px-3 t-caption hover:bg-hover" aria-label={`${t("remove")}: ${f.label}`}>{f.label}<X className="size-3.5" aria-hidden /></button>)}
              <Button size="sm" variant="ghost" onClick={() => setS({ q: undefined, dir: undefined, company: undefined, dept: undefined, state: undefined, tag: undefined })}>{t("clear_all")}</Button></div>}
            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-raised px-3 py-2" role="region" aria-label={t("selected", { n: selected.size })}>
                <span className="t-label">{t("selected", { n: selected.size })}</span>
                <Button size="sm" disabled={!canMoveSel} title={canMoveSel ? undefined : (lang === "lo" ? "ທ່ານບໍ່ມີສິດແກ້ໄຂບາງລາຍການ" : "You lack edit access to some selected records")} onClick={() => { setMoveIds([...selected]); setMoveTarget(""); }}>{t("move_to")}</Button>
                {!canMoveSel && <span className="t-caption text-fg-2">{lang === "lo" ? "ບໍ່ມີສິດແກ້ໄຂບາງລາຍການ" : "Edit access missing for some records"}</span>}
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>{t("clear_selection")}</Button>
              </div>
            )}
            {rows.length === 0 ? (
              scopeTotal === 0 && filters.length === 0 ? <EmptyState title={t("empty_folder")} hint={t("empty_folder_hint")} action={<Button variant="primary" onClick={() => setRegisterOpen(true)}>{t("register")}</Button>} />
                : <EmptyState icon={Search} title={t("no_results")} hint={t("no_results_hint")} action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setS({ q: undefined, dir: undefined, company: undefined, dept: undefined, state: undefined, tag: undefined })}>{t("clear_all")}</Button>{folderId && <Button onClick={() => nav({ to: "/documents", search: { q: s.q } })}>{t("all_documents")}</Button>}</div>} />
            ) : <>
              {view === "grid" && !full ? <DocumentGrid rows={shown} selected={selected} onToggle={toggle} /> : <>
                <DocumentTable rows={full ? rows : shown} selected={selected} onToggle={toggle} onToggleAll={toggleAll} full={full} onMove={(id) => { setMoveIds([id]); setMoveTarget(""); }} />
                <ul className="doc-mobile-list rounded-lg border border-line bg-surface">{shown.map((r) => <DocumentMobileRow key={r.doc.id} row={r} selected={selected.has(r.doc.id)} onToggle={() => toggle(r.doc.id)} />)}</ul>
              </>}
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="t-caption text-fg-2" aria-live="polite">{t("showing", { a: full ? rows.length : shown.length, b: rows.length })}</p>
                {!full && rows.length > shown.length && <Button onClick={() => nav({ to: ".", search: (p: Record<string, unknown>) => ({ ...p, limit: limit + PAGE }) } as never)}>{t("load_more")}</Button>}</div>
            </>}
          </section>
        </>}
      </main>
      <RegisterDocumentDialog open={registerOpen} onOpenChange={setRegisterOpen} defaultFolderId={folderId} />
      <Dialog open={!!moveIds} onOpenChange={(o) => !pending && !o && setMoveIds(null)} title={`${t("move_to")} (${moveIds?.length ?? 0})`}
        footer={<><Button disabled={pending} onClick={() => setMoveIds(null)}>{t("cancel")}</Button><Button pending={pending} variant="primary" onClick={async () => { if(pending)return;setMoveError("");for(const id of moveIds??[]){const result=await svc.moveDocument(id, moveTarget, me.id);if(!result.ok){setMoveError(t(result.error as 'REQUEST_FAILED'));return;}setSelected(previous=>new Set([...previous].filter(value=>value!==id)));setMoveIds(previous=>previous?.filter(value=>value!==id)??null);}setMoveIds(null); }}>{t("save")}</Button></>}>
        {moveError && <p role="alert" className="mb-3 t-body text-danger">{moveError}</p>}
        <Field label={t("folder")} hint={t("folder_department_mismatch")}>{(id, db) => <Select id={id} aria-describedby={db} value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)}><option value="">{t('root')}</option>{folderOptions(moveFolders).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>}</Field>
      </Dialog>
    </>
  );
}
