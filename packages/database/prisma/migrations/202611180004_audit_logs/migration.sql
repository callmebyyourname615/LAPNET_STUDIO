ALTER TABLE audit_events ADD COLUMN outcome varchar(10) NOT NULL DEFAULT 'success';
ALTER TABLE audit_events ADD CONSTRAINT audit_outcome CHECK (outcome IN ('success','failure'));
UPDATE audit_events SET outcome='failure' WHERE action IN ('auth.login_failed','auth.login_rate_limited');
CREATE INDEX audit_events_actor_id_occurred_at_id_idx ON audit_events(actor_id,occurred_at,id);
CREATE INDEX audit_events_action_occurred_at_id_idx ON audit_events(action,occurred_at,id);
