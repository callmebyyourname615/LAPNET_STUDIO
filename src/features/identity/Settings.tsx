/* Hallmark · personal portfolio and account settings · pre-emit critique: P5 H5 E5 S5 R5 V4 */
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  ArrowUpRight,
  Building2,
  Camera,
  KeyRound,
  Network,
  Pencil,
  Trash2,
  UserRound,
} from "lucide-react";
import { accountImageLimits } from "@lapnet/contracts";
import { apiRequest, uploadFile } from "@/lib/api";
import { AccountAvatar } from "@/components/ui/account-avatar";
import { ImageStudio } from "@/components/ui/image-studio";
import { Skeleton } from "@/components/ui/skeleton";
import { errorText, PasswordChange, useAuth } from "./Auth";
import "./settings.css";

gsap.registerPlugin(useGSAP);
type Section = "overview" | "profile" | "security";
type ImageKind = "avatar" | "cover";

export default function SettingsPage() {
  const { me, refresh } = useAuth();
  const root = useRef<HTMLDivElement>(null),
    cover = useRef<HTMLDivElement>(null),
    coverInput = useRef<HTMLInputElement>(null),
    avatarInput = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [studio, setStudio] = useState<{ file: File; kind: ImageKind; aspect: number } | null>(
    null,
  );
  const [imageBusy, setImageBusy] = useState<ImageKind | null>(null),
    [imageError, setImageError] = useState("");
  const en = document.documentElement.lang === "en";
  const profile = me!.user.profile;
  const text = {
    title: en ? "My profile" : "ໂປຣໄຟລ໌ຂອງຂ້ອຍ",
    description: en
      ? "Your personal information and account settings."
      : "ຂໍ້ມູນສ່ວນຕົວ ຂໍ້ມູນຕິດຕໍ່ ແລະ ການຕັ້ງຄ່າບັນຊີຂອງທ່ານ.",
    overview: en ? "Overview" : "ພາບລວມ",
    profile: en ? "Edit profile" : "ແກ້ໄຂໂປຣໄຟລ໌",
    security: en ? "Security" : "ຄວາມປອດໄພ",
    cover: en ? "Upload cover" : "ອັບໂຫຼດຮູບປົກ",
    avatar: en ? "Upload profile photo" : "ອັບໂຫຼດຮູບໂປຣໄຟລ໌",
    remove: en ? "Remove image" : "ລຶບຮູບ",
    saving: en ? "Saving image…" : "ກຳລັງບັນທຶກຮູບ…",
    username: en ? "Username" : "ຊື່ຜູ້ໃຊ້",
    departments: en ? "Departments" : "ພະແນກ",
    positions: en ? "Positions" : "ຕຳແໜ່ງ",
    about: en ? "About me" : "ກ່ຽວກັບຂ້ອຍ",
    aboutEmpty: en
      ? "Introduce yourself, your interests and the work you enjoy."
      : "ແນະນຳຕົວທ່ານ ຄວາມສົນໃຈ ແລະ ວຽກທີ່ມັກເຮັດ.",
    contact: en ? "Contact information" : "ຂໍ້ມູນຕິດຕໍ່",
    contactEmpty: en
      ? "Add the contact details you want to keep with your account."
      : "ເພີ່ມຂໍ້ມູນຕິດຕໍ່ສຳລັບບັນຊີຂອງທ່ານ.",
    email: en ? "Contact email" : "ອີເມວຕິດຕໍ່",
    phone: en ? "Phone number" : "ເບີໂທລະສັບ",
    address: en ? "Address" : "ທີ່ຢູ່",
    password: en ? "Change password" : "ປ່ຽນລະຫັດຜ່ານ",
    passwordHint: en
      ? "Update the password you use to sign in to this account."
      : "ປ່ຽນລະຫັດຜ່ານສຳລັບເຂົ້າໃຊ້ບັນຊີນີ້.",
    imageHint: en ? "JPEG, PNG or WebP · up to 8 MiB" : "JPEG, PNG ຫຼື WebP · ບໍ່ເກີນ 8 MiB",
  };
  useEffect(() => () => request.current?.abort(), []);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          gsap.fromTo(
            ".settings-card",
            { autoAlpha: 0, y: 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.22,
              stagger: 0.035,
              ease: "power2.out",
              clearProps: "opacity,visibility,transform",
            },
          );
        },
        root,
      );
      return () => media.revert();
    },
    { scope: root, dependencies: [section], revertOnUpdate: true },
  );
  async function imageAction(kind: ImageKind, file?: File) {
    if (imageBusy) return false;
    setImageError("");
    if (
      file &&
      (!(accountImageLimits.allowedTypes as readonly string[]).includes(file.type) ||
        file.size > accountImageLimits.maxBytes ||
        !file.size)
    ) {
      setImageError(
        en
          ? "Choose a JPEG, PNG or WebP image up to 8 MiB."
          : "ເລືອກຮູບ JPEG, PNG ຫຼື WebP ຂະໜາດບໍ່ເກີນ 8 MiB.",
      );
      return false;
    }
    const controller = new AbortController();
    request.current = controller;
    setImageBusy(kind);
    try {
      if (file) await uploadFile(`/api/v1/me/images/${kind}`, file, { signal: controller.signal });
      else await apiRequest(`/api/v1/me/images/${kind}`, "DELETE", undefined, controller.signal);
      if (!controller.signal.aborted) await refresh();
      return !controller.signal.aborted;
    } catch (error) {
      if (!controller.signal.aborted) setImageError(errorText(error));
      return false;
    } finally {
      if (!controller.signal.aborted) setImageBusy(null);
    }
  }
  const imagePicker = (kind: ImageKind) => (
    <input
      ref={kind === "cover" ? coverInput : avatarInput}
      type="file"
      accept={accountImageLimits.allowedTypes.join(",")}
      hidden
      aria-label={text[kind]}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) {
          if (
            !(accountImageLimits.allowedTypes as readonly string[]).includes(file.type) ||
            file.size > accountImageLimits.maxBytes ||
            !file.size
          ) {
            setImageError(
              en
                ? "Choose a JPEG, PNG or WebP image up to 8 MiB."
                : "ເລືອກຮູບ JPEG, PNG ຫຼື WebP ຂະໜາດບໍ່ເກີນ 8 MiB.",
            );
            return;
          }
          setImageError("");
          setStudio({
            file,
            kind,
            aspect: cover.current ? cover.current.clientWidth / cover.current.clientHeight : 3,
          });
        }
      }}
    />
  );
  return (
    <div className="settings-page" ref={root}>
      {imagePicker("cover")}
      {imagePicker("avatar")}
      {studio && (
        <ImageStudio
          file={studio.file}
          kind={studio.kind}
          coverAspect={studio.aspect}
          onClose={() => setStudio(null)}
          onSave={(file) => imageAction(studio.kind, file)}
        />
      )}
      <div className="settings-cover" ref={cover}>
        {me!.user.coverUrl ? (
          <img className="settings-cover-image" src={me!.user.coverUrl} alt="" />
        ) : (
          <>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </>
        )}
        <div className="settings-cover-actions">
          {me!.user.coverUrl && (
            <button
              className="settings-image-button"
              disabled={!!imageBusy}
              aria-label={`${text.remove}: ${text.cover}`}
              onClick={() => void imageAction("cover")}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          )}
          <button
            className="settings-image-button"
            disabled={!!imageBusy}
            onClick={() => coverInput.current?.click()}
          >
            <Camera size={16} aria-hidden="true" />
            {text.cover}
            {imageBusy === "cover" && <Skeleton variant="inline" label={text.saving} />}
          </button>
        </div>
      </div>
      <div className="settings-layout">
        <aside className="settings-profile" aria-label={text.title}>
          <div className="settings-avatar">
            <AccountAvatar className="settings-avatar-content" />
            <button
              className="settings-avatar-upload"
              disabled={!!imageBusy}
              onClick={() => avatarInput.current?.click()}
              aria-label={text.avatar}
              title={text.avatar}
            >
              <span>
                <Camera size={17} aria-hidden="true" />
              </span>
            </button>
          </div>
          <div className="settings-profile-heading">
            <h2>{me!.user.displayName}</h2>
            <p>
              {profile.fullName ||
                me!.positions.map((item) => item.label).join(" · ") ||
                me!.memberships.map((item) => item.department.name).join(" · ")}
            </p>
          </div>
          <button className="settings-profile-link" onClick={() => setSection("profile")}>
            <Pencil size={16} aria-hidden="true" />
            {text.profile}
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>
          <p className="settings-image-hint">{text.imageHint}</p>
          {imageBusy === "avatar" && <Skeleton variant="inline" label={text.saving} />}
          {me!.user.avatarUrl && (
            <button
              className="settings-remove-avatar"
              disabled={!!imageBusy}
              onClick={() => void imageAction("avatar")}
            >
              {text.remove}
            </button>
          )}
          <dl className="settings-profile-details">
            <div>
              <dt>
                <UserRound size={15} aria-hidden="true" />
                {text.username}
              </dt>
              <dd>{me!.user.username ?? "—"}</dd>
            </div>
            <div>
              <dt>
                <Building2 size={15} aria-hidden="true" />
                {text.departments}
              </dt>
              <dd>{me!.memberships.map((item) => item.department.name).join(" · ") || "—"}</dd>
            </div>
            {!!me!.positions.length && (
              <div>
                <dt>
                  <Network size={15} aria-hidden="true" />
                  {text.positions}
                </dt>
                <dd>{me!.positions.map((item) => item.label).join(" · ")}</dd>
              </div>
            )}
          </dl>
        </aside>
        <section className="settings-content" aria-labelledby="settings-title">
          <header className="settings-heading">
            <h1 id="settings-title">{text.title}</h1>
            <p>{text.description}</p>
          </header>
          {imageError && (
            <p className="identity-error settings-image-error" role="alert">
              {imageError}
            </p>
          )}
          <div className="settings-filter" role="group" aria-label={text.title}>
            {(["overview", "profile", "security"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={section === value}
                onClick={() => setSection(value)}
              >
                {text[value]}
              </button>
            ))}
          </div>
          {section === "overview" ? (
            <div className="settings-grid settings-personal-grid">
              <article className="settings-card settings-about-card">
                <div className="settings-personal-heading">
                  <h2>{text.about}</h2>
                  <button
                    className="settings-edit"
                    onClick={() => setSection("profile")}
                    aria-label={text.profile}
                  >
                    <Pencil size={17} aria-hidden="true" />
                  </button>
                </div>
                <p className="settings-about-text">{profile.about || text.aboutEmpty}</p>
              </article>
              <article className="settings-card">
                <h2>{text.contact}</h2>
                {profile.contactEmail || profile.phone || profile.address ? (
                  <dl className="settings-contact-details">
                    {profile.contactEmail && (
                      <div>
                        <dt>{text.email}</dt>
                        <dd>{profile.contactEmail}</dd>
                      </div>
                    )}
                    {profile.phone && (
                      <div>
                        <dt>{text.phone}</dt>
                        <dd>{profile.phone}</dd>
                      </div>
                    )}
                    {profile.address && (
                      <div>
                        <dt>{text.address}</dt>
                        <dd>{profile.address}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p>{text.contactEmpty}</p>
                )}
                <button className="settings-profile-link" onClick={() => setSection("profile")}>
                  {text.profile}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </article>
              <article className="settings-card">
                <div className="settings-card-heading">
                  <span className="settings-card-icon">
                    <KeyRound size={22} aria-hidden="true" />
                  </span>
                  <h2>{text.security}</h2>
                </div>
                <p>{text.passwordHint}</p>
                <button className="settings-open" onClick={() => setSection("security")}>
                  {text.password}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </article>
            </div>
          ) : section === "profile" ? (
            <ProfileForm onSaved={() => setSection("overview")} />
          ) : (
            <div className="settings-security">
              <PasswordChange embedded />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProfileForm({ onSaved }: { onSaved: () => void }) {
  const { me, refresh } = useAuth();
  const en = document.documentElement.lang === "en";
  const [draft, setDraft] = useState(() => ({
    ...me!.user.profile,
    displayName: me!.user.displayName,
  }));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const fields = [
    ["fullName", en ? "Full name" : "ຊື່-ນາມສະກຸນ", 200, "text"],
    ["displayName", en ? "Display name / nickname" : "ຊື່ທີ່ສະແດງ / ຊື່ຫຼິ້ນ", 120, "text"],
    ["contactEmail", en ? "Contact email" : "ອີເມວຕິດຕໍ່", 254, "email"],
    ["phone", en ? "Phone number" : "ເບີໂທລະສັບ", 40, "tel"],
  ] as const;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ revision: number }>("/api/v1/me/profile", "PATCH", draft);
      setDraft((value) => ({ ...value, revision: result.revision }));
      await refresh();
      onSaved();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="settings-card settings-profile-form identity-form" onSubmit={submit}>
      <h2>{en ? "Edit personal information" : "ແກ້ໄຂຂໍ້ມູນສ່ວນຕົວ"}</h2>
      {fields.map(([key, label, max, type]) => (
        <label key={key}>
          {label}
          <input
            name={key}
            type={type}
            value={draft[key]}
            maxLength={max}
            required={key === "displayName"}
            autoComplete={
              key === "fullName"
                ? "name"
                : key === "contactEmail"
                  ? "email"
                  : key === "phone"
                    ? "tel"
                    : "nickname"
            }
            onChange={(e) => setDraft((value) => ({ ...value, [key]: e.target.value }))}
          />
        </label>
      ))}
      <label>
        {en ? "Address" : "ທີ່ຢູ່"}
        <textarea
          name="address"
          value={draft.address}
          maxLength={500}
          rows={3}
          autoComplete="street-address"
          onChange={(e) => setDraft((value) => ({ ...value, address: e.target.value }))}
        />
      </label>
      <label>
        {en ? "About me" : "ກ່ຽວກັບຂ້ອຍ"}
        <textarea
          name="about"
          value={draft.about}
          maxLength={2000}
          rows={4}
          onChange={(e) => setDraft((value) => ({ ...value, about: e.target.value }))}
        />
      </label>
      <p className="settings-image-hint">
        {en
          ? "These are your personal profile details. Your sign-in username, department and position stay unchanged."
          : "ຂໍ້ມູນນີ້ເປັນຂໍ້ມູນສ່ວນຕົວ. ບໍ່ປ່ຽນຊື່ຜູ້ໃຊ້ເຂົ້າລະບົບ ພະແນກ ແລະ ຕຳແໜ່ງ."}
      </p>
      {error && (
        <p role="alert" className="identity-error">
          {error}
        </p>
      )}
      <div className="settings-form-actions">
        <button className="settings-profile-link" type="button" disabled={busy} onClick={onSaved}>
          {en ? "Cancel" : "ຍົກເລີກ"}
        </button>
        <button className="settings-open" disabled={busy} type="submit">
          {en ? "Save profile" : "ບັນທຶກໂປຣໄຟລ໌"}
          {busy && <Skeleton variant="inline" label={en ? "Saving…" : "ກຳລັງບັນທຶກ…"} />}
        </button>
      </div>
    </form>
  );
}
