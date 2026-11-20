import { useCallback, useEffect, useState } from "react";
import { taskStatuses, taskPriorities } from "@lapnet/contracts";
import { apiRequest, ApiError } from "../../lib/api";
import { errorText } from "../identity/Auth";
export const statusNames: Record<(typeof taskStatuses)[number], string> = {
  todo: "ລໍຖ້າດຳເນີນການ",
  in_progress: "ກຳລັງດຳເນີນການ",
  blocked: "ຕິດຂັດ",
  done: "ສຳເລັດ",
  cancelled: "ຍົກເລີກ",
};
export const priorityNames: Record<(typeof taskPriorities)[number], string> = {
  low: "ຕ່ຳ",
  normal: "ປົກກະຕິ",
  high: "ສູງ",
  urgent: "ດ່ວນ",
};
export const actionNames: Record<string, string> = {
  created: "ສ້າງວຽກ",
  team_invited: "ເຊີນທີມເຂົ້າຮ່ວມວຽກ",
  updated: "ແກ້ໄຂລາຍລະອຽດ",
  transitioned: "ປ່ຽນສະຖານະ",
  reopened: "ເປີດວຽກຄືນ",
  archived: "ເກັບເຂົ້າຄັງ",
};
export const dueLabel = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("lo-LA", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Vientiane",
        calendar: "gregory",
      }).format(new Date(value + "T00:00:00Z"))
    : "ບໍ່ກຳນົດ";
export const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("lo-LA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Vientiane",
    calendar: "gregory",
  }).format(new Date(value));
export function useTaskData<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  refreshKey = 0,
) {
  // Reloads keep usable content mounted. A new URL/schema must never show the old scope.
  const [epoch, setEpoch] = useState(0);
  const [result, setResult] = useState<{
    path: string;
    key: string;
    schema: typeof schema;
    data: T | null;
    error: string;
  } | null>(null);
  const key = `${path}\u0000${refreshKey}:${epoch}`;
  const reload = useCallback(() => setEpoch((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(path, "GET", undefined, controller.signal)
      .then((value) => {
        const data = schema.parse(value);
        if (!controller.signal.aborted) setResult({ path, key, schema, data, error: "" });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const denied = error instanceof ApiError && [401, 403, 404].includes(error.status);
        setResult((previous) => ({
          path,
          key,
          schema,
          data:
            !denied && previous?.path === path && previous.schema === schema ? previous.data : null,
          error: errorText(error),
        }));
      });
    return () => controller.abort();
  }, [path, schema, key]);
  const sameSource = result?.path === path && result?.schema === schema;
  const pending = !sameSource || result?.key !== key;
  const data = sameSource ? result.data : null;
  return {
    data,
    error: sameSource && !pending ? result.error : "",
    loading: pending && data === null,
    refreshing: pending && data !== null,
    reload,
  };
}
