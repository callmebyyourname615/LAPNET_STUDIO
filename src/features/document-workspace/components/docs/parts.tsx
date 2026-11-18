import { useEffect, useMemo, useRef, useState } from "react";
import GlassFolder, { hashString, type ArtPreset } from "@/components/ui/glass-folder-cards";
import { useData, useMe } from "../../lib/portal";
import { queryDocuments } from "../../lib/domain/doc-query";
import { useFolderActions } from "./folders";
import { useNavigate } from "../../router";
import { Link } from "@/features/document-workspace/router";
import { AlertOctagon, ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronRight, Clock, File, FileArchive, FileImage, FileSpreadsheet, FileText, Loader2, RefreshCw, ShieldX, Repeat } from "lucide-react";
import type { Direction, Folder, ScanState } from "@/features/document-workspace/lib/domain/types";
import { extOf } from "@/features/document-workspace/lib/format";
import { useI18n } from "@/features/document-workspace/lib/i18n";
import { Badge, type Tone } from "@/features/document-workspace/components/portal/ui";

export function FileTypeIcon({ filename, className = "size-icon" }: { filename: string; className?: string }) {
  const e = extOf(filename);
  const I = ["xlsx", "xls", "csv"].includes(e) ? FileSpreadsheet : ["jpg", "png", "jpeg"].includes(e) ? FileImage : e === "zip" ? FileArchive : ["pdf", "docx", "txt"].includes(e) ? FileText : File;
  return <I className={`${className} shrink-0 text-fg-2`} aria-label={e ? e.toUpperCase() : "file"} />;
}

const scanMeta: Record<ScanState, { tone: Tone; icon: typeof Clock }> = {
  pending: { tone: "warn", icon: Clock }, scanning: { tone: "info", icon: Loader2 }, available: { tone: "ok", icon: CheckCircle2 },
  rejected: { tone: "danger", icon: ShieldX }, failed: { tone: "danger", icon: AlertOctagon },
};
export function FileStateBadge({ state }: { state: ScanState }) {
  const { t } = useI18n(); const m = scanMeta[state];
  return <Badge tone={m.tone} icon={m.icon}>{t(`scan_${state}` as const)}</Badge>;
}
export function DirectionLabel({ dir }: { dir: Direction }) {
  const { t } = useI18n(); const I = dir === "incoming" ? ArrowDownLeft : dir === "outgoing" ? ArrowUpRight : Repeat;
  return <span className="inline-flex items-center gap-1 whitespace-nowrap"><I className="size-4 text-fg-3" aria-hidden />{t(`dir_${dir}` as const)}</span>;
}
export { RefreshCw };

/** Glass folder uses only visible workspace records; management reuses the existing forms. */
export function FolderCard({ folder, count, onOpen }: { folder: Folder; count: number; onOpen: () => void }) {
  const { t, lang } = useI18n(); const data = useData(); const me = useMe(); const nav = useNavigate();
  const { open: manageFolder } = useFolderActions();
  const container = useRef<HTMLDivElement>(null); const [width, setWidth] = useState(256);
  const rows = useMemo(() => queryDocuments(data, me, folder.id, { sort: "uploaded" }).reverse(), [data, me, folder.id]);
  const files = useMemo(() => rows.map(row => ({ name: row.doc.title, meta: "v" + row.versionNumber })), [rows]);
  useEffect(() => {
    const node = container.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.min(280, Math.max(1, Math.floor(entry.contentRect.width)))));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const presets: ArtPreset[] = ["aurora", "ember", "dusk", "glacier", "verdant"];
  const viewFolder = lang === "lo" ? "ເບິ່ງໂຟນເດີ" : "View folder";
  return <div ref={container} className="document-glass-folder" data-folder-id={folder.id}>
    <GlassFolder key={folder.id + ":" + rows.map(row => row.doc.id).join(",")} label={folder.name} meta={t("documents_count", { n: count })} tone="dark"
      art={presets[hashString(folder.id) % presets.length]} seed={hashString(folder.id) % 997} width={width} files={files} action="more" appear={false}
      labels={{ open: t("open"), close: t("close"), items: t("nav_documents"), contents: t("nav_documents"), options: t("col_actions"), add: t("register") }}
      onFileSelect={(_file, index) => nav({ to: "/documents/$id", params: { id: rows[index].doc.id } })}
      menu={[{ label: viewFolder, onSelect: onOpen }, ...(folder.canManage ? [{ label: t("rename"), onSelect: () => manageFolder({ mode: "rename", folderId: folder.id }) }, { label: t("move_to"), onSelect: () => manageFolder({ mode: "move", folderId: folder.id }) }, { label: t("delete"), danger: true, onSelect: () => manageFolder({ mode: "delete", folderId: folder.id }) }] : [])]} />
    <button type="button" className="document-glass-folder-link" aria-label={viewFolder + ": " + folder.name} onClick={onOpen}>{viewFolder}<ArrowUpRight size={15} aria-hidden="true" /></button>
  </div>;
}

export function Breadcrumbs({ path }: { path: Folder[] }) {
  const { t } = useI18n();
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 t-label text-fg-2">
        <li className="shrink-0"><Link to="/documents" className="rounded-sm hover:text-fg">{t("all_documents")}</Link></li>
        {path.map((f, i) => (
          <li key={f.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
            {i === path.length - 1 ? <span aria-current="page" className="truncate text-fg">{f.name}</span>
              : <Link to="/documents/folders/$folderId" params={{ folderId: f.id }} className="truncate rounded-sm hover:text-fg">{f.name}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
