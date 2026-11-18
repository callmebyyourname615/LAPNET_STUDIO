CREATE TYPE "TaskStatus" AS ENUM ('todo','in_progress','blocked','done','cancelled');
CREATE TYPE "TaskPriority" AS ENUM ('low','normal','high','urgent');
CREATE TABLE tasks (
  id UUID PRIMARY KEY REFERENCES resources(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  number SERIAL NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL CHECK(length(btrim(title))>0),
  description VARCHAR(8000) NOT NULL DEFAULT '',
  status "TaskStatus" NOT NULL DEFAULT 'todo',
  priority "TaskPriority" NOT NULL DEFAULT 'normal',
  due_date DATE,
  assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE task_collaborators (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY(task_id,user_id)
);
CREATE TABLE task_revisions (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  revision INTEGER NOT NULL CHECK(revision>0),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  action TEXT NOT NULL,
  reason VARCHAR(500),
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id,revision)
);
CREATE INDEX tasks_created_at_id_idx ON tasks(created_at,id);
CREATE INDEX tasks_assignee_id_status_created_at_id_idx ON tasks(assignee_id,status,created_at,id);
CREATE INDEX tasks_due_date_status_idx ON tasks(due_date,status);
CREATE INDEX task_collaborators_user_id_task_id_idx ON task_collaborators(user_id,task_id);
GRANT USAGE,SELECT ON SEQUENCE tasks_number_seq TO lapnet_runtime;
REVOKE UPDATE,DELETE,TRUNCATE ON TABLE task_revisions FROM lapnet_runtime;
