import { Skeleton } from "../../components/ui/skeleton";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import { errorText } from "../identity/Auth";
import { t } from "../../i18n/lo";

type Target = { id: string; displayName: string };
type Grant = {
  id: string;
  userId: string | null;
  departmentId: string | null;
  permission: string;
  user: { displayName: string } | null;
  department: { name: string } | null;
};
const labels: Record<string, string> = {
  view: "ເບິ່ງ",
  edit: "ແກ້ໄຂ",
  comment: "ສະແດງຄວາມເຫັນ",
  manage_access: "ຈັດການສິດ",
};
export function TaskSharing({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [grants, setGrants] = useState<Grant[]>([]),
    [departments, setDepartments] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [epoch, setEpoch] = useState(0);
  const [query, setQuery] = useState(""),
    [targets, setTargets] = useState<Target[]>([]),
    [kind, setKind] = useState("user"),
    [target, setTarget] = useState(""),
    [edit, setEdit] = useState(false),
    [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(true),
    [searchLoading, setSearchLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false);
    setLoading(true);
    setError("");
    Promise.all([
      apiRequest<Grant[]>(`/api/v1/resources/${id}/grants`, "GET", undefined, controller.signal),
      apiRequest<{ id: string; name: string }[]>(
        "/api/v1/departments",
        "GET",
        undefined,
        controller.signal,
      ),
    ])
      .then(([g, d]) => {
        if (!controller.signal.aborted) {
          setGrants(g);
          setDepartments(d);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorText(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, epoch]);
  useEffect(() => {
    const controller = new AbortController();
    if (query.trim().length < 2) {
      setTargets([]);
      setSearchLoading(false);
      return;
    }
    setTargets([]);
    setSearchLoading(true);
    const timer = setTimeout(() => {
      apiRequest<Target[]>(
        `/api/v1/resources/${id}/share-targets?q=${encodeURIComponent(query.trim())}&limit=25`,
        "GET",
        undefined,
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setTargets(result);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorText(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearchLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, query]);
  async function share(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const subject = kind === "user" ? { userId: target } : { departmentId: target };
      if (
        !grants.some(
          (g) =>
            (kind === "user" ? g.userId : g.departmentId) === target && g.permission === "view",
        )
      )
        await apiRequest(`/api/v1/resources/${id}/grants`, "POST", {
          ...subject,
          permission: "view",
        });
      if (
        edit &&
        !grants.some(
          (g) =>
            (kind === "user" ? g.userId : g.departmentId) === target && g.permission === "edit",
        )
      )
        await apiRequest(`/api/v1/resources/${id}/grants`, "POST", {
          ...subject,
          permission: "edit",
        });
      setTarget("");
      onChanged();
    } catch (e) {
      setError(errorText(e) + " ກວດລາຍການສິດປັດຈຸບັນກ່ອນລອງໃໝ່.");
    } finally {
      setBusy(false);
      setEpoch((x) => x + 1);
    }
  }
  async function revoke(grantId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1/resources/${id}/grants/${grantId}`, "DELETE");
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setEpoch((x) => x + 1);
    }
  }
  return (
    <section className="panel task-sharing">
      <div className="panel-heading">
        <h2>ແບ່ງປັນສິດ</h2>
      </div>
      <p className="task-help">
        ສິດຖືກຈັດການແຍກຈາກຜູ້ຮັບຜິດຊອບ. ຖອນສິດເບິ່ງເພື່ອປິດສິດທີ່ອາໄສການເບິ່ງນັ້ນ; ສິດຈາກພະແນກ/ບົດບາດອື່ນອາດຍັງມີຜົນ.
      </p>
      {loading && <Skeleton variant="rows" rows={2} label="ກຳລັງໂຫຼດສິດ..." />}
      {loaded && (
        <>
          <div className="identity-list">
            {grants.map((g) => (
              <div className="identity-row identity-inline" key={g.id}>
                <span>
                  {g.user?.displayName ?? t(g.department?.name ?? "")} ·{" "}
                  {labels[g.permission] ?? g.permission}
                </span>
                <button className="button ghost" disabled={busy} onClick={() => void revoke(g.id)}>
                  ຖອນສິດ
                </button>
              </div>
            ))}
          </div>
          <form onSubmit={share} className="identity-form">
            <label>
              ປະເພດຜູ້ຮັບ
              <select
                aria-label="ປະເພດຜູ້ຮັບ"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setTarget("");
                }}
                disabled={busy}
              >
                <option value="user">ຜູ້ໃຊ້</option>
                <option value="department">ພະແນກ</option>
              </select>
            </label>
            {kind === "user" && (
              <label>
                ຄົ້ນຫາຜູ້ຮັບ
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setTarget("");
                  }}
                  placeholder="ພິມຢ່າງນ້ອຍ 2 ຕົວ"
                  disabled={busy}
                />
              </label>
            )}
            {kind === "user" && searchLoading && (
              <Skeleton variant="card" rows={1} label="ກຳລັງຄົ້ນຫາ..." />
            )}
            <label>
              ຜູ້ຮັບ
              <select
                aria-label="ຜູ້ຮັບ"
                value={target}
                required
                onChange={(e) => setTarget(e.target.value)}
                disabled={busy || searchLoading}
              >
                <option value="">ເລືອກຜູ້ຮັບ</option>
                {(kind === "user"
                  ? targets.map((p) => ({ id: p.id, name: p.displayName }))
                  : departments.map((d) => ({ ...d, name: t(d.name) }))
                ).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="task-participant-check">
              <input
                type="checkbox"
                checked={edit}
                onChange={(e) => setEdit(e.target.checked)}
                disabled={busy}
              />
              ໃຫ້ສິດແກ້ໄຂເພີ່ມ
            </label>
            <button
              type="submit"
              className="button secondary"
              disabled={busy || !target || !loaded}
            >
              {busy && <Skeleton variant="inline" label="ກຳລັງບັນທຶກ..." />}
              {busy ? "ກຳລັງບັນທຶກ..." : "ແບ່ງປັນສິດເບິ່ງ"}
            </button>
          </form>
        </>
      )}
      {!loading && !loaded && (
        <button className="button secondary" onClick={() => setEpoch((x) => x + 1)}>
          ລອງໃໝ່
        </button>
      )}
      {error && (
        <p role="alert" className="identity-error">
          {error}
        </p>
      )}
    </section>
  );
}
