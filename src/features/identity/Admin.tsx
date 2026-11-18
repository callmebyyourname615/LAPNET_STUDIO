import { Skeleton } from "../../components/ui/skeleton";
import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth, errorText } from "./Auth";
import { t } from "../../i18n/lo";
import { Link, useLocation } from "react-router-dom";

type Department = { id: string; code: string; name: string; active: boolean };
type Membership = { id: string; department: Department; membershipRole: string };
type Role = { id: string; userId?: string; role: string; departmentId: string | null };
type Person = {
  id: string;
  username: string | null;
  displayName: string;
  email: string | null;
  status: "active" | "disabled";
  memberships: Membership[];
  roles: Role[];
};
type Position = {
  id: string;
  code: string;
  label: string;
  assignments: { id: string; user: { id: string; displayName: string; status: string } }[];
};
type Organization = {
  departments: Department[];
  positions: Position[];
  reporting: { id: string; departmentId: string; positionId: string }[];
  collaborations: { id: string; departmentAId: string; departmentBId: string }[];
};
type Page<T> = { items: T[]; nextCursor: string | null };
type RecordItem = {
  id: string;
  kind: string;
  ownerDepartmentId: string;
  permissions?: Record<string, boolean>;
};
type Grant = {
  id: string;
  permission: string;
  userId: string | null;
  departmentId: string | null;
  user: { displayName: string } | null;
  department: { name: string } | null;
};
const roleName: Record<string, string> = {
  portal_admin: "ຜູ້ດູແລລະບົບ",
  resource_viewer: "ຜູ້ອ່ານຕາມຂອບເຂດ",
  resource_editor: "ຜູ້ແກ້ໄຂຕາມຂອບເຂດ",
};
const departmentName: Record<string, string> = {
  Finance: "ການເງິນ",
  Office: "ຫ້ອງການ",
  Operation: "ປະຕິບັດງານ",
  IT: "ໄອທີ",
  Audit: "ກວດສອບ",
};
const permissionName: Record<string, string> = {
  view: "ເບິ່ງ",
  comment: "ສະແດງຄວາມເຫັນ",
  edit: "ແກ້ໄຂ",
  download: "ດາວໂຫຼດ",
  manage_access: "ຈັດການສິດ",
};
const names = (department: Department) => departmentName[department.name] ?? department.name;
const data = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
const text = (form: FormData, key: string) => String(form.get(key) ?? "");

