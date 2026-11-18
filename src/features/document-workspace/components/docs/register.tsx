import { useNavigate } from "@/features/document-workspace/router";
import { useEffect, useState } from "react";
import { documentUploadLimits as FILE_LIMITS } from '@lapnet/contracts';
import type { Direction } from "@/features/document-workspace/lib/domain/types";
import { extOf, fmtBytes, fmtDate } from "@/features/document-workspace/lib/format";
import { useI18n } from "@/features/document-workspace/lib/i18n";
import { useData, useMe, useNetwork, useService } from "@/features/document-workspace/lib/portal";
import { Button, Dialog, Field, Input, Select, SegmentedControl } from "@/features/document-workspace/components/portal/ui";
import { folderOptions } from "./folders";

type FileSel = { name: string; bytes: number; mimeType: string; blob:File };
export function validateFile(f: { name: string; bytes: number }, lang: "lo" | "en") {
  const ext = extOf(f.name);
  if (!(FILE_LIMITS.allowedExtensions as readonly string[]).includes(ext)) return lang === "lo" ? `ບໍ່ອະນຸຍາດປະເພດ .${ext || "?"}` : `File type .${ext || "?"} is not allowed (${FILE_LIMITS.allowedExtensions.join(", ")}).`;
  if (f.bytes > FILE_LIMITS.maxFileBytes) return lang === "lo" ? `ໄຟລ໌ໃຫຍ່ເກີນ ${fmtBytes(FILE_LIMITS.maxFileBytes)}` : `File exceeds the ${fmtBytes(FILE_LIMITS.maxFileBytes)} upload limit.`;
  if (f.bytes === 0) return lang === "lo" ? "ໄຟລ໌ຫວ່າງເປົ່າ" : "File is empty.";
  return null;
}

/** Keep the File itself until the server acknowledges the upload. */
export function useLocalFile() {
  const [file, setFile] = useState<FileSel | null>(null);
  const pick = (f: File | undefined) => setFile(f ? { name: f.name, bytes: f.size, mimeType: f.type || "application/octet-stream", blob:f } : null);
  return { file, pick, reset: () => setFile(null) };
}

