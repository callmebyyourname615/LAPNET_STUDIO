# Document workspace

The authenticated `/document-workspace` page uses PostgreSQL and the document APIs. It does not load demo fixtures. Folder card layout changes remain deferred.

## Endpoints

All paths below start with `/api/v1`. Mutations require the session cookie, trusted Origin and CSRF token.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/document-workspace/config` | Authorized folders, companies, people, departments, tags, file limits and visible storage usage |
| GET | `/document-workspace/documents` | Authorized rows and total; cursor pagination, search, folder/descendants, department, direction, company, tag, state and issue-date filters |
| GET | `/document-workspace/documents/:id` | Metadata, versions, movements, authorized links and history; grants require manage-access permission |
| POST | `/document-workspace/register` | Atomically save metadata, first quarantined file, optional movement/company link, history and scan job |
| PATCH | `/document-workspace/documents/:id` | Update title, metadata, tags, folder or company using the current revision |
| GET/POST | `/document-workspace/folders` | Read visible folders or create a department folder |
| PATCH/DELETE | `/document-workspace/folders/:id` | Rename/move with revision checks and cycle rejection; name-confirmed recursive deletion with per-item authorization |
| POST | `/document-workspace/documents/:id/grants` | Atomically grant view plus the requested permission; repeating an existing grant does not add history or change revision |
| DELETE | `/document-workspace/documents/:id/grants/:grantId` | Revoke one grant and append document history atomically |
| DELETE | `/document-workspace/documents/:id/links/:linkId` | Remove an authorized link and append history |
| GET/POST | `/documents/:id/versions` | Read versions or upload another quarantined file |
| POST | `/documents/:id/movements` | Append a validated receipt/dispatch movement |
| POST | `/document-versions/:id/retry` | Requeue a failed scan |
| GET | `/document-versions/:id/preview` | Authenticated preview with byte ranges |
| GET | `/document-versions/:id/download` | Authenticated attachment |

Registration and version uploads use `Content-Type: application/octet-stream` and raw file bytes. Set `X-File-Name` to the URI-encoded filename and `X-File-Type` to its MIME type (or `application/octet-stream`). Registration additionally requires URI-encoded JSON in `X-Document-Metadata`, matching `documentRegistrationSchema` in `packages/contracts/src/index.ts`. Version notes use URI-encoded `X-Version-Note`.

Files are limited to 25 MiB. Allowed extensions and content checks are defined in `apps/api/src/business/file-types.ts`; executable files, invalid UTF-8 text, mismatched signatures and unsafe ZIP/Office structures are rejected. Internal documents cannot have receipt/dispatch movements. The registration form requires a movement for incoming/outgoing documents; the API accepts an optional movement dated on or after the issue date. Failed registration removes uncommitted bytes and rolls back database records.

## Access and history

Department membership permits creation in that department; it does not grant document reading. Portal administrators do not automatically read documents. Resource ownership, scoped roles and explicit grants determine access. Download permission is separate from view/edit and is also required for preview. Revoking view may leave other grants recorded, but the user cannot read or download until view is restored. Revoke each grant to remove all explicit access for a subject.

Metadata writes, version uploads, movements and workspace access changes append revisions/audit under resource row locks. Generic `/resources/:id/grants/:grantId` remains supported for existing callers and records the identity audit; use the workspace route when document history is required. Storage keys and paths are not returned to the browser.

## Local runtime

Use Node 24.19.0. Apply checked-in migrations with `pnpm db:migrate`, build with `pnpm build`, and run `pnpm dev:api`, `pnpm dev` and `pnpm dev:worker` in separate processes. The existing local database is on port 55432, API on 3100 and web on 5173.

Uploads enter private `.local/storage/quarantine` by default. Set `STORAGE_ROOT` to an absolute private directory if needed. The worker must use the same database and storage directory as the API. Never serve that directory as public/static files. Back up bytes and database together; the database-only backup scripts do not recover document bytes.

For actual malware scanning, configure a local ClamAV daemon and its automatic signature updates, then set `CLAMAV_SIGNATURE_FILE` to the actual updated signature file and either `CLAMD_SOCKET` or `CLAMD_PORT` (default 3310 on loopback) in the worker environment. INSTREAM transports file bytes, so the daemon need not share the storage path. Signatures older than 48 hours, missing signatures, unavailable daemon and malformed scan responses fail closed. Restart the worker after changing its environment. Clean files become available; rejected files remain blocked. An older available version remains downloadable while a new version is quarantined or fails scanning.

## Verification

PDF previews use a locally bundled PDF.js worker and canvas with page navigation and extracted text for assistive technology. This avoids dependence on Chrome's embedded PDF viewer. API preview/download still require download permission and an available file; text previews retain their sandbox. Registration/history timestamps display Asia/Vientiane time.

The local `MOCK PDF testing` folder contains a generated sample document shared with Sunday for view/edit/download. Only those known sample bytes were prepared as available through a local fixture script, with a `document.mock_fixture_prepared` audit event; this is not a ClamAV scan or a bypass for other uploads. Browser verification artifacts are under `output/playwright/document-pdf-audit-results.json` and `output/playwright/document-pdf-audit.png`. `node --test src/features/document-workspace/lib/format.test.ts` covers timestamp offsets and midnight rollover.

`pnpm build:backend` followed by `pnpm test:documents` runs the document integration suite against a disposable local database and private temporary storage. It exercises authentication/CSRF, ACL-filtered queries, rollback, persistent files, concurrent revisions, repeated grants, atomic revocation/history, preview ranges, malware rejection, stale signatures and unavailable scanner, plus API restart persistence. The scan transport uses a deterministic test daemon, not the real ClamAV engine. Run `pnpm test:identity` and `pnpm test:tasks` for authorization/caller regression checks.

## Folder deletion and workflow fixes — 17 November 2026

`DELETE /document-workspace/folders/:id` requires JSON `{ "revision": 1, "confirmationName": "Exact folder name" }`, including for empty folders. The overlay keeps Delete disabled until the entered name matches exactly. The API checks the name and revision again, requires folder-management access to every descendant and manage-access on every active contained document, and rolls back the entire transaction if any item fails. Documents are archived and detached from deleted folders; their history and private file bytes are retained under the existing archive policy. Archived files cannot be previewed or downloaded. Folder removal is permanent; this change does not add a restore UI.

Move dialogs offer folders in the document's owning department, matching API enforcement; top level is available for shared editors. Menus honor API edit/folder-management permissions. Registry rows now receive authorized movements on list loads, so receipt/dispatch dates survive reload. Search reset, stale selection cleanup, default registration department/folder, successful registration reset, exact link removal and WebP/CSV previews are covered by the workflow audit. Browser results: `output/playwright/document-module-audit-results.json`.

Verification for this update: document integration 14/14, identity 16/16, tasks 16/16, foundation 10/10, module browser audit 36 checks, existing PDF workflow 25 checks, PDF pagination/failure/retry checks, plus TypeScript/build/lint/format and regenerated OpenAPI. Integration suites run through their disposable-database commands; plain `pnpm test` skips those three suites. The legacy `pnpm test:business` command cannot run because `business.integration.test.ts` is absent in this checkout.

## Local ClamAV verification — 20 November 2026

The local macOS Portal uses Homebrew ClamAV 1.5.5 with a private socket under `~/.lapnet-portal/clamav`. User LaunchAgents `local.lapnet-portal.clamd` and `local.lapnet-portal.freshclam` start the scanner at sign-in and check for signature updates every two hours. The worker reads `CLAMD_SOCKET` and `CLAMAV_SIGNATURE_FILE` from the local `.env`. The latter points to `daily-signatures`, a symlink to the current daily CVD or CLD file. The local updater follows the file when its extension changes.

The real scanner accepted a clean PDF and detected the standard EICAR test file. In a disposable database, Playwright verified that a Task member could upload a PDF, the Host could preview and download the scanned bytes from Document workspace, and **Retry scan** recovered an upload after a simulated scanner outage. For earlier failed uploads, a user with edit access can try **Document workspace → Versions → Retry scan**. These results cover the local Mac setup.
