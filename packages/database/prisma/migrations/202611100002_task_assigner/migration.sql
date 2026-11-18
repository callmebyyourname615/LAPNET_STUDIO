ALTER TABLE tasks ADD COLUMN assigned_by_id UUID;
-- Recover the latest actual assignee change from immutable business revisions.
WITH revisions AS (
  SELECT task_id,actor_id,revision,snapshot->'assignee'->>'id' AS assignee_id,
    lag(snapshot->'assignee'->>'id') OVER (PARTITION BY task_id ORDER BY revision) AS previous_id
  FROM task_revisions
), assignments AS (
  SELECT DISTINCT ON(task_id) task_id,actor_id FROM revisions
  WHERE assignee_id IS DISTINCT FROM previous_id ORDER BY task_id,revision DESC
)
UPDATE tasks t SET assigned_by_id=a.actor_id FROM assignments a WHERE a.task_id=t.id;
UPDATE tasks t SET assigned_by_id=r.owner_user_id FROM resources r WHERE t.id=r.id AND t.assigned_by_id IS NULL;
ALTER TABLE tasks ALTER COLUMN assigned_by_id SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_by_id_fkey FOREIGN KEY(assigned_by_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX tasks_assigned_by_id_created_at_id_idx ON tasks(assigned_by_id,created_at,id);
