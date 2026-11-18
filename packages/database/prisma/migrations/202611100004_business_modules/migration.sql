-- CreateTable
CREATE TABLE "business_records" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "parent_id" UUID,
    "occurred_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_revisions" (
    "id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_links" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "position" VARCHAR(120) NOT NULL DEFAULT '',
    "email" VARCHAR(254),
    "phone" VARCHAR(50) NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_comments" (
    "id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resource_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_jobs" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "resource_id" UUID,
    "recipient_id" UUID,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_until" TIMESTAMPTZ(3),
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "resource_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "filename" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(100) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'quarantined',
    "scan_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_movements" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "counterparty_id" UUID,
    "reference" VARCHAR(200) NOT NULL DEFAULT '',
    "note" VARCHAR(2000) NOT NULL DEFAULT '',
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_revisions" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "actor_id" UUID NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_events" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" JSONB NOT NULL,

    CONSTRAINT "business_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_records_number_key" ON "business_records"("number");

-- CreateIndex
CREATE INDEX "business_records_created_at_id_idx" ON "business_records"("created_at", "id");

-- CreateIndex
CREATE INDEX "business_records_occurred_on_id_idx" ON "business_records"("occurred_on", "id");

-- CreateIndex
CREATE INDEX "business_records_parent_id_idx" ON "business_records"("parent_id");

-- CreateIndex
CREATE INDEX "business_records_data_idx" ON "business_records" USING GIN ("data");

-- CreateIndex
CREATE UNIQUE INDEX "business_revisions_record_id_revision_key" ON "business_revisions"("record_id", "revision");

-- CreateIndex
CREATE INDEX "record_links_target_id_kind_idx" ON "record_links"("target_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "record_links_source_id_target_id_kind_key" ON "record_links"("source_id", "target_id", "kind");

-- CreateIndex
CREATE INDEX "company_contacts_company_id_active_id_idx" ON "company_contacts"("company_id", "active", "id");

-- CreateIndex
CREATE INDEX "resource_comments_resource_id_created_at_id_idx" ON "resource_comments"("resource_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "mentions_source_id_target_type_target_id_recipient_id_key" ON "mentions"("source_id", "target_type", "target_id", "recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_jobs_key_key" ON "outbox_jobs"("key");

-- CreateIndex
CREATE INDEX "outbox_jobs_status_available_at_idx" ON "outbox_jobs"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_key_key" ON "notifications"("key");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_id_idx" ON "notifications"("recipient_id", "read_at", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_storage_key_key" ON "document_versions"("storage_key");

-- CreateIndex
CREATE INDEX "document_versions_state_created_at_idx" ON "document_versions"("state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_number_key" ON "document_versions"("document_id", "number");

-- CreateIndex
CREATE INDEX "document_movements_document_id_occurred_on_id_idx" ON "document_movements"("document_id", "occurred_on", "id");

-- CreateIndex
CREATE INDEX "document_movements_counterparty_id_occurred_on_id_idx" ON "document_movements"("counterparty_id", "occurred_on", "id");

-- CreateIndex
CREATE UNIQUE INDEX "comment_revisions_comment_id_revision_key" ON "comment_revisions"("comment_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "business_events_key_key" ON "business_events"("key");

-- CreateIndex
CREATE INDEX "business_events_company_id_occurred_on_id_idx" ON "business_events"("company_id", "occurred_on", "id");

-- AddForeignKey
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_id_fkey" FOREIGN KEY ("id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_records" ADD CONSTRAINT "business_records_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_revisions" ADD CONSTRAINT "business_revisions_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "business_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_revisions" ADD CONSTRAINT "business_revisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_links" ADD CONSTRAINT "record_links_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_links" ADD CONSTRAINT "record_links_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "business_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_comments" ADD CONSTRAINT "resource_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_jobs_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "business_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_movements" ADD CONSTRAINT "document_movements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "business_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_movements" ADD CONSTRAINT "document_movements_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_movements" ADD CONSTRAINT "document_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_revisions" ADD CONSTRAINT "comment_revisions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "resource_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_revisions" ADD CONSTRAINT "comment_revisions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Runtime history is append-only; numbering belongs to PostgreSQL.
GRANT USAGE, SELECT ON SEQUENCE business_records_number_seq TO lapnet_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON business_revisions, comment_revisions FROM lapnet_runtime;
ALTER TABLE business_records ADD CONSTRAINT business_revision_positive CHECK (revision>0 AND length(btrim(title))>0);
ALTER TABLE document_versions ADD CONSTRAINT version_state CHECK (state IN ('quarantined','scan_failed','available','rejected'));
ALTER TABLE document_versions ADD CONSTRAINT version_size CHECK (bytes>0 AND bytes<=26214400 AND number>0);
ALTER TABLE outbox_jobs ADD CONSTRAINT job_state CHECK (status IN ('pending','processing','failed','done') AND attempts>=0);
ALTER TABLE document_movements ADD CONSTRAINT movement_direction CHECK (direction IN ('incoming','outgoing'));
ALTER TABLE mentions ADD CONSTRAINT mention_target_type CHECK (target_type IN ('user','department','position'));
