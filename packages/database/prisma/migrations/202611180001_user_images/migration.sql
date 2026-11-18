CREATE TABLE user_images (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 kind VARCHAR(10) NOT NULL CHECK (kind IN ('avatar','cover')),
 data BYTEA NOT NULL CHECK (octet_length(data)>0 AND octet_length(data)<=4194304),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
 updated_at TIMESTAMPTZ(3) NOT NULL,
 PRIMARY KEY(user_id,kind)
);
