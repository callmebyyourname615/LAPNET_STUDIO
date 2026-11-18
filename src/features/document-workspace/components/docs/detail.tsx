import { Link } from "@/features/document-workspace/router";
import { Download, Eye, FileWarning, Lock, Plus, RefreshCw, Tag as TagIcon, Upload, X } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { currentVersion, docPermission, folderPath, latestVersion, movementsOf, versionsOf } from "@/features/document-workspace/lib/domain/selectors";
import type { Document, DocumentVersion, Permission } from "@/features/document-workspace/lib/domain/types";
import { extOf, fmtBytes, fmtDate, fmtStamp } from "@/features/document-workspace/lib/format";
import { useI18n } from "@/features/document-workspace/lib/i18n";
import { useData, useMe, useNetwork, useService } from "@/features/document-workspace/lib/portal";
import { cn } from "@/features/document-workspace/lib/utils";
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input, Select, Textarea } from "@/features/document-workspace/components/portal/ui";
import { Breadcrumbs, DirectionLabel, FileStateBadge, FileTypeIcon } from "./parts";
import { DocsHeader } from "./library";
import { useLocalFile, validateFile } from "./register";

const TABS = ["overview", "versions", "movements", "linked", "access", "history"] as const;
const PdfPreview = lazy(() => import("./pdf-preview"));
type Tab = (typeof TABS)[number];

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="t-caption text-fg-2">{label}</dt><dd className="t-body break-words">{children}</dd></div>;
}

const previewable = (v: DocumentVersion) => !!v.sampleUrl && (["txt", "csv", "pdf", "png", "jpg", "jpeg", "webp"].includes(extOf(v.filename)));

export function DocumentPreview({ v }: { v: DocumentVersion | undefined }) {
  const { t } = useI18n();
  if (!v) return <EmptyState icon={Lock} title={t("no_available")} hint={t("unavailable_reason")} />;
  if (!previewable(v)) return <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line p-10 text-center"><FileTypeIcon filename={v.filename} className="size-10" /><p className="t-label break-all">{v.filename}</p><p className="t-caption text-fg-2">{fmtBytes(v.bytes)} · {v.mimeType}</p><p className="t-body text-fg-2 max-w-md">{v.sampleUrl ? t("unsupported") : t("no_sample")}</p></div>;
  const ext = extOf(v.filename);
  if (ext === "pdf") return <Suspense fallback={<Skeleton variant="detail" />}><PdfPreview key={v.id} url={v.sampleUrl!} filename={v.filename} /></Suspense>;
  return ["png", "jpg", "jpeg", "webp"].includes(ext) ? <img src={v.sampleUrl} alt={v.filename} className="max-h-[60vh] w-full rounded-lg object-contain bg-sidebar" />
    : <iframe sandbox="allow-same-origin" title={`${t("preview")}: ${v.filename}`} src={v.sampleUrl} className="h-[60vh] w-full rounded-lg border border-line bg-[var(--color-text-primary)]" />;
}

export function DownloadButton({ v }: { v: DocumentVersion | undefined }) {
  const { t } = useI18n();
  const reason = !v || v.scanState !== "available" ? t("unavailable_reason") : !v.sampleUrl ? t("no_sample") : null;
  if (reason || !v) return <span className="flex flex-col gap-1"><Button size="sm" disabled aria-describedby="dl-reason"><Download className="size-4" aria-hidden />{t("download")}</Button><span id="dl-reason" className="t-caption text-fg-2">{reason}</span></span>;
  return <a href={v.downloadUrl??v.sampleUrl} download={v.filename} className="inline-flex h-ctl-sm items-center gap-2 rounded-md border border-line bg-raised px-3 t-label hover:bg-hover touch-target"><Download className="size-4" aria-hidden />{t("download")}</a>;
}

