import { DEMO_TODAY } from "./clock";
import type { Document, DocumentVersion, Folder, PortalData, Permission, Task, User } from "./types";

const rank: Record<Permission, number> = { view: 1, comment: 1, download: 1, edit: 2, manage: 3 };

/** Demo visibility policy. Used consistently everywhere. Real enforcement belongs to the NestJS API. */
export function docPermission(d: PortalData, doc: Document, user: User): Permission | null {
  if (doc.permissions) return !doc.permissions.view ? null : doc.permissions.manageAccess ? 'manage' : doc.permissions.edit ? 'edit' : 'view';
  if (doc.ownerId === user.id) return "manage";
  let best: Permission | null = doc.owningDepartmentId === user.departmentId ? "edit" : null;
  for (const g of d.grants) {
    if (g.resourceId !== doc.id) continue;
    const hit = (g.subjectType === "user" && g.subjectId === user.id) || (g.subjectType === "department" && g.subjectId === user.departmentId);
    if (hit && (!best || rank[g.permission] > rank[best])) best = g.permission;
  }
  return best;
}
export const canSee = (d: PortalData, doc: Document, u: User) => docPermission(d, doc, u) !== null;
export const visibleDocs = (d: PortalData, u: User) => d.documents.filter((x) => canSee(d, x, u));
export function findVisibleDoc(d: PortalData, id: string, u: User) { const doc = d.documents.find((x) => x.id === id); return doc && canSee(d, doc, u) ? doc : undefined; }

export const versionsOf = (d: PortalData, docId: string) => d.versions.filter((v) => v.documentId === docId).sort((a, b) => b.versionNumber - a.versionNumber);
/** Current = newest version that is Available. A pending newer version never replaces it. */
export const currentVersion = (d: PortalData, docId: string): DocumentVersion | undefined => versionsOf(d, docId).find((v) => v.scanState === "available");
export const latestVersion = (d: PortalData, docId: string): DocumentVersion | undefined => versionsOf(d, docId)[0];
export const movementsOf = (d: PortalData, docId: string) => d.movements.filter((m) => m.documentId === docId).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.recordedAt.localeCompare(a.recordedAt));
export const isProcessing = (d: PortalData, docId: string) => { const v = latestVersion(d, docId); return !!v && (v.scanState === "pending" || v.scanState === "scanning"); };

export function descendantIds(folders: Folder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) { grew = false; for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; } }
  return out;
}
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const path: Folder[] = []; let cur = folders.find((f) => f.id === id);
  while (cur) { path.unshift(cur); cur = folders.find((f) => f.id === cur!.parentId); }
  return path;
}
/** Count = accessible document records (not versions) in folder and descendants. */
export function folderCount(d: PortalData, u: User, id: string, docs = visibleDocs(d, u)) {
  const ids = descendantIds(d.folders, id); return docs.filter((x) => ids.has(x.folderId)).length;
}
export function wouldCycle(folders: Folder[], id: string, newParent: string | null) { return newParent !== null && descendantIds(folders, id).has(newParent); }

export const ACTIVE: Task["state"][] = ["todo", "in_progress", "blocked"];
export const isOpen = (t: Task) => ACTIVE.includes(t.state);
export const isOverdue = (t: Task, today = DEMO_TODAY) => isOpen(t) && !!t.dueDate && t.dueDate < today;
export const isDueToday = (t: Task, today = DEMO_TODAY) => isOpen(t) && t.dueDate === today;
export const visibleTasks = (d: PortalData, u: User) => d.tasks.filter((t) => t.assigneeId === u.id || t.collaboratorIds.includes(u.id) || t.createdById === u.id || t.owningDepartmentId === u.departmentId);
export const myTasks = (d: PortalData, u: User) => d.tasks.filter((t) => t.assigneeId === u.id || t.collaboratorIds.includes(u.id));

export function dashboardTotals(d: PortalData, u: User) {
  const mine = myTasks(d, u);
  return {
    open: mine.filter(isOpen).length,
    dueToday: mine.filter((t) => isDueToday(t)).length,
    overdue: mine.filter((t) => isOverdue(t)).length,
    processing: visibleDocs(d, u).filter((x) => isProcessing(d, x.id)).length,
  };
}
