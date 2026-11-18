import { apiErrorSchema, versionSchema } from "@lapnet/contracts";
import { toast } from "./toast";

function mutationSuccess(path: string, method: string) {
  if (path === "/auth/login" || /^\/api\/v1\/notifications\/(?:[^/]+\/read|read-all)$/.test(path))
    return;
  if (path === "/auth/logout") {
    toast.clear();
    return;
  }
  const en = document.documentElement.lang === "en";
  let key = "saved";
  if (path.endsWith("/retry")) key = "retry";
  else if (path.endsWith("/archive")) key = "archive";
  else if (method === "DELETE")
    key = /^\/api\/v1\/document-workspace\/folders\/[^/]+$/.test(path)
      ? "folderDeleted"
      : "removed";
  else if (method === "PATCH") key = "updated";
  const messages: Record<string, [string, string]> = {
    saved: ["ບັນທຶກສຳເລັດ.", "Saved successfully."],
    updated: ["ບັນທຶກການແກ້ໄຂສຳເລັດ.", "Changes saved."],
    removed: ["ລຶບສຳເລັດ.", "Removed successfully."],
    folderDeleted: [
      "ລຶບໂຟນເດີ ແລະ ລາຍການພາຍໃນສຳເລັດ.",
      "Folder and its contents removed successfully.",
    ],
    archive: ["ເກັບເຂົ້າຄັງສຳເລັດ.", "Archived successfully."],
    retry: ["ສົ່ງເຂົ້າຄິວເພື່ອລອງໃໝ່ແລ້ວ.", "Queued for retry."],
  };
  toast.success(messages[key][en ? 1 : 0]);
}

function mutationFailure(error: unknown, limitMiB = 25) {
  const en = document.documentElement.lang === "en";
  const messages: Record<string, [string, string]> = {
    AUTHENTICATION_REQUIRED: [
      "ກະລຸນາກວດບັນຊີ ແລະ ເຂົ້າລະບົບໃໝ່.",
      "Check your credentials and sign in again.",
    ],
    ACCESS_DENIED: ["ທ່ານບໍ່ມີສິດດຳເນີນການນີ້.", "You do not have permission for this action."],
    VALIDATION_FAILED: [
      "ກະລຸນາກວດຊ່ອງຂໍ້ມູນ ແລະ ໄຟລ໌ແລ້ວລອງໃໝ່.",
      "Check the fields and file, then try again.",
    ],
    CONFLICT: [
      "ຂໍ້ມູນປ່ຽນແປງ ຫຼື ຊ້ຳ. ກະລຸນາໂຫຼດໃໝ່ແລ້ວກວດສອບ.",
      "The record changed or already exists. Reload and review before retrying.",
    ],
    NOT_FOUND: [
      "ບໍ່ພົບລາຍການ ຫຼື ທ່ານບໍ່ມີສິດເຂົ້າເຖິງ.",
      "The record is unavailable or you no longer have access.",
    ],
    RATE_LIMITED: [
      "ລອງຫຼາຍເກີນໄປ. ກະລຸນາລໍຖ້າແລ້ວລອງໃໝ່.",
      "Too many attempts. Wait before trying again.",
    ],
  };
  if (error instanceof ApiError && error.status === 413) {
    toast.error(
      en
        ? `The file exceeds the ${limitMiB} MiB upload limit.`
        : `ໄຟລ໌ໃຫຍ່ເກີນຂະໜາດອັບໂຫຼດ ${limitMiB} MiB.`,
    );
    return;
  }
  const copy = error instanceof ApiError ? messages[error.code] : undefined;
  toast.error(
    copy?.[en ? 1 : 0] ??
      (en
        ? "Could not complete the request. Check the connection and try again."
        : "ດຳເນີນການບໍ່ສຳເລັດ. ກວດການເຊື່ອມຕໍ່ແລ້ວລອງໃໝ່."),
  );
}

let csrfToken = "";
export function setCsrfToken(value: string) {
  csrfToken = value;
}
export async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!path.startsWith("/api/") && !path.startsWith("/auth/")) throw new Error("Invalid API path");
  const mutation = !["GET", "HEAD"].includes(method);
  const requestToken = csrfToken;
  try {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(mutation && csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
      if (
        response.status === 401 &&
        path !== "/auth/login" &&
        path !== "/api/v1/me" &&
        requestToken === csrfToken
      )
        window.dispatchEvent(new Event("lapnet:unauthorized"));
      throw new ApiError(
        response.status,
        parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
        parsed.success ? parsed.data.error.requestId : undefined,
      );
    }
    const result = (await response.json()) as T;
    if (mutation) mutationSuccess(path, method);
    return result;
  } catch (error) {
    if (
      mutation &&
      !signal?.aborted &&
      !(error instanceof DOMException && error.name === "AbortError")
    )
      mutationFailure(error);
    throw error;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super("The server request failed.");
  }
}

export async function getApiVersion(signal?: AbortSignal) {
  const response = await fetch("/api/v1/version", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      parsed.success ? parsed.data.error.requestId : undefined,
    );
  }
  return versionSchema.parse(await response.json());
}

export async function uploadFile(
  path: string,
  file: File,
  options?: { metadata?: unknown; note?: string; signal?: AbortSignal },
) {
  const accountImage = /^\/api\/v1\/me\/images\/(avatar|cover)$/.test(path);
  if (
    !/^\/api\/v1\/documents\/[a-f0-9-]+\/versions$/.test(path) &&
    path !== "/api/v1/document-workspace/register" &&
    !accountImage
  )
    throw new Error("Invalid upload path");
  try {
    if (file.size > (accountImage ? 8 : 25) * 1024 * 1024)
      throw new ApiError(413, "VALIDATION_FAILED");
    const response = await fetch(path, {
      method: accountImage ? "PUT" : "POST",
      credentials: "same-origin",
      signal: options?.signal,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-CSRF-Token": csrfToken,
        "X-File-Name": encodeURIComponent(file.name),
        "X-File-Type": file.type,
        ...(options?.metadata
          ? { "X-Document-Metadata": encodeURIComponent(JSON.stringify(options.metadata)) }
          : {}),
        ...(options?.note ? { "X-Version-Note": encodeURIComponent(options.note) } : {}),
      },
      body: file,
    });
    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
      if (response.status === 401) window.dispatchEvent(new Event("lapnet:unauthorized"));
      throw new ApiError(
        response.status,
        parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      );
    }
    const result: unknown = await response.json();
    mutationSuccess(path, "POST");
    return result;
  } catch (error) {
    if (
      !options?.signal?.aborted &&
      !(error instanceof DOMException && error.name === "AbortError")
    )
      mutationFailure(error, accountImage ? 8 : 25);
    throw error;
  }
}