export function VersionList({ doc, canEdit }: { doc: Document; canEdit: boolean }) {
  const { t, lang } = useI18n(); const d = useData(); const svc = useService(); const me = useMe();
  const {pending}=useNetwork();
  const versions = versionsOf(d, doc.id); const cur = currentVersion(d, doc.id);
  return (
    <ol className="flex flex-col gap-2">
      {versions.map((v) => (
        <li key={v.id} className={cn("flex flex-wrap items-center gap-3 rounded-md border border-line p-3", v.id === cur?.id && "border-accent")}>
          <FileTypeIcon filename={v.filename} />
          <div className="min-w-0 flex-1"><p className="t-label break-all">v{v.versionNumber} · {v.filename}</p>
            <p className="t-caption text-fg-2">{t("uploaded_at")}: {fmtStamp(v.uploadedAt, lang)} · {fmtBytes(v.bytes)} · {d.users.find((u) => u.id === v.uploadedById)?.name}{v.note ? ` · ${v.note}` : ""}</p></div>
          {v.id === cur?.id && <Badge tone="accent">{t("current_version")}</Badge>}
          <FileStateBadge state={v.scanState} />
          {v.scanError && <span className="t-caption text-danger">{v.scanError.startsWith('SCANNER_')?(lang==='lo'?'ບໍລິການສະແກນຍັງບໍ່ພ້ອມ. ລອງສະແກນໃໝ່ພາຍຫຼັງ.':'Scanner unavailable. Retry scanning later.'):v.scanError}</span>}
          {v.scanState === "failed" && canEdit && <Button disabled={pending} size="sm" onClick={() => svc.retryScan(v.id, me.id)}><RefreshCw className="size-4" aria-hidden />{t("retry_scan")}</Button>}
          <DownloadButton v={v} />
        </li>
      ))}
    </ol>
  );
}

export function MovementList({ doc }: { doc: Document }) {
  const { t, lang } = useI18n(); const d = useData(); const ms = movementsOf(d, doc.id);
  if (!ms.length) return <EmptyState title={lang === "lo" ? "ບໍ່ມີການຮັບ-ສົ່ງ" : "No receipt or dispatch movements"} />;
  return (
    <ol className="flex flex-col gap-2">{ms.map((m) => (
      <li key={m.id} className="rounded-md border border-line p-3">
        <p className="t-label">{m.direction === "receipt" ? t("receipt") : t("dispatch")} · {m.counterparty}</p>
        <dl className="mt-1 grid gap-2 sm:grid-cols-3"><Meta label={m.direction === "receipt" ? t("receipt_date") : t("dispatch_date")}>{fmtDate(m.occurredOn, lang)}</Meta><Meta label={t("reference")}>{m.reference ?? "—"}</Meta><Meta label={t("entered")}>{fmtStamp(m.recordedAt, lang)}</Meta></dl>
        {m.notes && <p className="mt-1 t-body text-fg-2">{m.notes}</p>}
      </li>))}</ol>
  );
}