export function RegisterDocumentDialog({ open, onOpenChange, defaultFolderId }: { open: boolean; onOpenChange: (o: boolean) => void; defaultFolderId: string | null }) {
  const { t, lang } = useI18n(); const d = useData(); const me = useMe(); const svc = useService(); const nav = useNavigate();
  const {pending}=useNetwork();
  const [step, setStep] = useState<"form" | "review">("form");
  const [f, setF] = useState({ direction: "incoming" as Direction, title: "", registryNo: "", externalNo: "", companyId: "", folderId: defaultFolderId ?? "", dept: me.departmentId, issueDate: "", moveDate: "", counterparty: "", reference: "" });
  const { file, pick, reset } = useLocalFile();
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setStep("form"); setErrors({}); setF((x) => { const folder = d.folders.find(folder => folder.id === defaultFolderId); const dept = folder && svc.getConfig()?.departments.some(dep => dep.id === folder.departmentId && dep.canCreate) ? folder.departmentId! : me.departmentId; return { ...x, folderId: folder?.departmentId === dept ? folder.id : "", dept }; }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const needsMove = f.direction !== "internal";
  const req = lang === "lo" ? "ຈຳເປັນ" : "Required";
  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = req;
    if (!f.registryNo.trim()) e.registryNo = req; else if (d.documents.some((x) => x.registryNo === f.registryNo.trim())) e.registryNo = lang === "lo" ? "ເລກທະບຽນນີ້ມີແລ້ວ" : "This registry number already exists.";
    if (!f.issueDate) e.issueDate = req;
    if (needsMove && !f.moveDate) e.moveDate = req;
    if (needsMove && !f.counterparty.trim()) e.counterparty = req;
    if (needsMove && f.moveDate && f.issueDate && f.moveDate < f.issueDate) e.moveDate = lang === "lo" ? "ບໍ່ສາມາດກ່ອນວັນທີອອກ" : "Cannot be before the issue date.";
    if (!file) e.file = req; else { const fe = validateFile(file, lang); if (fe) e.file = fe; }
    setErrors(e); return Object.keys(e).length === 0;
  };
  const submit = async () => {
    if(pending)return;
    const r = await svc.registerDocument({ direction: f.direction, title: f.title, registryNo: f.registryNo, externalNo: f.externalNo, companyId: f.companyId, folderId: f.folderId, owningDepartmentId: f.dept, issueDate: f.issueDate,
      movement: needsMove ? { occurredOn: f.moveDate, counterparty: f.counterparty, reference: f.reference } : undefined, file: { ...file! } }, me.id);
    if (r.ok) { reset();setF({ direction: "incoming", title: "", registryNo: "", externalNo: "", companyId: "", folderId: "", dept: me.departmentId, issueDate: "", moveDate: "", counterparty: "", reference: "" });onOpenChange(false); nav({ to: "/documents/$id", params: { id: r.value } }); }
    else { setErrors({ registryNo: t(r.error as 'REQUEST_FAILED')??t('error_hint') }); setStep("form"); }
  };
  const moveLabel = f.direction === "outgoing" ? t("dispatch_date") : t("receipt_date");
  return (
    <Dialog open={open} onOpenChange={o=>!pending&&onOpenChange(o)} wide title={t("register")} description={lang === "lo" ? "ບັນທຶກເອກະສານແລະໄຟລ໌ໃນລະບົບ. ໄຟລ໌ຕ້ອງຜ່ານການສະແກນກ່ອນເປີດເບິ່ງ." : "Save the document and file to the server. Files must pass scanning before preview or download."}
      footer={step === "form" ? <><Button onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button variant="primary" onClick={() => validate() && setStep("review")}>{t("review")}</Button></>
        : step === "review" ? <><Button disabled={pending} onClick={() => setStep("form")}>{t("back")}</Button><Button pending={pending} variant="primary" onClick={submit}>{t("submit")}</Button></> : undefined}>
      {step === "form" && (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
          <div className="sm:col-span-2"><p className="t-label text-fg-2 mb-1">{t("direction")}</p>
            <SegmentedControl label={t("direction")} value={f.direction} onChange={(v) => set("direction", v)} options={(["incoming", "outgoing", "internal"] as const).map((v) => ({ value: v, label: t(`dir_${v}`) }))} /></div>
          <div className="sm:col-span-2"><Field label={t("title")} required error={errors.title}>{(id, db) => <Input id={id} aria-describedby={db} aria-invalid={!!errors.title} maxLength={200} value={f.title} onChange={(e) => set("title", e.target.value)} />}</Field></div>
          <Field label={t("registry_no")} required error={errors.registryNo} hint="REG-2026-0900">{(id, db) => <Input id={id} aria-describedby={db} aria-invalid={!!errors.registryNo} maxLength={100} value={f.registryNo} onChange={(e) => set("registryNo", e.target.value)} />}</Field>
          <Field label={t("external_no")}>{(id) => <Input id={id} maxLength={200} value={f.externalNo} onChange={(e) => set("externalNo", e.target.value)} />}</Field>
          <Field label={t("company")}>{(id) => <Select id={id} value={f.companyId} onChange={(e) => set("companyId", e.target.value)}><option value="">—</option>{d.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
          <Field label={t("folder")}>{(id) => <Select id={id} value={f.folderId} onChange={(e) => set("folderId", e.target.value)}><option value="">{t('root')}</option>{folderOptions(d.folders.filter(folder=>folder.departmentId===f.dept)).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</Select>}</Field>
          <Field label={t("owning_dept")} required>{(id) => <Select id={id} value={f.dept} onChange={(e) => setF(x=>({...x,dept:e.target.value,folderId:''}))}>{svc.getConfig()?.departments.filter(x=>x.canCreate).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</Field>
          <Field label={t("issue_date")} required error={errors.issueDate}>{(id, db) => <Input id={id} type="date" aria-describedby={db} aria-invalid={!!errors.issueDate} value={f.issueDate} onChange={(e) => set("issueDate", e.target.value)} />}</Field>
          {needsMove && <>
            <Field label={moveLabel} required error={errors.moveDate}>{(id, db) => <Input id={id} type="date" aria-describedby={db} aria-invalid={!!errors.moveDate} value={f.moveDate} onChange={(e) => set("moveDate", e.target.value)} />}</Field>
            <Field label={t("counterparty")} required error={errors.counterparty}>{(id, db) => <Input id={id} aria-describedby={db} aria-invalid={!!errors.counterparty} maxLength={200} value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} />}</Field>
            <Field label={t("reference")}>{(id) => <Input id={id} maxLength={200} value={f.reference} onChange={(e) => set("reference", e.target.value)} />}</Field>
          </>}
          <div className="sm:col-span-2"><Field label={lang === "lo" ? "ໄຟລ໌" : "File"} required error={errors.file} hint={`${FILE_LIMITS.allowedExtensions.join(", ")} · ≤ ${fmtBytes(FILE_LIMITS.maxFileBytes)}`}>
            {(id, db) => <Input id={id} type="file" aria-describedby={db} aria-invalid={!!errors.file} className="py-2 h-auto" onChange={(e) => pick(e.target.files?.[0])} />}</Field>
            {file && <p className="mt-1 t-caption text-fg-2 break-all">{file.name} · {fmtBytes(file.bytes)} <button type="button" className="underline ml-2" onClick={reset}>{t("remove")}</button></p>}</div>
        </form>
      )}
      {step === "review" && (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 t-body">
          {[[t("direction"), t(`dir_${f.direction}`)], [t("title"), f.title], [t("registry_no"), f.registryNo], [t("external_no"), f.externalNo || "—"], [t("company"), d.companies.find((c) => c.id === f.companyId)?.name ?? "—"], [t("folder"), d.folders.find((x) => x.id === f.folderId)?.name ?? ""], [t("issue_date"), fmtDate(f.issueDate, lang)], ...(needsMove ? [[moveLabel, fmtDate(f.moveDate, lang)], [t("counterparty"), f.counterparty]] : []), [lang === "lo" ? "ໄຟລ໌" : "File", `${file?.name} (${fmtBytes(file?.bytes ?? 0)})`]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="t-caption text-fg-2">{k}</dt><dd className="break-words">{v}</dd></div>))}
        </dl>
      )}
    </Dialog>
  );
}
