# figma-make-app

## Loading UI

Use the shared `src/components/ui/skeleton.tsx` for every data-loading and route-suspense state, including new modules. Available variants: page, rows, card, dashboard, form, detail, inline. Use inline for pending actions without removing button labels or user input. Shimmer runs through GSAP and @gsap/react, scoped to each instance; animate transforms only. Respect reduced motion, pause hidden/offscreen instances, and revert animations on unmount. Never add fake delays, CSS spinners, or fake loading to synchronous mock data. Errors must stop the skeleton and offer retry. Abort superseded requests so stale results cannot replace current filters. See docs/LOADING_UI.md.

## Phase 03A current behavior

Real accounts use persistent Tasks and a task dashboard in `src/features/tasks/`, with NestJS endpoints in `apps/api/src/tasks/`. Login always validates a real account; the former preview login bypass was removed at the user’s request on 10 November 2026. Task IDs equal Resource UUIDs; `TSK-...` is a database-issued display number. Reuse central authorization, row locks shared with grants, required revisions, atomic history and audit. Track latest assigner independently of resource owner; metadata-only edits must not change assigner. Due dates use SQL DATE and Asia/Vientiane; connections remain UTC. Do not infer ACL from assignments; explicit participant sharing grants view/edit transactionally. Read `docs/PHASE_03A_STATUS.md`. `pnpm test:tasks` uses the disposable database driver. Feed/comments/mentions/notifications remain Phase 03B, and documents/company workflows remain later phases. Query parameters and old browser preview flags cannot bypass authentication.

## Phase 02 current behavior

Username/password authentication, organization management, scoped authorization, resource grants and audit are implemented in `apps/api/src/identity/`. User explicitly chose local accounts and deferred MFA. Successful login goes directly to Dashboard. User explicitly removed mandatory first-login/reset password changes on 10 November 2026; new/reset accounts use mustChangePassword=false, and voluntary changes remain at /account. Password minimum is 6 characters (maximum 128); keep API validators and login/change/confirmation inputs consistent. UI and Phase 02 documentation are Lao. The user superseded the earlier preview request: all Login pages now require real username/password authentication in development and production. The onPreview/noValidate bypass was removed; `?auth=preview` and browser flags have no effect. On local HTTP development only, Origin/CSRF trusts localhost, 127.0.0.1 and [::1] on the configured APP_ORIGIN port. Production retains exactly the configured HTTPS origin. Read `docs/PHASE_02_STATUS.md`, `docs/AUTHENTICATION.md`, and `docs/LOGIN_INTEGRATION.md`. Keep database connections in UTC; a regression test covers SQL-created admin role timestamps on Asia/Vientiane hosts.

## Phase 01 workspace additions

The web app remains at the root. `apps/api` is an independent NestJS TypeScript project; `packages/contracts` and `packages/database` are shared packages. Read `README.md` and `docs/PHASE_01_STATUS.md` for current commands/scope. Use Node 24.19.0. The local portal uses web port 5173, API port 3100, and its own PostgreSQL cluster on port 55432. Preserve other projects and servers. Generate Prisma/build shared packages before API checks. Business routes require planned server-side identity and authorization.

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

Tailwind emits utility classes in `@layer utilities`, and CSS outside any cascade layer overrides every layer regardless of specificity. Put global element styles, such as resets and defaults for `body`, headings, `button`, or `input`, inside `@layer base { ... }` so utility classes on those elements still apply. Tailwind's Preflight already applies `box-sizing: border-box`, removes default margins, and sets `font: inherit` on form controls, so do not repeat those rules.