export function SharingPanel({ doc, perm }: { doc: Document; perm: Permission }) {
  const { t, lang } = useI18n(); const d = useData(); const svc = useService(); const me = useMe();
  const grants = d.grants.filter((g) => g.resourceId === doc.id);
  const {pending}=useNetwork();
  const [subj, setSubj] = useState(d.departments[0]?.id??''); const [p, setP] = useState<Permission>("view");
  const name = (type: string, id: string) => type === "user" ? d.users.find((u) => u.id === id)?.name : d.departments.find((x) => x.id === id)?.name;
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-md bg-info-bg p-3 t-body text-info">{t("authz_note")}</p>
      <dl className="grid gap-3 sm:grid-cols-2"><Meta label={t("owner")}>{name("user", doc.ownerId)}</Meta><Meta label={t("owning_dept")}>{name("department", doc.owningDepartmentId)}</Meta></dl>
      <ul className="flex flex-col gap-2">{grants.map((g) => (
        <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2"><span className="t-label flex-1 min-w-0 truncate">{name(g.subjectType, g.subjectId)}</span><Badge>{g.subjectType === "user" ? t("person") : t("department")}</Badge><Badge tone="accent">{t(g.permission)}</Badge>
          {perm === "manage" && <Button disabled={pending} size="sm" variant="ghost" onClick={() => svc.removeGrant(g.id, me.id)} aria-label={`${t("remove")}: ${name(g.subjectType, g.subjectId)}`}><X className="size-4" /></Button>}</li>))}
        {grants.length === 0 && <li className="t-body text-fg-2">{lang === "lo" ? "ບໍ່ມີສິດເພີ່ມເຕີມ" : "No explicit grants"}</li>}</ul>
      {perm === "manage" ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const [type, id] = subj.split(":").length === 2 ? subj.split(":") : ["department", subj]; svc.addGrant(doc.id, type as "user" | "department", id, p, me.id); }}>
          <Field label={t("grant")}>{(id) => <Select id={id} value={subj} onChange={(e) => setSubj(e.target.value)} className="w-56">
            <optgroup label={t("department")}>{d.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
            <optgroup label={t("person")}>{d.users.filter((u) => !u.disabled).map((u) => <option key={u.id} value={`user:${u.id}`}>{u.name}</option>)}</optgroup></Select>}</Field>
          <Field label={t("permission")}>{(id) => <Select id={id} value={p} onChange={(e) => setP(e.target.value as Permission)} className="w-32">{(["view", "edit", "download", "comment", "manage"] as const).map((x) => <option key={x} value={x}>{x==='comment'?(lang==='lo'?'ຄວາມເຫັນ':'Comment'):t(x)}</option>)}</Select>}</Field>
          <Button pending={pending} type="submit" variant="primary">{t("grant")}</Button>
        </form>
      ) : <p className="t-caption text-fg-2">{lang === "lo" ? "ຕ້ອງມີສິດຈັດການເພື່ອປ່ຽນສິດ" : "Manage permission is required to change access."}</p>}
    </div>
  );
}

function LinkedWork({ doc, canEdit }: { doc: Document; canEdit: boolean }) {
  const { t, lang } = useI18n(); const d = useData(); const svc = useService(); const me = useMe();
  const [confirm, setConfirm] = useState<string | null>(null);
  const company = d.companies.find((c) => c.id === doc.companyId);
  const items=(doc.links??[]).filter(x=>['task','post','interaction'].includes(x.kind)).map(x=>({type:x.kind as 'task'|'post'|'interaction',id:x.id,linkId:x.linkId,label:x.title,link:<Link to={x.href} className="hover:underline">{x.title}</Link>}));
  return (
    <div className="flex flex-col gap-3">
      {company && <p className="t-body">{t("company")}: <Link to="/companies/$id" params={{ id: company.id }} className="text-accent hover:underline">{company.name}</Link></p>}
      {items.length === 0 ? <EmptyState title={lang === "lo" ? "ບໍ່ມີວຽກທີ່ເຊື່ອມ" : "No linked work"} /> : <ul className="flex flex-col gap-2">{items.map((it) => (
        <li key={it.linkId} className="flex items-center gap-2 rounded-md border border-line p-2"><Badge>{it.type === "task" ? t("tasks") : it.type === "post" ? t("nav_feed") : t("timeline")}</Badge><span className="min-w-0 flex-1 truncate t-body">{it.link}</span>
          {canEdit && <Button size="sm" variant="ghost" onClick={() => setConfirm(it.linkId)}>{t("unlink")}</Button>}</li>))}</ul>}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={t("unlink")} body={t("unlink_note")} confirmLabel={t("unlink")} cancelLabel={t("cancel")} onConfirm={async () => confirm ? (await svc.unlinkDocument(confirm, doc.id, me.id)).ok : false} />
    </div>
  );
}

