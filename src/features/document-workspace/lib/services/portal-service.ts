import type {
  Direction,
  DocumentMovement,
  Permission,
  PortalData,
} from "@/features/document-workspace/lib/domain/types";
import type { DocumentWorkspaceConfig } from "@lapnet/contracts";

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
type PendingResult<T = void> = Result<T> | Promise<Result<T>>;

export interface RegisterDocumentInput {
  direction: Direction;
  title: string;
  registryNo: string;
  externalNo?: string;
  companyId?: string;
  folderId: string;
  owningDepartmentId: string;
  issueDate?: string;
  movement?: { occurredOn: string; counterparty: string; reference?: string };
  file: { name: string; bytes: number; mimeType: string; localUrl?: string; blob?: File };
}

export type NetworkState = {
  state: "loading" | "ready" | "error";
  error: string;
  pending: boolean;
  detailId: string | null;
  detailLoading: boolean;
};
/** Authenticated HTTP boundary for the document workspace. */
export interface PortalService {
  dispose(): void;
  subscribe(fn: () => void): () => void;
  getSnapshot(): PortalData;
  getNetworkSnapshot(): NetworkState;
  getConfig(): DocumentWorkspaceConfig | null;
  load(): Promise<Result>;
  loadDocument(id: string): Promise<Result>;
  createFolder(name: string, parentId: string | null, actorId: string): PendingResult<string>;
  renameFolder(id: string, name: string, actorId: string): PendingResult;
  moveFolder(id: string, parentId: string | null, actorId: string): PendingResult;
  deleteFolder(id: string, confirmationName: string, actorId: string): PendingResult;
  moveDocument(id: string, folderId: string, actorId: string): PendingResult;
  registerDocument(input: RegisterDocumentInput, actorId: string): PendingResult<string>;
  addVersion(
    documentId: string,
    file: RegisterDocumentInput["file"],
    note: string,
    actorId: string,
  ): PendingResult;
  retryScan(versionId: string, actorId: string): PendingResult;
  addMovement(m: Omit<DocumentMovement, "id" | "recordedAt">, actorId: string): PendingResult;
  setTags(documentId: string, tagIds: string[], actorId: string): PendingResult;
  addGrant(
    documentId: string,
    subjectType: "user" | "department",
    subjectId: string,
    permission: Permission,
    actorId: string,
  ): PendingResult;
  removeGrant(grantId: string, actorId: string): PendingResult;
  unlinkDocument(linkId: string, documentId: string, actorId: string): PendingResult;
}
