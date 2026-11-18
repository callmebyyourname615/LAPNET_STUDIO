import { Link } from "@/features/document-workspace/router";
import { MoreHorizontal } from "lucide-react";
import type { DocRow } from "@/features/document-workspace/lib/domain/doc-query";
import { latestMovement } from "@/features/document-workspace/lib/domain/doc-query";
import { fmtDate, fmtStamp } from "@/features/document-workspace/lib/format";
import { useI18n } from "@/features/document-workspace/lib/i18n";
import { useData } from "@/features/document-workspace/lib/portal";
import { cn } from "@/features/document-workspace/lib/utils";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/features/document-workspace/components/portal/ui";
import { DirectionLabel, FileStateBadge, FileTypeIcon } from "./parts";

type Props = { rows: DocRow[]; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void; full: boolean; onMove: (id: string) => void };

function MovementCell({ docId }: { docId: string }) {
  const d = useData(); const { t, lang } = useI18n(); const m = latestMovement(d, docId);
  if (!m) return <span className="meta text-fg-3">—</span>;
  return <span className="whitespace-nowrap"><span className="meta text-fg-3">{m.direction === "receipt" ? t("received") : t("dispatched")}: </span>{fmtDate(m.occurredOn, lang)}</span>;
}

export function DocumentTable({ rows, selected, onToggle, onToggleAll, full, onMove }: Props) {
  const d = useData(); const { t, lang } = useI18n();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.doc.id));
  const th = "px-3 py-2 text-left t-caption font-medium text-fg-2 whitespace-nowrap";
  return (
    <div className={cn("doc-table-wrap overflow-x-auto rounded-lg border border-line bg-surface", full && "max-h-[70vh] overflow-auto")} role="region" aria-label={t("recent")} tabIndex={0}>
      <table className={cn("w-full border-collapse t-body", full ? "min-w-[1400px]" : "table-fixed")}>
        <thead className={cn("border-b border-line", full && "sticky top-0 bg-surface z-[1]")}>
          <tr>
            <th className="w-10 px-3"><input type="checkbox" aria-label="Select all" checked={all} onChange={onToggleAll} className="size-4 accent-[var(--color-accent)]" /></th>
            <th className={cn(th, !full && "w-[40%]")}>{t("col_title")}</th>
            <th className={th}>{t("col_company")}</th>
            {full && <th className={th}>{t("registry_no")}</th>}
            {full && <th className={th}>{t("external_no")}</th>}
            <th className={th}>{t("col_owner")}</th>
            {full && <th className={th}>{t("col_direction")}</th>}
            {full && <th className={th}>{t("col_issue")}</th>}
            {full && <th className={th}>{t("col_movement")}</th>}
            {full && <th className={th}>{t("col_version")}</th>}
            <th className={th}>{t("col_scan")}</th>
            <th className={th}>{t("col_uploaded")}</th>
            <th className="w-12 px-3"><span className="sr-only">{t("col_actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ doc, latestState, uploadedAt, versionNumber, filename }) => {
            const company = d.companies.find((c) => c.id === doc.companyId);
            const owner = d.users.find((u) => u.id === doc.ownerId);
            const sel = selected.has(doc.id);
            return (
              <tr key={doc.id} className={cn("hover-row h-row border-b border-line last:border-0 hover:bg-hover", sel && "bg-raised")} aria-selected={sel}>
                <td className="px-3"><input type="checkbox" aria-label={`Select ${doc.title}`} checked={sel} onChange={() => onToggle(doc.id)} className="size-4 accent-[var(--color-accent)]" /></td>
                <td className="px-3 py-2 min-w-0">
                  <div className="flex min-w-0 items-center gap-2"><FileTypeIcon filename={filename} />
                    <div className="min-w-0"><Link to="/documents/$id" params={{ id: doc.id }} className="block truncate t-label hover:underline" title={doc.title}>{doc.title}</Link>
                      <span className="meta block truncate t-caption text-fg-3" title={filename}>{full ? filename : `${doc.registryNo} · ${filename}`}</span></div></div>
                </td>
                <td className="px-3"><span className="block truncate">{company ? <Link to="/companies/$id" params={{ id: company.id }} className="hover:underline">{company.name}</Link> : <span className="meta text-fg-3">—</span>}</span></td>
                {full && <td className="px-3 font-mono t-caption whitespace-nowrap">{doc.registryNo}</td>}
                {full && <td className="px-3 font-mono t-caption whitespace-nowrap">{doc.externalNo ?? "—"}</td>}
                <td className="px-3"><span className="block truncate">{owner?.name}</span></td>
                {full && <td className="px-3"><DirectionLabel dir={doc.direction} /></td>}
                {full && <td className="px-3 whitespace-nowrap">{fmtDate(doc.issueDate, lang)}</td>}
                {full && <td className="px-3"><MovementCell docId={doc.id} /></td>}
                {full && <td className="px-3">v{versionNumber}</td>}
                <td className="px-3">{latestState && <FileStateBadge state={latestState} />}</td>
                <td className="meta px-3 t-caption text-fg-3 whitespace-nowrap">{fmtStamp(uploadedAt, lang)}</td>
                <td className="px-3">
                  <Menu><MenuTrigger asChild><button type="button" aria-label={`${t("col_actions")}: ${doc.title}`} className="grid size-ctl-sm place-items-center rounded-md hover:bg-raised"><MoreHorizontal className="size-4" /></button></MenuTrigger>
                    <MenuContent><Link to="/documents/$id" params={{ id: doc.id }} className="flex min-h-ctl-sm items-center rounded-sm px-2 t-body hover:bg-hover">{t("open")}</Link><MenuItem disabled={!doc.permissions?.edit} onSelect={() => onMove(doc.id)}>{t("move_to")}</MenuItem></MenuContent></Menu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function DocumentMobileRow({ row, selected, onToggle }: { row: DocRow; selected: boolean; onToggle: () => void }) {
  const d = useData(); const { t, lang } = useI18n(); const { doc, latestState } = row;
  const company = d.companies.find((c) => c.id === doc.companyId); const m = latestMovement(d, doc.id);
  return (
    <li className={cn("hover-row flex gap-3 border-b border-line p-3 last:border-0", selected && "bg-raised")}>
      <input type="checkbox" aria-label={`Select ${doc.title}`} checked={selected} onChange={onToggle} className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]" />
      <div className="min-w-0 flex-1">
        <Link to="/documents/$id" params={{ id: doc.id }} className="block t-label break-words hover:underline">{doc.title}</Link>
        <p className="meta t-caption text-fg-3 font-mono">{doc.registryNo}</p>
        <p className="t-caption text-fg-2 mt-1 truncate">{company?.name ?? "—"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 t-caption"><DirectionLabel dir={doc.direction} />{latestState && <FileStateBadge state={latestState} />}
          <span className="text-fg-2">{m ? `${m.direction === "receipt" ? t("received") : t("dispatched")}: ${fmtDate(m.occurredOn, lang)}` : `${t("col_issue")}: ${fmtDate(doc.issueDate, lang)}`}</span></div>
      </div>
    </li>
  );
}

export function DocumentGrid({ rows, selected, onToggle }: { rows: DocRow[]; selected: Set<string>; onToggle: (id: string) => void }) {
  const d = useData(); const { lang } = useI18n();
  return (
    <ul className="folder-grid">
      {rows.map(({ doc, latestState, filename, uploadedAt }) => (
        <li key={doc.id} className={cn("hover-row relative flex flex-col gap-2 rounded-[var(--docs-card-radius)] border border-line bg-surface p-4 hover:bg-hover", selected.has(doc.id) && "bg-raised")}>
          <div className="flex items-start justify-between gap-2"><FileTypeIcon filename={filename} className="size-8" /><input type="checkbox" aria-label={`Select ${doc.title}`} checked={selected.has(doc.id)} onChange={() => onToggle(doc.id)} className="size-4 accent-[var(--color-accent)]" /></div>
          <Link to="/documents/$id" params={{ id: doc.id }} className="t-label line-clamp-2 break-words hover:underline">{doc.title}</Link>
          <p className="meta t-caption text-fg-3 truncate">{d.companies.find((c) => c.id === doc.companyId)?.name ?? doc.registryNo}</p>
          <div className="mt-auto flex flex-wrap items-center gap-2">{latestState && <FileStateBadge state={latestState} />}<span className="meta t-caption text-fg-3">{fmtStamp(uploadedAt, lang).split(",")[0]}</span></div>
        </li>
      ))}
    </ul>
  );
}