export function DocumentDetail({ doc }: { doc: Document }) {
  const { t, lang } = useI18n(); const d = useData(); const me = useMe(); const svc = useService();
  const perm = docPermission(d, doc, me)!; const canEdit = doc.permissions?.edit??perm !== "view";
  const {pending}=useNetwork();const [tag,setTag]=useState('');
  const [tab, setTab] = useState<Tab>("overview");
  const cur = currentVersion(d, doc.id); const latest = latestVersion(d, doc.id);
  const pendingNewer = !!latest && !!cur && latest.id !== cur.id && (latest.scanState === "pending" || latest.scanState === "scanning");
  const [verOpen, setVerOpen] = useState(false); const [movOpen, setMovOpen] = useState(false);
  const owner = d.users.find((u) => u.id === doc.ownerId); const dept = d.departments.find((x) => x.id === doc.owningDepartmentId);
  const company = d.companies.find((c) => c.id === doc.companyId);
  const tabLabel: Record<Tab, string> = { overview: t("tab_overview"), versions: t("tab_versions"), movements: t("tab_movements"), linked: t("tab_linked"), access: t("tab_access"), history: t("tab_history") };

  return (
    <>
      <DocsHeader><Breadcrumbs path={folderPath(d.folders, doc.folderId)} /></DocsHeader>
      <main id="document-main" tabIndex={-1} className="page-pad mx-auto flex w-full max-w-page min-w-0 flex-1 flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-reading"><h1 className="t-page break-words">{doc.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 t-body text-fg-2"><span className="font-mono">{doc.registryNo}</span><DirectionLabel dir={doc.direction} />{latest && <FileStateBadge state={latest.scanState} />}</div></div>
          {canEdit && <div className="flex flex-wrap gap-2"><Button onClick={() => setMovOpen(true)} disabled={doc.direction === "internal"} title={doc.direction === "internal" ? (lang === "lo" ? "ເອກະສານພາຍໃນບໍ່ມີການຮັບ-ສົ່ງ" : "Internal documents have no receipt/dispatch") : undefined}><Plus className="size-4" aria-hidden />{t("add_movement")}</Button><Button variant="primary" onClick={() => setVerOpen(true)}><Upload className="size-4" aria-hidden />{t("new_version")}</Button></div>}
        </div>
        {pendingNewer && <p role="status" className="flex items-center gap-2 rounded-md bg-warn-bg p-3 t-body text-warn"><FileWarning className="size-4 shrink-0" aria-hidden />{t("pending_note")} (v{latest!.versionNumber}: {t(`scan_${latest!.scanState}` as "scan_pending")})</p>}
        <div className="detail-grid">
          <Card className="min-w-0 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="t-section flex items-center gap-2"><Eye className="size-5 text-fg-3" aria-hidden />{t("preview")}</h2>
              {cur && <span className="t-caption text-fg-2 break-all">{t("current_version")}: v{cur.versionNumber} · {cur.filename}</span>}</div>
            <DocumentPreview v={cur} />
            <div className="mt-3"><DownloadButton v={cur} /></div>
          </Card>
          <Card className="min-w-0">
            <div role="tablist" aria-label={doc.title} className="flex overflow-x-auto border-b border-line px-2">
              {TABS.map((k) => <button key={k} id={`tab-${k}`} role="tab" type="button" aria-selected={tab === k} aria-controls={`panel-${k}`} tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}
                onKeyDown={(e) => { const i = TABS.indexOf(k); const n = e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length] : e.key === "ArrowLeft" ? TABS[(i - 1 + TABS.length) % TABS.length] : null; if (n) { setTab(n); document.getElementById(`tab-${n}`)?.focus(); } }}
                className={cn("relative h-12 shrink-0 px-3 t-label", tab === k ? "text-fg" : "text-fg-2 hover:text-fg")}>{tabLabel[k]}{tab === k && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />}</button>)}
            </div>
            <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="p-4">
              {tab === "overview" && <div className="flex flex-col gap-5">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Meta label={t("registry_no")}><span className="font-mono">{doc.registryNo}</span></Meta>
                  <Meta label={t("external_no")}><span className="font-mono">{doc.externalNo ?? "—"}</span></Meta>
                  <Meta label={t("issue_date")}>{fmtDate(doc.issueDate, lang)}</Meta>
                  <Meta label={t("registered_at")}>{fmtStamp(doc.registeredAt, lang)}</Meta>
                  {movementsOf(d, doc.id).slice(0, 1).map((m) => <Meta key={m.id} label={m.direction === "receipt" ? `${t("receipt_date")} (${lang === "lo" ? "ຫຼ້າສຸດ" : "latest"})` : `${t("dispatch_date")} (${lang === "lo" ? "ຫຼ້າສຸດ" : "latest"})`}>{fmtDate(m.occurredOn, lang)}</Meta>)}
                  <Meta label={t("uploaded_at")}>{cur ? `v${cur.versionNumber} · ${fmtStamp(cur.uploadedAt, lang)}` : "—"}</Meta>
                  <Meta label={t("company")}>{company ? <Link to="/companies/$id" params={{ id: company.id }} className="text-accent hover:underline">{company.name}</Link> : "—"}</Meta>
                  <Meta label={t("owner")}>{owner?.name}</Meta><Meta label={t("owning_dept")}>{dept?.name}</Meta>
                  <Meta label={t("folder")}><Link to={doc.folderId ? "/documents/folders/$folderId" : "/documents"} params={doc.folderId ? { folderId: doc.folderId } : undefined} className="text-accent hover:underline">{d.folders.find((f) => f.id === doc.folderId)?.name ?? t("root")}</Link></Meta>
                </dl>
                <div><p className="t-caption text-fg-2 mb-2">{t("tags")}</p><div className="flex flex-wrap items-center gap-2">
                  {doc.tagIds.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-raised px-2 t-caption"><TagIcon className="size-3.5" aria-hidden />{d.tags.find((x) => x.id === id)?.name}
                    {canEdit && <button type="button" aria-label={`${t("remove")}: ${d.tags.find((x) => x.id === id)?.name}`} className="rounded-full p-0.5 hover:bg-hover" onClick={() => svc.setTags(doc.id, doc.tagIds.filter((x) => x !== id), me.id)}><X className="size-3" /></button>}</span>)}
                  {canEdit && <label className="inline-flex items-center gap-1"><span className="sr-only">{t("add_tag")}</span><Select value="" onChange={(e) => e.target.value && svc.setTags(doc.id, [...doc.tagIds, e.target.value], me.id)} className="h-8 w-36 t-caption"><option value="">+ {t("add_tag")}</option>{d.tags.filter((x) => !doc.tagIds.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></label>}
                  {canEdit&&<form className="flex items-center gap-2" onSubmit={async e=>{e.preventDefault();if(tag.trim()&&(await svc.setTags(doc.id,[...new Set([...doc.tagIds,tag.trim()])],me.id)).ok)setTag('');}}><Input aria-label={t('add_tag')} value={tag} maxLength={80} onChange={e=>setTag(e.target.value)} className="h-8 w-36"/><Button size="sm" disabled={pending||!tag.trim()} type="submit">{t('add_tag')}</Button></form>}
                  {!canEdit && doc.tagIds.length === 0 && <span className="t-body text-fg-2">—</span>}</div></div>
              </div>}
              {tab === "versions" && <VersionList doc={doc} canEdit={canEdit} />}
              {tab === "movements" && <MovementList doc={doc} />}
              {tab === "linked" && <LinkedWork doc={doc} canEdit={canEdit} />}
              {tab === "access" && <SharingPanel doc={doc} perm={perm} />}
              {tab === "history" && <ol className="flex flex-col gap-2">{d.history.filter((h) => h.resourceType === "document" && h.resourceId === doc.id).sort((a, b) => b.at.localeCompare(a.at)).map((h) => (
                <li key={h.id} className="t-body"><span className="text-fg-2 t-caption">{fmtStamp(h.at, lang)}</span><br />{d.users.find((u) => u.id === h.actorId)?.name} · {h.action.replace(/_/g, " ")}{h.detail ? ` · ${h.detail}` : ""}</li>))}</ol>}
            </div>
          </Card>
        </div>
      </main>
      <NewVersionDialog open={verOpen} onOpenChange={setVerOpen} doc={doc} />
      <MovementDialog open={movOpen} onOpenChange={setMovOpen} doc={doc} />
    </>
  );
}

