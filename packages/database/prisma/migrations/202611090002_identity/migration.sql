-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('portal_admin', 'resource_viewer', 'resource_editor');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "credential_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_secret" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "credential_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_throttles" (
    "key_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "window_started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("key_hash")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PortalRole" NOT NULL,
    "department_id" UUID,
    "granted_by_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_id" UUID,
    "request_id" UUID,
    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "role_assignments_user_id_effective_to_idx" ON "role_assignments"("user_id", "effective_to");

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_id_idx" ON "audit_events"("occurred_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE role_assignments ADD CONSTRAINT role_scope CHECK ((role='portal_admin' AND department_id IS NULL) OR (role<>'portal_admin' AND department_id IS NOT NULL));
ALTER TABLE role_assignments ADD CONSTRAINT role_dates CHECK (effective_to IS NULL OR effective_to>=effective_from);
CREATE UNIQUE INDEX role_current ON role_assignments(user_id,role,department_id) NULLS NOT DISTINCT WHERE effective_to IS NULL;
ALTER TABLE sessions ADD CONSTRAINT session_dates CHECK (idle_expires_at<=expires_at AND expires_at>created_at);
ALTER TABLE login_throttles ADD CONSTRAINT attempts_positive CHECK(attempts>0);
ALTER TABLE users ADD CONSTRAINT username_format CHECK (username IS NULL OR username ~ '^[a-z0-9._-]{3,64}$');
ALTER TABLE audit_events ADD CONSTRAINT audit_metadata_object CHECK(jsonb_typeof(metadata)='object');
REVOKE UPDATE,DELETE,TRUNCATE ON TABLE audit_events FROM lapnet_runtime;
