-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "ResourceKind" AS ENUM ('post', 'task', 'document', 'company', 'interaction');

-- CreateEnum
CREATE TYPE "ResourcePermission" AS ENUM ('view', 'comment', 'edit', 'manage_access', 'download');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "identity_subject" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "membership_role" TEXT NOT NULL DEFAULT 'member',
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),

    CONSTRAINT "department_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_assignments" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),

    CONSTRAINT "position_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reporting_lines" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMPTZ(3),

    CONSTRAINT "reporting_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_links" (
    "id" UUID NOT NULL,
    "department_a_id" UUID NOT NULL,
    "department_b_id" UUID NOT NULL,

    CONSTRAINT "collaboration_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "kind" "ResourceKind" NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "owner_department_id" UUID NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'restricted',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_grants" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "user_id" UUID,
    "department_id" UUID,
    "permission" "ResourcePermission" NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "resource_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_identity_subject_key" ON "users"("identity_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE INDEX "department_memberships_user_id_department_id_effective_to_idx" ON "department_memberships"("user_id", "department_id", "effective_to");

-- CreateIndex
CREATE INDEX "position_assignments_position_id_effective_to_idx" ON "position_assignments"("position_id", "effective_to");

-- CreateIndex
CREATE INDEX "reporting_lines_department_id_effective_to_idx" ON "reporting_lines"("department_id", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_links_department_a_id_department_b_id_key" ON "collaboration_links"("department_a_id", "department_b_id");

-- CreateIndex
CREATE INDEX "resources_owner_user_id_kind_idx" ON "resources"("owner_user_id", "kind");

-- CreateIndex
CREATE INDEX "resources_owner_department_id_kind_idx" ON "resources"("owner_department_id", "kind");

-- CreateIndex
CREATE INDEX "resource_grants_user_id_revoked_at_resource_id_idx" ON "resource_grants"("user_id", "revoked_at", "resource_id");

-- CreateIndex
CREATE INDEX "resource_grants_department_id_revoked_at_resource_id_idx" ON "resource_grants"("department_id", "revoked_at", "resource_id");

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_memberships" ADD CONSTRAINT "department_memberships_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_links" ADD CONSTRAINT "collaboration_links_department_a_id_fkey" FOREIGN KEY ("department_a_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_links" ADD CONSTRAINT "collaboration_links_department_b_id_fkey" FOREIGN KEY ("department_b_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_owner_department_id_fkey" FOREIGN KEY ("owner_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_grants" ADD CONSTRAINT "resource_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Foundation grants represent exactly one subject and preserve effective-date integrity.
ALTER TABLE resource_grants ADD CONSTRAINT grant_exactly_one_subject CHECK (num_nonnulls(user_id, department_id) = 1);
ALTER TABLE collaboration_links ADD CONSTRAINT collaboration_canonical_order CHECK (department_a_id < department_b_id);
ALTER TABLE department_memberships ADD CONSTRAINT membership_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE position_assignments ADD CONSTRAINT position_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);
ALTER TABLE reporting_lines ADD CONSTRAINT reporting_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);
CREATE UNIQUE INDEX membership_current ON department_memberships(user_id, department_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX position_holder_current ON position_assignments(position_id, user_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX reporting_current ON reporting_lines(department_id) WHERE effective_to IS NULL;
CREATE UNIQUE INDEX grant_current_user ON resource_grants(resource_id, user_id, permission) WHERE revoked_at IS NULL AND user_id IS NOT NULL;
CREATE UNIQUE INDEX grant_current_department ON resource_grants(resource_id, department_id, permission) WHERE revoked_at IS NULL AND department_id IS NOT NULL;
REVOKE ALL ON TABLE _prisma_migrations FROM lapnet_runtime;
