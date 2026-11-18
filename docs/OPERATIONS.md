# Foundation Operations

## Environment boundaries

This is local development. PostgreSQL is isolated in `.local/postgres` on loopback port 55432; API and web use ports 3100 and 5173. Existing databases, DPO, and LMPS services are not modified.

Production server specifications, domain, certificates, LAN/VPN access, recovery objectives, independent backup device, and operating owners remain unconfirmed. Do not expose the synthetic UI as a production portal.

## Container deployment candidate

The Dockerfile has independent `api`, `web`, and `migrate` targets with registry-verified image digests. API uses the Node user; Nginx uses UID 101. PostgreSQL, future documents, and quarantine have separate persistent volumes. The base Compose definition publishes no database port.

On a Docker-equipped staging machine, copy `.env.compose.example` to a private `.env.compose`. Replace all passwords with different random hexadecimal values and restrict permissions. Do not commit the file or reuse development credentials. From the project root:

```sh
docker compose --env-file .env.compose -f infra/compose/compose.yml build
docker compose --env-file .env.compose -f infra/compose/compose.yml up -d db
docker compose --env-file .env.compose -f infra/compose/compose.yml run --rm migrate
docker compose --env-file .env.compose -f infra/compose/compose.yml run --rm migrate pnpm db:seed
docker compose --env-file .env.compose -f infra/compose/compose.yml up -d api web
docker compose --env-file .env.compose -f infra/compose/compose.yml ps
```

The entry binds to `127.0.0.1:8088` by default. A separately configured trusted HTTPS entry must front it on the company host. This is a deployment candidate, not a verified production deployment. Memory limits are provisional development values, pending host inventory.

For host-based development against a container database, add `-f infra/compose/development.yml`. This publishes PostgreSQL on loopback port 55432; stop the project-owned native database first. Use matching container credentials and loopback client URLs in a separate environment file.

Changing initialization environment variables does not rotate passwords inside an existing volume. Do not run `docker compose down -v` against retained data.

Docker is unavailable on the implementation Mac. Container builds, Nginx execution, container recreation, volume ownership, and actual firewall visibility still require verification on a Docker-equipped target.

## Roles and migrations

- `lapnet_bootstrap`: isolated bootstrap/recovery administration, never the API account.
- `lapnet_migrator`: schema owner without superuser, role-creation, or database-creation privilege.
- `lapnet_runtime`: business-table DML, no schema creation or migration-table access, no superuser or RLS bypass. API pool maximum is five connections.

The API container receives only its runtime URL. Native development uses one private environment file; production must separate runtime, migration, and bootstrap secret delivery and filesystem access.

Deploy checked-in SQL with `pnpm db:migrate`. Review SQL before deployment; do not substitute `prisma db push`. The migration includes effective-date checks, current-record uniqueness, canonical collaboration pairs, and exactly one grant subject. These constraints supplement the Prisma schema.

The repeatable seed inserts missing confirmed organization data. It does not reset changed policies, create employee identities, assign position holders, or infer reading permissions.

## API controls

- Native API binds to loopback; container networking supplies the deployment boundary.
- Readiness checks migrated-table access and the actual socket peer. Forwarded headers are not trusted.
- Health/version endpoints are public. The identity boundary is denied by the global foundation guard. No fake-user header or bearer-token bypass exists.
- Future business controllers remain denied until integrated with Phase 02 authentication and resource authorization.
- Server-generated request IDs correlate method/status/duration logs. Bodies, URL query strings, credentials, cookies, and authorization headers are excluded.
- Safe error envelopes omit submitted values and internal exceptions. JSON bodies are limited to 64 KiB, with bounded HTTP/database timeouts.
- Shared pagination accepts 1–100 records, default 25. Domain cursor ordering and authorization before pagination remain later query responsibilities.
- Responses have no-store/security headers. No Swagger administration route is exposed; OpenAPI is generated offline.

## Recovery rehearsal

`pnpm db:backup` captures a custom-format PostgreSQL dump, non-secret configuration, selected count baselines, and a SHA-256 manifest under `.local/backups/<timestamp>/`. Pause development writes while capturing; comparison counts are not a concurrent snapshot guarantee.

`pnpm db:restore-check` requires the isolated native development configuration. It verifies the checksum, creates a randomly named database using the isolated bootstrap account, restores as the migrator, verifies captured counts, Audit-to-Board reporting, and migration history, then removes only that disposable database.

This is a same-device local capture. It does not prove independent production backup, point-in-time recovery, document-file recovery, or identity-service recovery. Production must add an independent destination, secret/key recovery, coordinated document bytes, operator ownership, and measured RPO/RTO.

## Release and rollback

Record source revision, lockfile, image digests, and migration version per release. Supply a non-secret `RELEASE_REVISION`; never expose environment dumps through the version endpoint.

Application rollback deploys a previous validated build after checking compatibility with the current schema. Database recovery is separate; do not drop tables or overwrite new business data merely to undo an application release. Prefer an explicit forward-fix migration for retained data.

Stop/restart only project-owned processes. Do not replace the server OS or install a global database service as part of local foundation work.
