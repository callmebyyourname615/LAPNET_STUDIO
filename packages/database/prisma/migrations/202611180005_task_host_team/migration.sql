ALTER TABLE resource_grants ADD COLUMN source varchar(20) NOT NULL DEFAULT 'manual';
ALTER TABLE resource_grants ADD CONSTRAINT grant_source CHECK (source IN ('manual','task_team'));
DROP INDEX grant_current_user;
CREATE UNIQUE INDEX grant_current_user ON resource_grants(resource_id,user_id,permission,source) WHERE revoked_at IS NULL AND user_id IS NOT NULL;
DROP INDEX grant_current_department;
CREATE UNIQUE INDEX grant_current_department ON resource_grants(resource_id,department_id,permission,source) WHERE revoked_at IS NULL AND department_id IS NOT NULL;

CREATE TABLE task_tagged_departments (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  PRIMARY KEY(task_id,department_id)
);
CREATE INDEX task_tagged_departments_department_id_task_id_idx ON task_tagged_departments(department_id,task_id);
