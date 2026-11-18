/** Normalized domain model shared by demo and future HTTP adapters. */
export type ID = string;
/** Date-only value printed on paper or agreed in business: "YYYY-MM-DD". */
export type DateOnly = string;
/** Event timestamp with timezone offset, ISO 8601: "2026-11-09T10:12:00+07:00". */
export type Timestamp = string;

export type Direction = "incoming" | "outgoing" | "internal";
export type ScanState = "pending" | "scanning" | "available" | "rejected" | "failed";
export type Permission = "view" | "edit" | "manage" | "download" | "comment";
export type TaskState = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type Priority = "low" | "normal" | "high" | "urgent";
export type SystemRole = "member" | "admin";

export interface Department { id: ID; name: string; nameLo: string; reportsTo: "ceo" | "cfo" | "board"; collaboratesWith: ID[] | "all"; }
export interface User { id: ID; name: string; title: string; departmentId: ID; executive?: "CEO" | "CFO"; systemRole: SystemRole; username: string; disabled?: boolean; }
export interface Folder { id: ID; name: string; parentId: ID | null; departmentId?: string; revision?: number; canManage?: boolean; }
export interface Tag { id: ID; name: string; }
export interface Document {
  id: ID; title: string; registryNo: string; externalNo?: string; direction: Direction;
  folderId: ID; tagIds: ID[]; companyId?: ID; ownerId: ID; owningDepartmentId: ID;
  issueDate?: DateOnly; registeredAt: Timestamp; registeredById: ID;
  revision?: number;
  permissions?: {view:boolean;edit:boolean;manageAccess:boolean;download:boolean;comment:boolean};
  links?: {linkId:string;id:string;kind:string;title:string;href:string}[];
}
export interface DocumentVersion { id: ID; documentId: ID; versionNumber: number; filename: string; bytes: number; mimeType: string; uploadedAt: Timestamp; uploadedById: ID; scanState: ScanState; sampleUrl?: string; downloadUrl?: string; scanError?: string; note?: string; }
export interface DocumentMovement { id: ID; documentId: ID; direction: "receipt" | "dispatch"; occurredOn: DateOnly; counterparty: string; reference?: string; notes?: string; recordedAt: Timestamp; }
export interface ResourceGrant { id: ID; resourceType: "document"; resourceId: ID; subjectType: "user" | "department"; subjectId: ID; permission: Permission; }
export interface Comment { id: ID; authorId: ID; body: string; at: Timestamp; }
export interface Task {
  id: ID; title: string; description: string; state: TaskState; priority: Priority;
  assigneeId: ID; collaboratorIds: ID[]; owningDepartmentId: ID; dueDate?: DateOnly;
  companyId?: ID; documentIds: ID[]; comments: Comment[]; createdAt: Timestamp; createdById: ID;
}
export type Mention = { kind: "user"; id: ID } | { kind: "department"; id: ID } | { kind: "role"; role: "CEO" | "CFO" };
export interface Post { id: ID; authorId: ID; body: string; at: Timestamp; visibility: { kind: "company" } | { kind: "department"; id: ID }; mentions: Mention[]; taskIds: ID[]; documentIds: ID[]; comments: Comment[]; }
export interface Company { id: ID; name: string; industry: string; relationshipOwnerId: ID; city: string; }
export interface Contact { id: ID; companyId: ID; name: string; role: string; phone: string; email: string; }
export interface Interaction {
  id: ID; companyId: ID; type: "visit" | "call" | "meeting" | "email";
  occurredOn: DateOnly; occurredTime?: string; recordedAt: Timestamp; recordedById: ID;
  title: string; participantIds: ID[]; contactIds: ID[]; discussion: string; decisions: string; nextSteps: string;
  documentIds: ID[]; taskIds: ID[];
}
export interface Notification { id: ID; userId: ID; kind: "mention" | "assignment" | "comment" | "deadline"; at: Timestamp; read: boolean; actorId?: ID; target: { type: "task" | "document" | "post"; id: ID }; }
export interface HistoryEvent { id: ID; resourceType: "document" | "task" | "folder"; resourceId: ID; actorId: ID; at: Timestamp; action: string; detail?: string; }

export interface PortalData {
  users: User[]; departments: Department[]; folders: Folder[]; tags: Tag[];
  documents: Document[]; versions: DocumentVersion[]; movements: DocumentMovement[]; grants: ResourceGrant[];
  tasks: Task[]; posts: Post[]; companies: Company[]; contacts: Contact[]; interactions: Interaction[];
  notifications: Notification[]; history: HistoryEvent[];
}

export interface FixtureLimits { maxFileBytes: number; allowedExtensions: string[]; }
