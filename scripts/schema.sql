CREATE TABLE IF NOT EXISTS operation_state (
  owner text PRIMARY KEY,
  payload text NOT NULL,
  revision integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS team_members (
  id text PRIMARY KEY,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'groomer', 'reception')),
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
CREATE TABLE IF NOT EXISTS route_visits (
  owner text NOT NULL,
  id text NOT NULL,
  service_date date NOT NULL,
  payload jsonb NOT NULL,
  original jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  PRIMARY KEY (owner, id)
);
CREATE INDEX IF NOT EXISTS route_visits_date ON route_visits(owner, service_date);
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check CHECK (role IN ('admin','groomer','reception'));

CREATE TABLE IF NOT EXISTS service_closeouts (
  owner text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('appointment','history')),
  visit_id text NOT NULL,
  payload jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  PRIMARY KEY (owner,kind,visit_id)
);
CREATE TABLE IF NOT EXISTS service_photos (
  owner text NOT NULL,
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('appointment','history')),
  visit_id text NOT NULL,
  pathname text NOT NULL UNIQUE,
  caption text NOT NULL,
  created_at text NOT NULL,
  created_by text NOT NULL,
  deleted_at text
);
CREATE INDEX IF NOT EXISTS service_photos_visit ON service_photos(owner,kind,visit_id);
CREATE TABLE IF NOT EXISTS service_receipt_shares (
  token_hash text PRIMARY KEY,
  owner text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('appointment','history')),
  visit_id text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at text NOT NULL,
  created_by text NOT NULL,
  expires_at text NOT NULL,
  revoked_at text
);
CREATE INDEX IF NOT EXISTS service_receipt_shares_visit ON service_receipt_shares(owner,kind,visit_id);

CREATE TABLE IF NOT EXISTS service_email_outbox (
  id text PRIMARY KEY,
  owner text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('appointment','history')),
  visit_id text NOT NULL,
  signature text NOT NULL,
  recipient text NOT NULL,
  sender text NOT NULL,
  snapshot jsonb NOT NULL,
  share_token text,
  status text NOT NULL CHECK (status IN ('pending','sending','sent','retry','failed','canceled')),
  attempts integer NOT NULL DEFAULT 0,
  created_at text NOT NULL,
  first_attempt_at text,
  next_attempt_at text NOT NULL,
  sent_at text,
  provider_id text,
  error_code text,
  UNIQUE(owner,kind,visit_id,signature)
);
CREATE INDEX IF NOT EXISTS service_email_pending ON service_email_outbox(owner,status,next_attempt_at);

CREATE TABLE IF NOT EXISTS maps_usage (
  owner text NOT NULL,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  service text NOT NULL CHECK (service IN ('routes','geocoding')),
  used integer NOT NULL CHECK (used >= 0 AND used <= 1000),
  PRIMARY KEY (owner,month,service)
);

CREATE TABLE IF NOT EXISTS saved_routes (
  id text PRIMARY KEY,
  owner text NOT NULL,
  service_date date NOT NULL,
  van_id text NOT NULL,
  payload jsonb NOT NULL,
  source_hash text NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','active','replaced','withdrawn')),
  created_at text NOT NULL,
  created_by text NOT NULL,
  published_at text,
  assigned_to text,
  assigned_name text,
  revision integer NOT NULL DEFAULT 0,
  UNIQUE(owner,dedupe_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_routes_one_active ON saved_routes(owner,service_date,van_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS saved_routes_staff_day ON saved_routes(owner,assigned_to,service_date) WHERE status='active';

CREATE TABLE IF NOT EXISTS backup_runs (
  id text PRIMARY KEY,
  owner text NOT NULL,
  schedule_key text NOT NULL,
  started_at text NOT NULL,
  completed_at text,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 1,
  object_name text,
  checksum text,
  bytes integer,
  photo_count integer,
  verification jsonb,
  error_code text,
  UNIQUE(owner,schedule_key)
);
CREATE INDEX IF NOT EXISTS backup_runs_latest ON backup_runs(owner,started_at DESC);
CREATE TABLE IF NOT EXISTS backup_locks (
  owner text PRIMARY KEY,
  run_id text NOT NULL,
  expires_at timestamptz NOT NULL
);