function NewVersionDialog({ open, onOpenChange, doc }: { open: boolean; onOpenChange: (o: boolean) => void; doc: Document }) {
  const { t, lang } = useI18n(); const svc = useService(); const me = useMe(); const { file, pick, reset } = useLocalFile();const {pending}=useNetwork();
  const [note, setNote] = useState(""); const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={o=>!pending&&onOpenChange(o)} title={t("new_version")} description={lang === "lo" ? "ສະບັບໃໝ່ຈະຖືກເພີ່ມ; ສະບັບເກົ່າບໍ່ຖືກແທນທີ່." : "A new version is appended; earlier versions are never overwritten."}
      footer={<><Button disabled={pending} onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button pending={pending} variant="primary" onClick={async () => { if (!file) return setErr(lang === "lo" ? "ຈຳເປັນ" : "Choose a file."); const e = validateFile(file, lang); if (e) return setErr(e);const result=await svc.addVersion(doc.id, { ...file }, note, me.id);if(!result.ok)return setErr(t(result.error as 'REQUEST_FAILED'));reset();onOpenChange(false);setNote(""); }}>{t("submit")}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label={lang === "lo" ? "ໄຟລ໌" : "File"} required error={err ?? undefined}>{(id, db) => <Input id={id} type="file" aria-describedby={db} aria-invalid={!!err} className="h-auto py-2" onChange={(e) => { setErr(null); pick(e.target.files?.[0]); }} />}</Field>
        <Field label={t("notes")}>{(id) => <Input id={id} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function MovementDialog({ open, onOpenChange, doc }: { open: boolean; onOpenChange: (o: boolean) => void; doc: Document }) {
  const { t, lang } = useI18n(); const svc = useService(); const me = useMe();
  const [m, setM] = useState({ direction: doc.direction === "outgoing" ? "dispatch" : "receipt", occurredOn: "", counterparty: "", reference: "", notes: "" });
  const [err, setErr] = useState<string | null>(null);
  const {pending}=useNetwork();
  return (
    <Dialog open={open} onOpenChange={value => !pending && onOpenChange(value)} title={t("add_movement")}
      footer={<><Button disabled={pending} onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button pending={pending} variant="primary" onClick={async () => { if (pending) return; setErr(null); const r = await svc.addMovement({ documentId: doc.id, direction: m.direction as "receipt" | "dispatch", occurredOn: m.occurredOn, counterparty: m.counterparty, reference: m.reference || undefined, notes: m.notes || undefined }, me.id); if (!r.ok) setErr(t(r.error as 'REQUEST_FAILED')); else onOpenChange(false); }}>{t("save")}</Button></>}>
      <div className="flex flex-col gap-4">
        {err && <p role="alert" className="t-body text-danger">{err}</p>}
        <Field label={t("type")}>{(id) => <Select id={id} value={m.direction} onChange={(e) => setM({ ...m, direction: e.target.value })}><option value="receipt">{t("receipt")}</option><option value="dispatch">{t("dispatch")}</option></Select>}</Field>
        <Field label={m.direction === "receipt" ? t("receipt_date") : t("dispatch_date")} required error={err && !m.occurredOn ? (lang === "lo" ? "ຈຳເປັນ" : "Required") : undefined}>{(id, db) => <Input id={id} type="date" aria-describedby={db} value={m.occurredOn} onChange={(e) => setM({ ...m, occurredOn: e.target.value })} />}</Field>
        <Field label={t("counterparty")} required error={err && !m.counterparty ? (lang === "lo" ? "ຈຳເປັນ" : "Required") : undefined}>{(id, db) => <Input id={id} aria-describedby={db} value={m.counterparty} onChange={(e) => setM({ ...m, counterparty: e.target.value })} />}</Field>
        <Field label={t("reference")}>{(id) => <Input id={id} value={m.reference} onChange={(e) => setM({ ...m, reference: e.target.value })} />}</Field>
        <Field label={t("notes")}>{(id) => <Textarea id={id} value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} />}</Field>
      </div>
    </Dialog>
  );
}
