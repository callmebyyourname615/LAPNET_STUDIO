# Personal account and Image Studio

The Portal sidebar account button opens `/settings` directly. The top-bar profile button opens Settings and Logout using Radix keyboard/focus behavior and scoped GSAP animations. Navigation from Document retains `/document-workspace/portal/settings` and the Document platform selection. Successful login/logout has no success toast. Pending actions retain their labels with the shared inline Skeleton; errors preserve the form and offer another attempt.

Settings uses the Portal design tokens, cover banner, overlapping profile panel and responsive content columns. Overview, Edit profile and Security belong to the signed-in account. Editable information includes full name, display name/nickname, contact email, phone, address and an introduction. Username, department, position and permissions remain managed by the organization. Legacy developer-profile database fields remain compatible but are not shown in the personal form. Security uses the real voluntary password-change endpoint with the existing 6–128-character policy.

## Password form

Settings Security and `/account` share `src/components/ui/password-change-card.tsx`. The card uses Portal tokens, a bounded width, left-aligned copy and paired new/confirmation fields on desktop; small screens stack the fields. Each field has a visibility toggle, password-manager autocomplete and a linked label. Length/mismatch feedback appears near the field after blur or submit. Pending saves keep their label and show the shared inline Skeleton; entered values remain after recoverable failed saves, and successful saves clear the fields. The 6–128-character policy, authenticated password endpoint, session rotation and server audit remain unchanged. The isolated `password-change-card.preview.tsx` shows eight states and is not mounted in production. Local browser validation recorded 33 checks in ignored `output/playwright/password-card-results.json`, covering real password rotation, error/retry, pending controls, masking, validation, Document context and widths 320/375/414/768px; contrast pairs are recorded in `password-card-contrast.json`.

## Image Studio

Choosing a JPEG, PNG or WebP image (up to 8 MiB) opens the shared Image Studio dialog before uploading. Both avatar and cover support dragging, touch/keyboard framing, zoom, rotation, brightness, contrast and saturation. Original, Vivid and B&W presets and a live preview show the current result. Avatar framing is circular; cover framing defaults to the banner dimensions, with 3:1 and 16:9 alternatives. Cancel or Escape leaves the saved image unchanged. Save exports the selected crop and adjustments, then uploads the edited pixels. Failed saves retain the edits for retry.

The dialog traps focus, supports reduced motion and uses scoped GSAP transform/opacity entrance animations. Desktop controls scroll independently; mobile stacks the crop and controls above a persistent action footer. Object URLs, animation frames and GSAP contexts are cleaned up on unmount. Pending image decoding and saving use the shared Skeleton.

## Persistence and API

- `GET /api/v1/me` returns personal fields and versioned own-image URLs.
- `PATCH /api/v1/me/profile` updates the personal form with an optimistic revision check.
- `PUT /api/v1/me/images/avatar` and `/cover` accept raw `application/octet-stream` image data.
- `GET` and `DELETE` on those image endpoints read or remove the current account's image.

Mutations require a real session and CSRF protection. Image endpoints operate on the authenticated account, without accepting an owner identifier. The server validates image signatures, dimensions and size, rejects animated/unsupported images, strips metadata and re-encodes WebP. Avatar output is 512 × 512; cover output preserves the edited aspect ratio within 2400 × 1200. Processing concurrency is bounded. Profile/image writes use transactions, user row locks and audit events without storing contact details or pixels in audit metadata.

Personal fields and normalized image bytes live in PostgreSQL, so they survive reloads and API restarts and are included in database backups. The existing database backup and restore procedures apply; there is no separate public upload directory. Existing authentication and organization authorization remain in force.

## Source and validation

The page is `src/features/identity/Settings.tsx`; shared components are `src/components/ui/image-studio.tsx`, `account-avatar.tsx` and `profile-menu.tsx`, with adjacent styles and `tokens.css`. Server code is in `apps/api/src/identity/{images,profile}.service.ts` and `images.controller.ts`. Contracts and SQL migrations live in the shared packages.

Run `pnpm test:account` for disposable-database integration coverage, including CSRF, cross-account isolation, malformed uploads, profile revisions, concurrent replacements, API restart persistence and removal. `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm format:check` and `pnpm test` cover the workspace checks. The local browser validation recorded 21 checks in ignored `output/playwright/account-browser-results.json`, including saved grayscale pixels, reload persistence, mobile layout, cancellation, password form and retained Document selection. Its screenshots are local validation artifacts and are not published with the repository.
