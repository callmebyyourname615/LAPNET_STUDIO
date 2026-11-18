import { useCallback, useEffect, useState } from "react";
import { taskStatuses, taskPriorities } from "@lapnet/contracts";
import { apiRequest } from "../../lib/api";
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
export function useTaskData<T>(path: string, schema: { parse: (value: unknown) => T }) {
  const [epoch, setEpoch] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    schema: typeof schema;
    data: T | null;
    error: string;
  } | null>(null);
  const key = path + "\u0000" + epoch;
  const reload = useCallback(() => setEpoch((x) => x + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(path, "GET", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setResult({ key, schema, data: schema.parse(value), error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setResult({ key, schema, data: null, error: errorText(e) });
        }
      });
    return () => controller.abort();
  }, [path, schema, key]);
  const loading = result?.key !== key || result?.schema !== schema;
  return {
    data: loading ? null : result.data,
    error: loading ? "" : result.error,
    loading,
    reload,
  };
}