export function IdentityAdmin({ type }: { type: "people" | "departments" | "access" }) {
  const { preview } = useAuth();
  return preview ? <PreviewIdentity type={type} /> : <ConnectedIdentityAdmin type={type} />;
}
function PreviewIdentity({ type }: { type: "people" | "departments" | "access" }) {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{type === "people" ? "ຜູ້ໃຊ້" : type === "departments" ? "ພະແນກ" : "ສິດເຂົ້າເຖິງ"}</h1>
          <p>ຂໍ້ມູນຕົວຢ່າງ</p>
        </div>
      </div>
      {type === "departments" ? (
        <div className="org-grid">
          <section className="panel">
            <h2>ສາຍລາຍງານ</h2>
            {[
              ["CEO", "ການເງິນ · ຫ້ອງການ"],
              ["CFO", "ປະຕິບັດງານ · ໄອທີ"],
              ["ຄະນະບໍລິຫານ", "ກວດສອບ"],
            ].map(([position, departments]) => (
              <div className="org-node" key={position}>
                <strong>{position}</strong>
                <span>ກຳກັບດູແລ</span>
                <b>{departments}</b>
              </div>
            ))}
          </section>
          <section className="panel">
            <h2>ການຮ່ວມມື</h2>
            <p>ໄອທີ ↔ ປະຕິບັດງານ, ການເງິນ, ກວດສອບ</p>
            <p>ຫ້ອງການ ↔ ທຸກພະແນກ</p>
          </section>
        </div>
      ) : type === "people" ? (
        <section className="panel">
          <div className="people-grid">
            {[
              ["Nila Phommasone", "ໄອທີ"],
              ["Maya Chen", "ການເງິນ"],
              ["Kiet Vong", "ປະຕິບັດງານ"],
              ["Somchai Lee", "ກວດສອບ"],
            ].map(([name, department]) => (
              <div className="person" key={name}>
                <span>
                  <strong>{name}</strong>
                  <small>{department}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>ບົດບາດ ແລະ ຂອບເຂດ</h2>
          <p>ຈັດການສິດຕາມພະແນກ ແລະ ລາຍການທີ່ແບ່ງປັນ.</p>
          <p className="muted">ການສະແດງຕົວຢ່າງນີ້ບໍ່ປ່ຽນສິດຈິງ.</p>
        </section>
      )}
    </>
  );
}
function ConnectedIdentityAdmin({ type }: { type: "people" | "departments" | "access" }) {
  const { me, refresh } = useAuth();
  const admin = !!me?.capabilities.manageUsers;
  const location = useLocation();
  const auditHref = location.pathname.startsWith("/document-workspace/")
    ? "/document-workspace/portal/admin/audit"
    : "/admin/audit";
  const [org, setOrg] = useState<Organization | null>(null);
  const [people, setPeople] = useState<Page<Person>>({ items: [], nextCursor: null });
  const [roles, setRoles] = useState<Role[]>([]);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState("");
  const [selectedRole, setSelectedRole] = useState("resource_viewer");
  const [recordId, setRecordId] = useState("");
  const [record, setRecord] = useState<RecordItem | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [targets, setTargets] = useState<{ id: string; displayName: string }[]>([]);
  const [subject, setSubject] = useState("user");
  const [recordLoading, setRecordLoading] = useState(false);
  const recordRequest = useRef<AbortController | null>(null);
  const listRequest = useRef<AbortController | null>(null);
  useEffect(() => () => recordRequest.current?.abort(), []);
  const load = useCallback(async () => {
    listRequest.current?.abort();
    const request = new AbortController();
    listRequest.current = request;
    setLoading(true);
    setError("");
    try {
      const organization = await apiRequest<Organization>(
        "/api/v1/organization",
        "GET",
        undefined,
        request.signal,
      );
      const users = admin
        ? await apiRequest<Page<Person>>(
            "/api/v1/users?limit=50" +
              (query ? "&q=" + encodeURIComponent(query) : "") +
              (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
            "GET",
            undefined,
            request.signal,
          )
        : { items: [], nextCursor: null };
      const nextRoles =
        admin && type === "access"
          ? await apiRequest<Role[]>("/api/v1/roles", "GET", undefined, request.signal)
          : [];
      const nextRecords =
        type === "access"
          ? (
              await apiRequest<Page<RecordItem>>(
                "/api/v1/resources?limit=100",
                "GET",
                undefined,
                request.signal,
              )
            ).items
          : [];
      if (request.signal.aborted) return;
      setOrg(organization);
      setPeople(users);
      setRoles(nextRoles);
      setRecords(nextRecords);
    } catch (error) {
      if (!request.signal.aborted) setError(errorText(error));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [admin, type, query, cursor]);
  useEffect(() => {
    void load();
    return () => listRequest.current?.abort();
  }, [load]);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      await refresh();
      setNotice("ບັນທຶກສຳເລັດແລ້ວ.");
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function loadRecord(id: string) {
    recordRequest.current?.abort();
    const request = new AbortController();
    recordRequest.current = request;
    setRecordId(id);
    setRecord(null);
    setGrants([]);
    setTargets([]);
    setError("");
    setRecordLoading(!!id);
    if (!id) return;
    try {
      const detail = await apiRequest<RecordItem>(
        "/api/v1/resources/" + id,
        "GET",
        undefined,
        request.signal,
      );
      let nextGrants: Grant[] = [],
        nextTargets: { id: string; displayName: string }[] = [];
      if (detail.permissions?.manage_access) {
        [nextGrants, nextTargets] = await Promise.all([
          apiRequest<Grant[]>(
            "/api/v1/resources/" + id + "/grants",
            "GET",
            undefined,
            request.signal,
          ),
          apiRequest<{ id: string; displayName: string }[]>(
            "/api/v1/resources/" + id + "/share-targets?limit=25",
            "GET",
            undefined,
            request.signal,
          ),
        ]);
      }
      if (request.signal.aborted) return;
      setRecord(detail);
      setGrants(nextGrants);
      setTargets(nextTargets);
    } catch (error) {
      if (!request.signal.aborted) setError(errorText(error));
    } finally {
      if (!request.signal.aborted) setRecordLoading(false);
    }
  }
  if (!me) return null;
  if (type === "people" && !admin)
    return (
      <section className="panel">
        <h1>ບໍ່ມີສິດເຂົ້າເຖິງ</h1>
        <p>ໜ້ານີ້ສຳລັບຜູ້ດູແລບັນຊີ.</p>
      </section>
    );
  if (loading) return <Skeleton variant="page" />;
  const users = (
    <>
      <option value="">ເລືອກຜູ້ໃຊ້</option>
      {people.items
        .filter((x) => x.status === "active")
        .map((x) => (
          <option key={x.id} value={x.id}>
            {x.displayName} ({x.username})
          </option>
        ))}
    </>
  );
  const departments = (
    <>
      <option value="">ເລືອກພະແນກ</option>
      {org?.departments
        .filter((x) => x.active)
        .map((x) => (
          <option key={x.id} value={x.id}>
            {names(x)}
          </option>
        ))}
    </>
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h1>{type === "people" ? "ຜູ້ໃຊ້" : type === "departments" ? "ພະແນກ" : "ສິດເຂົ້າເຖິງ"}</h1>
          <p>
            {type === "people"
              ? "ຈັດການບັນຊີ ແລະ ການເຂົ້າໃຊ້ລະບົບ"
              : type === "departments"
                ? "ສາຍລາຍງານ ແລະ ການຮ່ວມມື"
                : "ກຳນົດຂອບເຂດ ແລະ ແບ່ງປັນລາຍການຢ່າງຊັດເຈນ"}
          </p>
        </div>
        <button
          className="button"
          disabled={busy || loading}
          onClick={() => {
            void load();
          }}
        >
          ໂຫຼດໃໝ່
        </button>
      </div>
      {error && (
        <p role="alert" className="identity-error">
          {error}
        </p>
      )}
      {busy && <Skeleton variant="inline" label="ກຳລັງບັນທຶກ..." />}
      {notice && (
        <p role="status" className="inline-success">
          {notice}
        </p>
      )}
      {issued && (
        <section className="panel credential-notice" role="status">
          <h2>ລະຫັດຜ່ານຊົ່ວຄາວ</h2>
          <p>
            ຊື່ຜູ້ໃຊ້: <strong>{issued.username}</strong>
          </p>
          <code>{issued.password}</code>
          <p>ຈະສະແດງພຽງຄັ້ງນີ້. ຜູ້ໃຊ້ເຂົ້າໃຊ້ໄດ້ທັນທີ ແລະ ປ່ຽນລະຫັດຜ່ານໄດ້ໃນໜ້າບັນຊີ.</p>
          <button className="button" onClick={() => setIssued(null)}>
            ປິດ
          </button>
        </section>
      )}
      {type === "people" && (
        <>
          <section className="panel">
            <h2>ເພີ່ມຜູ້ໃຊ້</h2>
            <form
              className="identity-form identity-grid"
              autoComplete="off"
              onSubmit={(event) => {
                const form = data(event);
                const element = event.currentTarget;
                void run(async () => {
                  const result = await apiRequest<{ user: Person; temporaryPassword: string }>(
                    "/api/v1/users",
                    "POST",
                    {
                      username: text(form, "username"),
                      displayName: text(form, "displayName"),
                      ...(text(form, "email") ? { email: text(form, "email") } : {}),
                    },
                  );
                  setIssued({
                    username: result.user.username ?? "",
                    password: result.temporaryPassword,
                  });
                  element.reset();
                });
              }}
            >
              <label>
                ຊື່ຜູ້ໃຊ້
                <input
                  name="username"
                  minLength={3}
                  maxLength={64}
                  pattern="[a-z0-9._-]+"
                  required
                />
              </label>
              <label>
                ຊື່ສະແດງ
                <input name="displayName" maxLength={100} required />
              </label>
              <label>
                ອີເມວ
                <input type="email" name="email" maxLength={254} />
              </label>
              <button className="button primary" disabled={busy}>
                ສ້າງບັນຊີ
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>ບັນຊີຜູ້ໃຊ້</h2>
            <form
              className="identity-inline"
              onSubmit={(event) => {
                const form = data(event);
                setCursor("");
                setQuery(text(form, "q"));
              }}
            >
              <input aria-label="ຄົ້ນຫາຜູ້ໃຊ້" name="q" placeholder="ຄົ້ນຫາຊື່ ຫຼື ຊື່ຜູ້ໃຊ້" maxLength={100} />
              <button className="button">ຄົ້ນຫາ</button>
            </form>
            <div className="identity-list">
              {people.items.map((person) => (
                <article className="identity-person" key={person.id}>
                  <div>
                    <strong>{person.displayName}</strong>
                    <small>
                      {person.username} · {person.status === "active" ? "ເປີດໃຊ້" : "ລະງັບ"}
                    </small>
                    <div className="identity-tags">
                      {person.memberships.map((m) => (
                        <span key={m.id}>
                          {names(m.department)}{" "}
                          <button
                            disabled={busy}
                            aria-label={"ສິ້ນສຸດສະມາຊິກ " + person.username + " " + m.department.code}
                            onClick={() => {
                              void run(() => apiRequest("/api/v1/memberships/" + m.id, "DELETE"));
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <form
                    className="identity-inline"
                    onSubmit={(event) => {
                      const form = data(event);
                      void run(() =>
                        apiRequest("/api/v1/users/" + person.id, "PATCH", {
                          displayName: text(form, "displayName"),
                        }),
                      );
                    }}
                  >
                    <input
                      aria-label={"ຊື່ສະແດງ " + person.username}
                      name="displayName"
                      defaultValue={person.displayName}
                      maxLength={100}
                      required
                    />
                    <button className="button" disabled={busy}>
                      ບັນທຶກ
                    </button>
                  </form>
                  <div className="identity-inline">
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
                          const result = await apiRequest<{ temporaryPassword: string }>(
                            "/api/v1/users/" + person.id + "/reset-password",
                            "POST",
                          );
                          setIssued({
                            username: person.username ?? "",
                            password: result.temporaryPassword,
                          });
                        });
                      }}
                    >
                      ອອກລະຫັດຜ່ານໃໝ່
                    </button>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        void run(() =>
                          apiRequest("/api/v1/users/" + person.id, "PATCH", {
                            status: person.status === "active" ? "disabled" : "active",
                          }),
                        );
                      }}
                    >
                      {person.status === "active" ? "ລະງັບບັນຊີ" : "ເປີດບັນຊີ"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {!people.items.length && !loading && <p>ບໍ່ພົບຜູ້ໃຊ້.</p>}
            <div className="identity-inline">
              <button className="button" disabled={!cursor} onClick={() => setCursor("")}>
                ໜ້າທຳອິດ
              </button>
              <button
                className="button"
                disabled={!people.nextCursor}
                onClick={() => setCursor(people.nextCursor ?? "")}
              >
                ໜ້າຕໍ່ໄປ
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>ເພີ່ມສະມາຊິກພະແນກ</h2>
            <form
              className="identity-form identity-grid"
              onSubmit={(event) => {
                const form = data(event);
                void run(() =>
                  apiRequest("/api/v1/memberships", "POST", {
                    userId: text(form, "userId"),
                    departmentId: text(form, "departmentId"),
                    membershipRole: text(form, "membershipRole"),
                  }),
                );
              }}
            >
              <label>
                ຜູ້ໃຊ້
                <select name="userId" required>
                  {users}
                </select>
              </label>
              <label>
                ພະແນກ
                <select name="departmentId" required>
                  {departments}
                </select>
              </label>
              <label>
                ຕຳແໜ່ງໃນພະແນກ
                <select name="membershipRole">
                  <option value="member">ສະມາຊິກ</option>
                  <option value="manager">ຫົວໜ້າພະແນກ</option>
                </select>
              </label>
              <button className="button primary" disabled={busy}>
                ເພີ່ມສະມາຊິກ
              </button>
            </form>
          </section>
        </>
      )}
      {type === "departments" && org && (
        <>
          <div className="org-grid">
            <section className="panel">
              <h2>ສາຍລາຍງານ</h2>
              {org.positions.map((position) => (
                <div className="org-node" key={position.id}>
                  <strong>{position.code === "BOARD" ? "ຄະນະບໍລິຫານ" : position.label}</strong>
                  <span>ກຳກັບດູແລ</span>
                  <div>
                    {org.reporting
                      .filter((x) => x.positionId === position.id)
                      .map((x) => (
                        <b key={x.id}>
                          {names(org.departments.find((d) => d.id === x.departmentId)!)}
                        </b>
                      ))}
                  </div>
                  {position.assignments
                    .filter((x) => x.user.status === "active")
                    .map((x) => (
                      <p key={x.id}>
                        {x.user.displayName}{" "}
                        {admin && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => {
                              void run(() =>
                                apiRequest("/api/v1/position-assignments/" + x.id, "DELETE"),
                              );
                            }}
                          >
                            ສິ້ນສຸດຕຳແໜ່ງ
                          </button>
                        )}
                      </p>
                    ))}
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>ການຮ່ວມມື</h2>
              {org.collaborations.map((x) => (
                <p key={x.id}>
                  {names(org.departments.find((d) => d.id === x.departmentAId)!)} ↔{" "}
                  {names(org.departments.find((d) => d.id === x.departmentBId)!)}
                </p>
              ))}
              <p className="muted">ການຮ່ວມມືບໍ່ໄດ້ໃຫ້ສິດອ່ານຂໍ້ມູນອັດຕະໂນມັດ.</p>
            </section>
          </div>
          {admin && (
            <>
              <section className="panel">
                <h2>ຈັດການພະແນກ</h2>
                <form
                  className="identity-form identity-grid"
                  onSubmit={(event) => {
                    const form = data(event);
                    void run(() =>
                      apiRequest("/api/v1/departments", "POST", {
                        code: text(form, "code"),
                        name: text(form, "name"),
                      }),
                    );
                  }}
                >
                  <label>
                    ລະຫັດພະແນກ
                    <input
                      name="code"
                      pattern="[A-Z][A-Z0-9_]+"
                      minLength={2}
                      maxLength={30}
                      required
                    />
                  </label>
                  <label>
                    ຊື່ພະແນກ
                    <input name="name" maxLength={100} required />
                  </label>
                  <button className="button primary" disabled={busy}>
                    ເພີ່ມພະແນກ
                  </button>
                </form>
                {org.departments.map((d) => (
                  <form
                    className="identity-inline identity-row"
                    key={d.id}
                    onSubmit={(event) => {
                      const form = data(event);
                      void run(() =>
                        apiRequest("/api/v1/departments/" + d.id, "PATCH", {
                          name: text(form, "name"),
                        }),
                      );
                    }}
                  >
                    <span>{d.code}</span>
                    <input
                      name="name"
                      defaultValue={d.name}
                      aria-label={"ຊື່ພະແນກ " + d.code}
                      required
                    />
                    <button className="button" disabled={busy}>
                      ບັນທຶກ
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        void run(() =>
                          apiRequest("/api/v1/departments/" + d.id, "PATCH", { active: !d.active }),
                        );
                      }}
                    >
                      {d.active ? "ປິດໃຊ້" : "ເປີດໃຊ້"}
                    </button>
                  </form>
                ))}
              </section>
              <section className="panel">
                <h2>ມອບໝາຍຕຳແໜ່ງ</h2>
                <form
                  className="identity-form identity-grid"
                  onSubmit={(event) => {
                    const form = data(event);
                    void run(() =>
                      apiRequest("/api/v1/position-assignments", "POST", {
                        userId: text(form, "userId"),
                        positionId: text(form, "positionId"),
                      }),
                    );
                  }}
                >
                  <label>
                    ຜູ້ໃຊ້
                    <select name="userId" required>
                      {users}
                    </select>
                  </label>
                  <label>
                    ຕຳແໜ່ງ
                    <select name="positionId" required>
                      <option value="">ເລືອກຕຳແໜ່ງ</option>
                      {org.positions.map((x) => (
                        <option value={x.id} key={x.id}>
                          {x.code === "BOARD" ? "ຄະນະບໍລິຫານ" : x.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button primary" disabled={busy}>
                    ມອບໝາຍ
                  </button>
                </form>
              </section>
            </>
          )}
        </>
      )}
      {type === "access" && (
        <>
          {admin && (
            <section className="panel">
              <h2>ບົດບາດ ແລະ ຂອບເຂດ</h2>
              <p>ສິດຜູ້ດູແລໃຊ້ຈັດການລະບົບ ແລະ ບັນຊີ. ບໍ່ໄດ້ໃຫ້ສິດອ່ານງານ ຫຼື ເອກະສານທັງໝົດ.</p>
              <form
                className="identity-form identity-grid"
                onSubmit={(event) => {
                  const form = data(event);
                  void run(() =>
                    apiRequest("/api/v1/roles", "POST", {
                      userId: text(form, "userId"),
                      role: selectedRole,
                      ...(selectedRole !== "portal_admin"
                        ? { departmentId: text(form, "departmentId") }
                        : {}),
                    }),
                  );
                }}
              >
                <label>
                  ຜູ້ໃຊ້
                  <select name="userId" required>
                    {users}
                  </select>
                </label>
                <label>
                  ບົດບາດ
                  <select
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value)}
                  >
                    {Object.entries(roleName).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ຂອບເຂດພະແນກ
                  <select
                    name="departmentId"
                    disabled={selectedRole === "portal_admin"}
                    required={selectedRole !== "portal_admin"}
                  >
                    {departments}
                  </select>
                </label>
                <button className="button primary" disabled={busy}>
                  ກຳນົດສິດ
                </button>
              </form>
              <div className="identity-list">
                {roles.map((role) => (
                  <div className="identity-inline identity-row" key={role.id}>
                    <span>
                      {people.items.find((x) => x.id === role.userId)?.displayName ?? role.userId}
                    </span>
                    <span>{roleName[role.role]}</span>
                    <small>
                      {org?.departments.find((x) => x.id === role.departmentId)
                        ? names(org.departments.find((x) => x.id === role.departmentId)!)
                        : "ຈັດການລະບົບ"}
                    </small>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        void run(() => apiRequest("/api/v1/roles/" + role.id, "DELETE"));
                      }}
                    >
                      ຖອນສິດ
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h2>ແບ່ງປັນລາຍການ</h2>
            <label>
              ລາຍການທີ່ເຂົ້າເຖິງໄດ້
              <select
                value={recordId}
                onChange={(event) => {
                  void loadRecord(event.target.value);
                }}
              >
                <option value="">ເລືອກລາຍການ</option>
                {records.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t(x.kind)} · {x.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            {recordLoading && <Skeleton variant="rows" rows={2} label="ກຳລັງໂຫຼດສິດ..." />}
            {!records.length && !loading && <p>ບໍ່ມີລາຍການທີ່ສາມາດຈັດການໄດ້.</p>}
            {record && !record.permissions?.manage_access && (
              <p>ທ່ານເບິ່ງລາຍການນີ້ໄດ້ ແຕ່ບໍ່ມີສິດຈັດການການແບ່ງປັນ.</p>
            )}
            {record?.permissions?.manage_access && (
              <>
                <form
                  className="identity-form identity-grid"
                  onSubmit={(event) => {
                    const form = data(event);
                    void run(async () => {
                      await apiRequest("/api/v1/resources/" + recordId + "/grants", "POST", {
                        permission: text(form, "permission"),
                        ...(subject === "user"
                          ? { userId: text(form, "target") }
                          : { departmentId: text(form, "target") }),
                      });
                      await loadRecord(recordId);
                    });
                  }}
                >
                  <label>
                    ແບ່ງປັນໃຫ້
                    <select value={subject} onChange={(event) => setSubject(event.target.value)}>
                      <option value="user">ຜູ້ໃຊ້</option>
                      <option value="department">ພະແນກ</option>
                    </select>
                  </label>
                  <label>
                    ຜູ້ຮັບ
                    <select name="target" required>
                      <option value="">ເລືອກຜູ້ຮັບ</option>
                      {subject === "user"
                        ? targets.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.displayName}
                            </option>
                          ))
                        : org?.departments
                            .filter((x) => x.active)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {names(x)}
                              </option>
                            ))}
                    </select>
                  </label>
                  <label>
                    ສິດ
                    <select name="permission">
                      {Object.entries(permissionName)
                        .filter(([key]) => key !== "download" || record.kind === "document")
                        .map(([key, value]) => (
                          <option key={key} value={key}>
                            {value}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="button primary" disabled={busy}>
                    ແບ່ງປັນ
                  </button>
                </form>
                {grants.map((grant) => (
                  <div className="identity-inline identity-row" key={grant.id}>
                    <span>{grant.user?.displayName ?? t(grant.department?.name ?? "")}</span>
                    <span>{permissionName[grant.permission]}</span>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        void run(async () => {
                          await apiRequest(
                            "/api/v1/resources/" + recordId + "/grants/" + grant.id,
                            "DELETE",
                          );
                          await loadRecord(recordId);
                        });
                      }}
                    >
                      ຖອນສິດ
                    </button>
                  </div>
                ))}
              </>
            )}
          </section>
          {me?.capabilities.viewAudit && (
            <section className="panel">
              <h2>ປະຫວັດການໃຊ້ງານ</h2>
              <p>ເບິ່ງກິດຈະກຳຜູ້ໃຊ້ ພ້ອມຄົ້ນຫາ ແລະ ກັ່ນຕອງຕາມເວລາ.</p>
              <Link className="button" to={auditHref}>
                ເປີດປະຫວັດການໃຊ້ງານ
              </Link>
            </section>
          )}
        </>
      )}
    </>
  );
}
