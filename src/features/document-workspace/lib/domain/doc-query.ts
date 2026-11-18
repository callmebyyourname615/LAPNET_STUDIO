import { descendantIds, latestVersion, movementsOf, visibleDocs } from "./selectors";
import type { Direction, Document, PortalData, ScanState, User } from "./types";

export type DocSort = "uploaded" | "issue" | "title" | "registry";
export interface DocSearch { q?: string; dir?: string; company?: string; dept?: string; state?: string; tag?: string; sort?: string; view?: string; mode?: string; limit?: number; }

export function parseDocSearch(s: Record<string, unknown>): DocSearch {
  const str = (k: string) => (typeof s[k] === "string" && s[k] ? (s[k] as string) : undefined);
  const lim = Number(s.limit);
  return { q: str("q"), dir: str("dir"), company: str("company"), dept: str("dept"), state: str("state"), tag: str("tag"), sort: str("sort"), view: str("view"), mode: str("mode"), limit: Number.isFinite(lim) && lim > 0 ? lim : undefined };
}

export interface DocRow { doc: Document; latestState: ScanState | undefined; uploadedAt: string; versionNumber: number; filename: string; }

export function queryDocuments(d: PortalData, u: User, folderId: string | null, s: DocSearch): DocRow[] {
  let docs = visibleDocs(d, u);
  if (folderId) { const ids = descendantIds(d.folders, folderId); docs = docs.filter((x) => ids.has(x.folderId)); }
  const q = s.q?.trim().toLowerCase();
  if (q) docs = docs.filter((x) => {
    const company = d.companies.find((c) => c.id === x.companyId)?.name ?? "";
    const files = d.versions.filter((v) => v.documentId === x.id).map((v) => v.filename).join(" ");
    return [x.title, x.registryNo, x.externalNo ?? "", company, files].some((f) => f.toLowerCase().includes(q));
  });
  if (s.dir) docs = docs.filter((x) => x.direction === (s.dir as Direction));
  if (s.company) docs = docs.filter((x) => x.companyId === s.company);
  if (s.dept) docs = docs.filter((x) => x.owningDepartmentId === s.dept);
  if (s.tag) docs = docs.filter((x) => x.tagIds.includes(s.tag!));
  let rows: DocRow[] = docs.map((doc) => { const v = latestVersion(d, doc.id); return { doc, latestState: v?.scanState, uploadedAt: v?.uploadedAt ?? doc.registeredAt, versionNumber: v?.versionNumber ?? 0, filename: v?.filename ?? "" }; });
  if (s.state) rows = rows.filter((r) => r.latestState === s.state);
  const sort = (s.sort ?? "uploaded") as DocSort;
  const cmp: Record<DocSort, (a: DocRow, b: DocRow) => number> = {
    uploaded: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
    issue: (a, b) => (b.doc.issueDate ?? "").localeCompare(a.doc.issueDate ?? ""),
    title: (a, b) => a.doc.title.localeCompare(b.doc.title),
    registry: (a, b) => a.doc.registryNo.localeCompare(b.doc.registryNo),
  };
  // Stable tie-break on registry number.
  return rows.sort((a, b) => (cmp[sort] ?? cmp.uploaded)(a, b) || a.doc.registryNo.localeCompare(b.doc.registryNo));
}
export const latestMovement = (d: PortalData, docId: string) => movementsOf(d, docId)[0];
