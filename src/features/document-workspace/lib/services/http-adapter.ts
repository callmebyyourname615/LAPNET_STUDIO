import { ApiError, apiRequest, uploadFile } from "@/lib/api";
import {
  documentWorkspaceConfigSchema,
  workspaceDocumentPageSchema,
  workspaceDocumentDetailSchema,
  type DocumentWorkspaceConfig,
  type WorkspaceDocument,
  type WorkspaceDocumentDetail,
} from "@lapnet/contracts";
import type { Document, DocumentVersion, PortalData } from "../domain/types";
import type { NetworkState, PortalService, Result } from "./portal-service";

const root = "/api/v1/document-workspace";
const empty = (): PortalData => ({
  users: [],
  departments: [],
  folders: [],
  tags: [],
  documents: [],
  versions: [],
  movements: [],
  grants: [],
  tasks: [],
  posts: [],
  companies: [],
  contacts: [],
  interactions: [],
  notifications: [],
  history: [],
});
const errorCode = (error: unknown) =>
  error instanceof ApiError
    ? error.status === 409
      ? "CONFLICT"
      : error.status === 403
        ? "ACCESS_DENIED"
        : error.status === 413
          ? "PAYLOAD_TOO_LARGE"
          : error.status === 400
            ? "VALIDATION_FAILED"
            : error.status === 404
              ? "NOT_FOUND"
              : "REQUEST_FAILED"
    : "REQUEST_FAILED";
