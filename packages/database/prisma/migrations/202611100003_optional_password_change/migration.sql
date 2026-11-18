-- User requested direct Dashboard access after valid login.
-- Existing password hashes, memberships, roles and sessions remain unchanged.
ALTER TABLE users ALTER COLUMN must_change_password SET DEFAULT false;
WITH changed AS (
  UPDATE users SET must_change_password=false,updated_at=now()
  WHERE must_change_password=true RETURNING id
)
INSERT INTO audit_events(id,actor_id,action,target_id,metadata)
SELECT gen_random_uuid(),NULL,'auth.password_change_requirement_removed',NULL,
  jsonb_build_object('source','user_requested_policy_change','affectedUsers',count(*))
FROM changed;
