CREATE TABLE document_folders (
 id UUID PRIMARY KEY,
 name VARCHAR(120) NOT NULL CHECK (length(btrim(name))>0),
 parent_id UUID REFERENCES document_folders(id) ON DELETE RESTRICT,
 department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
 created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX document_folders_department_id_parent_id_idx ON document_folders(department_id,parent_id);
CREATE UNIQUE INDEX document_folder_sibling_name ON document_folders(department_id,COALESCE(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(btrim(name)));
CREATE TABLE document_metadata (
 document_id UUID PRIMARY KEY REFERENCES business_records(id) ON DELETE RESTRICT,
 department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
 folder_id UUID REFERENCES document_folders(id) ON DELETE RESTRICT,
 registry_number VARCHAR(100),
 CONSTRAINT document_metadata_department_id_registry_number_key UNIQUE (department_id,registry_number)
);
CREATE INDEX document_metadata_folder_id_idx ON document_metadata(folder_id);
ALTER TABLE document_versions ADD COLUMN uploaded_by_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE document_versions ADD COLUMN note VARCHAR(500) NOT NULL DEFAULT '';
UPDATE document_versions v SET uploaded_by_id=r.owner_user_id FROM resources r WHERE r.id=v.document_id;
ALTER TABLE document_movements ADD COLUMN counterparty_name VARCHAR(200) NOT NULL DEFAULT '';
INSERT INTO document_metadata(document_id,department_id)
 SELECT b.id,r.owner_department_id FROM business_records b JOIN resources r ON r.id=b.id WHERE r.kind='document';
-- Department-scoped advisory locks in the service serialize tree edits, including moves.
