# Phase 01 Implementation Evidence

Date: 9 November 2026
State: Local foundation implemented; production/staging exit gate remains open.

## Delivered

- pnpm workspace: independent root web and NestJS TypeScript API projects, contracts/database packages.
- Existing UI retained. API, packages, and database/recovery scripts have strict TypeScript checks. Generated JavaScript is ignored build output.
- Pinned Node 24.19.0, pnpm 10.18.0, NestJS 12.4.0, and Prisma 7.10.1 stable dependencies.
- Isolated PostgreSQL 18.3, persistent native storage, separate bootstrap/migration/runtime roles, SQL migration, and repeatable organization seed.
- Five departments, three supervisory positions, five reporting lines, seven collaboration pairs; no inferred reading grants or employee identities.
- Resource/grant schema with integrity constraints, preparing for Phase 02 authorization behavior.
- Versioned API boundary, health/readiness, closed identity endpoint, OpenAPI, shared contracts, safe errors, request IDs, bounded inputs/pool/timeouts, and redacted request logging.
- Same-origin Vite proxy and typed web API client verified in a browser.
- TypeScript native database lifecycle, verification, dump/config capture, and isolated restore tools.
- Independent container targets, pinned image digests, private Compose networks/volumes, Nginx routing, secret examples, and a CI definition.
- Local Git initialized. No remote publishing or production deployment.

## Verified locally

| Check | Evidence |
|---|---|
| Install/migrate/seed | Workspace install and initial migration succeeded; correct organization relationships |
| API tests | Eight tests: liveness, dependency failure/recovery, version contract, forged-identity denial, unknown endpoint, malformed/oversized JSON, bounded validation, configuration rejection |
| Build/types/lint/format | Production web/API builds and checks for API, packages, web types, and scripts passed |
| Dependency advisory check | `pnpm audit --prod` reported zero advisories on this run; this does not establish container or application security |
| Runtime privileges | Cannot create a table or read migration history; privileged role flags false |
| Production dependency package | `pnpm deploy --legacy --prod` API package ran separately with runtime-only configuration, readiness 200 and identity 401; this does not verify the Docker image |
| Grant integrity | No-subject grant rejected in a rolled-back synthetic transaction |
| Persistence | Synthetic probe survived PostgreSQL restart, then was removed |
| Restore | Dump checksum and captured counts verified in a disposable database, with Audit reporting and migration checks |
| Browser/API | Typed browser client read version via port 5173; identity request denied with 401; supplied logo retained and sidebar DEMO badge absent |
| Existing UI regression | 57 browser checks passed across 360, 768, 1280, and 1600 px, including task create/filter/status and document filters; no new console errors |

Restore example: backup `2026-11-09T07-16-21-389Z`; small synthetic restore/check completed in 812 ms. This is not a production RTO or load-performance claim.

## Remaining Phase 01 gates

1. Confirm production hardware/OS, current workloads, resources, DNS/network access, and operators.
2. Build/run containers on a Docker-equipped host; verify recreation persistence, private volume ownership, and actual port restrictions.
3. Configure trusted HTTPS/renewal, management accounts, firewall, staging/production separation.
4. Execute CI in the selected repository service; its definition has not run remotely.
5. Establish independent backups, log/disk/backup alerts, protected recovery credentials, and staging restore evidence on the selected host.
6. Introduce the worker with Phase 03 durable jobs and the authorization package with Phase 02 behavior; empty placeholder applications were avoided.

The visible task, feed, company, document, administration, and login journeys remain synthetic. Phase 02 establishes identity and authorization before business API access. Phase 03 connects persistent tasks.