export function createHttpPortalService(): PortalService {
  let data = empty(),
    config: DocumentWorkspaceConfig | null = null,
    network: NetworkState = {
      state: "loading",
      error: "",
      pending: false,
      detailId: null,
      detailLoading: false,
    };
  let listRequest: AbortController | null = null,
    detailRequest: AbortController | null = null,
    selected: string | null = null,
    disposed = false;
  const writes = new Set<AbortController>(),
    listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const setNetwork = (patch: Partial<NetworkState>) => {
    network = { ...network, ...patch };
    emit();
  };
  const mapDoc = (row: WorkspaceDocument): Document => ({
    id: row.id,
    title: row.title,
    registryNo: row.registryNumber ?? row.code,
    externalNo: row.data.externalNumber || undefined,
    direction: row.data.direction,
    folderId: row.folderId ?? "",
    tagIds: row.data.tags,
    companyId: row.companyId ?? undefined,
    ownerId: row.owner.id,
    owningDepartmentId: row.department.id,
    issueDate: row.data.issueDate ?? undefined,
    registeredAt: row.createdAt,
    registeredById: row.owner.id,
    revision: row.revision,
    permissions: row.permissions,
  });
  const mapVersions = (row: WorkspaceDocument): DocumentVersion[] =>
    row.versions.map((v) => ({
      id: v.id,
      documentId: row.id,
      versionNumber: v.number,
      filename: v.filename,
      bytes: v.bytes,
      mimeType: v.mime,
      uploadedAt: v.createdAt,
      uploadedById: v.uploadedById ?? row.owner.id,
      scanState:
        v.state === "available"
          ? "available"
          : v.state === "scan_failed"
            ? "failed"
            : v.state === "rejected"
              ? "rejected"
              : "pending",
      scanError: v.scanError ?? undefined,
      note: v.note,
      sampleUrl:
        v.state === "available" && row.permissions.download
          ? `/api/v1/document-versions/${v.id}/preview`
          : undefined,
      downloadUrl:
        v.state === "available" && row.permissions.download
          ? `/api/v1/document-versions/${v.id}/download`
          : undefined,
    }));
  const mapMovements = (row: WorkspaceDocument) =>
    row.movements.map((m) => ({
      id: m.id,
      documentId: row.id,
      direction: m.direction === "incoming" ? ("receipt" as const) : ("dispatch" as const),
      occurredOn: m.occurredOn.slice(0, 10),
      counterparty:
        m.counterpartyName ||
        config?.companies.find((c) => c.id === m.counterpartyId)?.title ||
        "—",
      reference: m.reference,
      notes: m.note,
      recordedAt: m.createdAt,
    }));
  function applyDetail(row: WorkspaceDocumentDetail) {
    data = {
      ...data,
      documents: [
        ...data.documents.filter((d) => d.id !== row.id),
        { ...mapDoc(row), links: row.links },
      ],
      versions: [...data.versions.filter((v) => v.documentId !== row.id), ...mapVersions(row)],
      movements: [...data.movements.filter((m) => m.documentId !== row.id), ...mapMovements(row)],
      grants: [
        ...data.grants.filter((g) => g.resourceId !== row.id),
        ...row.grants.map((g) => ({
          id: g.id,
          resourceType: "document" as const,
          resourceId: row.id,
          subjectType: g.userId ? ("user" as const) : ("department" as const),
          subjectId: g.userId ?? g.departmentId!,
          permission: g.permission === "manage_access" ? ("manage" as const) : g.permission,
        })),
      ],
      history: [
        ...data.history.filter((h) => h.resourceId !== row.id),
        ...row.history.map((h) => ({
          id: h.id,
          resourceType: "document" as const,
          resourceId: row.id,
          actorId: h.actorId,
          at: h.occurredAt,
          action: h.action,
          detail: "v" + h.revision,
        })),
      ],
    };
    emit();
  }
  async function loadDocument(id: string): Promise<Result> {
    selected = id;
    detailRequest?.abort();
    const controller = (detailRequest = new AbortController());
    setNetwork({
      detailId: id || null,
      detailLoading: !!id && (network.detailId !== id || network.detailLoading),
      error: "",
    });
    if (!id) return { ok: true, value: undefined };
    try {
      const row = workspaceDocumentDetailSchema.parse(
        await apiRequest(`${root}/documents/${id}`, "GET", undefined, controller.signal),
      );
      if (controller.signal.aborted || disposed) return { ok: false, error: "ABORTED" };
      applyDetail(row);
      return { ok: true, value: undefined };
    } catch (error) {
      if (controller.signal.aborted || disposed) return { ok: false, error: "ABORTED" };
      const code = errorCode(error);
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        data = {
          ...data,
          documents: data.documents.filter((d) => d.id !== id),
          versions: data.versions.filter((v) => v.documentId !== id),
          grants: data.grants.filter((g) => g.resourceId !== id),
          history: data.history.filter((h) => h.resourceId !== id),
          movements: data.movements.filter((m) => m.documentId !== id),
        };
        emit();
      }
      setNetwork({ error: code });
      return { ok: false, error: code };
    } finally {
      if (!disposed && detailRequest === controller) setNetwork({ detailLoading: false });
    }
  }
  async function load(): Promise<Result> {
    listRequest?.abort();
    const controller = (listRequest = new AbortController());
    try {
      const nextConfig = documentWorkspaceConfigSchema.parse(
        await apiRequest(`${root}/config`, "GET", undefined, controller.signal),
      );
      const rows: WorkspaceDocument[] = [];
      let cursor: string | null = null;
      do {
        const page = workspaceDocumentPageSchema.parse(
          await apiRequest(
            `${root}/documents?limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
            "GET",
            undefined,
            controller.signal,
          ),
        );
        rows.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      if (controller.signal.aborted || disposed) return { ok: false, error: "ABORTED" };
      config = nextConfig;
      data = {
        ...empty(),
        users: config.users.map((u) => ({
          id: u.id,
          name: u.displayName,
          username: "",
          title: "",
          departmentId: "",
          systemRole: "member",
          disabled: u.status !== "active",
        })),
        departments: config.departments.map((d) => ({
          id: d.id,
          name: d.name,
          nameLo: d.name,
          reportsTo: "ceo",
          collaboratesWith: [],
        })),
        folders: config.folders,
        tags: config.tags,
        companies: config.companies.map((c) => ({
          id: c.id,
          name: c.title,
          industry: "",
          relationshipOwnerId: "",
          city: "",
        })),
        documents: rows.map(mapDoc),
        versions: rows.flatMap(mapVersions),
        movements: rows.flatMap(mapMovements),
      };
      setNetwork({ state: "ready", error: "" });
      if (selected) await loadDocument(selected);
      return { ok: true, value: undefined };
    } catch (error) {
      if (controller.signal.aborted || disposed) return { ok: false, error: "ABORTED" };
      const code = errorCode(error);
      setNetwork({ state: config ? "ready" : "error", error: code });
      return { ok: false, error: code };
    }
  }
  async function mutate<T>(write: (signal: AbortSignal) => Promise<T>): Promise<Result<T>> {
    if (network.pending) return { ok: false, error: "PENDING" };
    const controller = new AbortController();
    writes.add(controller);
    setNetwork({ pending: true, error: "" });
    try {
      const value = await write(controller.signal);
      await load();
      return { ok: true, value };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, error: "ABORTED" };
      const code = errorCode(error);
      setNetwork({ error: code });
      return { ok: false, error: code };
    } finally {
      writes.delete(controller);
      if (!disposed) setNetwork({ pending: false });
    }
  }
  const patch = async (id: string, fields: Record<string, unknown>, signal: AbortSignal) => {
    const doc = data.documents.find((d) => d.id === id);
    if (!doc?.revision) throw new Error("Missing document revision");
    await apiRequest(
      `${root}/documents/${id}`,
      "PATCH",
      { revision: doc.revision, ...fields },
      signal,
    );
  };
  const updateFolder = (id: string, fields: Record<string, unknown>) =>
    mutate(async (signal) => {
      await apiRequest(
        `${root}/folders/${id}`,
        "PATCH",
        { revision: data.folders.find((f) => f.id === id)?.revision, ...fields },
        signal,
      );
    });
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: () => data,
    getNetworkSnapshot: () => network,
    getConfig: () => config,
    dispose() {
      disposed = true;
      listRequest?.abort();
      detailRequest?.abort();
      writes.forEach((c) => c.abort());
      listeners.clear();
    },
    load,
    loadDocument,
    createFolder(name, parentId) {
      const departmentId =
        data.folders.find((f) => f.id === parentId)?.departmentId ??
        config?.departments.find((d) => d.canCreate)?.id;
      if (!config?.departments.some((d) => d.id === departmentId && d.canCreate))
        return { ok: false, error: "folder_create_access_required" };
      if (!name.trim()) return { ok: false, error: "name_required" };
      return mutate(async (signal) => {
        const row = await apiRequest<{ id: string }>(
          root + "/folders",
          "POST",
          { name, parentId, departmentId },
          signal,
        );
        return row.id;
      });
    },
    renameFolder(id, name) {
      return updateFolder(id, { name });
    },
    moveFolder(id, parentId) {
      return updateFolder(id, { parentId });
    },
    deleteFolder(id, confirmationName) {
      return mutate(async (signal) => {
        await apiRequest(
          `${root}/folders/${id}`,
          "DELETE",
          { revision: data.folders.find((f) => f.id === id)?.revision, confirmationName },
          signal,
        );
      });
    },
    moveDocument(id, folderId) {
      const doc = data.documents.find((d) => d.id === id);
      if (!doc?.permissions?.edit) return { ok: false, error: "ACCESS_DENIED" };
      if (
        folderId &&
        !data.folders.some((f) => f.id === folderId && f.departmentId === doc.owningDepartmentId)
      )
        return { ok: false, error: "folder_department_mismatch" };
      return mutate((signal) => patch(id, { folderId: folderId || null }, signal));
    },
    registerDocument(input) {
      return mutate(async (signal) => {
        if (!input.file.blob) throw new Error("Missing file");
        const row = (await uploadFile(root + "/register", input.file.blob, {
          signal,
          metadata: {
            title: input.title,
            departmentId: input.owningDepartmentId,
            folderId: input.folderId || null,
            registryNumber: input.registryNo.trim() || null,
            companyId: input.companyId || null,
            data: {
              direction: input.direction,
              externalNumber: input.externalNo ?? "",
              issueDate: input.issueDate || null,
              description: "",
              tags: [],
            },
            ...(input.movement
              ? {
                  movement: {
                    occurredOn: input.movement.occurredOn,
                    counterpartyName: input.movement.counterparty,
                    reference: input.movement.reference ?? "",
                    note: "",
                  },
                }
              : {}),
          },
        })) as { id: string };
        return row.id;
      });
    },
    addVersion(id, file, note) {
      return mutate(async (signal) => {
        if (!file.blob) throw new Error("Missing file");
        await uploadFile(`/api/v1/documents/${id}/versions`, file.blob, { note, signal });
      });
    },
    retryScan(id) {
      return mutate(async (signal) => {
        await apiRequest(`/api/v1/document-versions/${id}/retry`, "POST", {}, signal);
      });
    },
    addMovement(m) {
      return mutate(async (signal) => {
        await apiRequest(
          `/api/v1/documents/${m.documentId}/movements`,
          "POST",
          {
            direction: m.direction === "receipt" ? "incoming" : "outgoing",
            occurredOn: m.occurredOn,
            counterpartyName: m.counterparty,
            reference: m.reference ?? "",
            note: m.notes ?? "",
          },
          signal,
        );
      });
    },
    setTags(id, tags) {
      return mutate(async (signal) => {
        const raw = workspaceDocumentDetailSchema.parse(
          await apiRequest(`${root}/documents/${id}`, "GET", undefined, signal),
        );
        await patch(id, { data: { ...raw.data, tags } }, signal);
      });
    },
    addGrant(id, type, subject, permission) {
      return mutate(async (signal) => {
        await apiRequest(
          `${root}/documents/${id}/grants`,
          "POST",
          {
            [type === "user" ? "userId" : "departmentId"]: subject,
            permission: permission === "manage" ? "manage_access" : permission,
          },
          signal,
        );
      });
    },
    removeGrant(id) {
      return mutate(async (signal) => {
        const grant = data.grants.find((g) => g.id === id);
        if (!grant) throw new Error("Missing grant");
        await apiRequest(
          `${root}/documents/${grant.resourceId}/grants/${id}`,
          "DELETE",
          undefined,
          signal,
        );
      });
    },
    unlinkDocument(linkId, id) {
      return mutate(async (signal) => {
        const link = data.documents
          .find((d) => d.id === id)
          ?.links?.find((l) => l.linkId === linkId);
        if (!link) throw new Error("Missing link");
        await apiRequest(
          `${root}/documents/${id}/links/${link.linkId}`,
          "DELETE",
          undefined,
          signal,
        );
      });
    },
  };
}
