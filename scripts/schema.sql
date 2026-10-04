CREATE TABLE IF NOT EXISTS operation_state (
  owner text PRIMARY KEY,
  payload text NOT NULL,
  revision integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS team_members (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'groomer')),
  van_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  user_id text UNIQUE,
  invite_hash text UNIQUE,
  invite_expires text,
  version integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  legacy_identity boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS team_audit (
  id text PRIMARY KEY,
  at text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL
);
