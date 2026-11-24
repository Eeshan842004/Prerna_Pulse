-- Prerana Pulse schema v2 (PostgreSQL 14+): band-only. The child uses only the band.
-- Every tenant table carries school_id and is protected by row-level security.
-- The API connects as pp_app, which is subject to RLS. Background workers set
-- app.role = 'system' to work across schools.

-- gen_random_uuid() is built in since PostgreSQL 13, so no extension is needed.

-- Upgrade from the v1 (tablet) schema: the case model changed, so v1 demo data is replaced.
DO $$
BEGIN
  IF to_regclass('public.cases') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cases' AND column_name = 'route') THEN
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS schools (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  tz               text NOT NULL DEFAULT 'Asia/Kolkata',
  day_start        time NOT NULL DEFAULT '08:00',
  day_end          time NOT NULL DEFAULT '15:30',
  staff_end        time NOT NULL DEFAULT '16:00',
  school_days      int[] NOT NULL DEFAULT '{1,2,3,4,5,6}',   -- ISO weekday, Mon = 1
  holidays         date[] NOT NULL DEFAULT '{}',
  pocso_on_sos     boolean NOT NULL DEFAULT false,
  data_key_wrapped bytea NOT NULL,                             -- per-school key, wrapped by MASTER_KEY
  school_id        uuid GENERATED ALWAYS AS (id) STORED
);

CREATE TABLE IF NOT EXISTS classes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES schools(id),
  name             text NOT NULL,
  class_teacher_id uuid
);

-- From the ERP timetable. Rows with pauses_sensing stop the band from asking (PT, games, yoga, dance).
CREATE TABLE IF NOT EXISTS timetable (
  id             bigserial PRIMARY KEY,
  school_id      uuid NOT NULL REFERENCES schools(id),
  class_id       uuid NOT NULL REFERENCES classes(id),
  weekday        int NOT NULL,
  start_time     time NOT NULL,
  end_time       time NOT NULL,
  subject        text NOT NULL,
  pauses_sensing boolean NOT NULL DEFAULT false
);

-- Students are stored by ERP reference only. Names come from the ERP adapter at display time.
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES schools(id),
  role          text NOT NULL CHECK (role IN ('student','teacher','counsellor','principal','pocso','nurse','management','admin','parent')),
  erp_ref       text NOT NULL,
  class_id      uuid REFERENCES classes(id),
  age_pack      text NOT NULL DEFAULT 'teen' CHECK (age_pack IN ('junior','teen')),
  can_be_chosen boolean NOT NULL DEFAULT false,
  language      text NOT NULL DEFAULT 'en',
  child_id      uuid,                                          -- for parents
  UNIQUE (school_id, erp_ref)
);

CREATE TABLE IF NOT EXISTS trusted_adults (
  student_id uuid PRIMARY KEY REFERENCES users(id),
  school_id  uuid NOT NULL REFERENCES schools(id),
  adult_id   uuid NOT NULL REFERENCES users(id),
  chosen_at  timestamptz NOT NULL DEFAULT now()
);

-- DPDP consent switches, set by the parent.
CREATE TABLE IF NOT EXISTS consents (
  student_id            uuid PRIMARY KEY REFERENCES users(id),
  school_id             uuid NOT NULL REFERENCES schools(id),
  sensing               boolean NOT NULL DEFAULT true,
  feelings_to_counsellor boolean NOT NULL DEFAULT true,
  given_by              text NOT NULL DEFAULT 'parent (admission form)',
  given_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS health_profiles (
  student_id    uuid PRIMARY KEY REFERENCES users(id),
  school_id     uuid NOT NULL REFERENCES schools(id),
  pause_sensing boolean NOT NULL DEFAULT false,
  nurse_on_sos  boolean NOT NULL DEFAULT false,
  note          text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bands (
  id           bigint PRIMARY KEY,                             -- 32-bit device id, never sent on air
  school_id    uuid NOT NULL REFERENCES schools(id),
  student_id   uuid REFERENCES users(id),
  key          bytea NOT NULL,                                 -- 16-byte AES key, flashed at handout
  last_counter bigint NOT NULL DEFAULT 0,
  last_seen    timestamptz,
  battery      int,
  revoked      boolean NOT NULL DEFAULT false,
  pt_until     timestamptz,                                    -- PT mode: noticing is paused until then
  model        jsonb NOT NULL DEFAULT '{"n":0,"f":{},"x":{}}' -- this child's own feeling model, synced to the band nightly
);

-- Each gateway has a known place on the school map: that is how an SOS gets a location.
CREATE TABLE IF NOT EXISTS gateways (
  id             text PRIMARY KEY,
  school_id      uuid NOT NULL REFERENCES schools(id),
  kind           text NOT NULL,                                -- esp32-hub, school-pc, office-root
  location       text NOT NULL,
  map_x          real NOT NULL DEFAULT 0,
  map_y          real NOT NULL DEFAULT 0,
  token_hash     text NOT NULL,
  last_heartbeat timestamptz,
  version        text
);

CREATE TABLE IF NOT EXISTS band_events (
  id          bigserial PRIMARY KEY,
  school_id   uuid NOT NULL REFERENCES schools(id),
  band_id     bigint NOT NULL REFERENCES bands(id),
  counter     bigint NOT NULL,
  type        int NOT NULL,
  arg         int NOT NULL,
  received_at timestamptz NOT NULL,
  gateways    text[] NOT NULL,
  receipt     bytea NOT NULL,
  UNIQUE (band_id, counter)                                    -- two gateways, one event
);

-- Which gateway heard a band, and how strongly. During an SOS the strongest recent one is the place shown.
CREATE TABLE IF NOT EXISTS sightings (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id),
  band_id    bigint NOT NULL REFERENCES bands(id),
  gateway_id text NOT NULL,
  rssi       int NOT NULL,
  at         timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sightings_band ON sightings (band_id, at DESC);

CREATE SEQUENCE IF NOT EXISTS case_ref_seq START 101;

CREATE TABLE IF NOT EXISTS cases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES schools(id),
  ref              text NOT NULL,
  student_id       uuid REFERENCES users(id),
  kind             text NOT NULL CHECK (kind IN ('talk','sos','medical_sos')),
  route            text CHECK (route IN ('adult','counsellor','staff')),   -- who a talk request is for; NULL for SOS
  rung             text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','responded','resolved','cancelled')),
  level            int NOT NULL DEFAULT 1,
  about_staff_id   uuid REFERENCES users(id),
  recipients       uuid[] NOT NULL DEFAULT '{}',              -- who must respond now
  ever_recipients  uuid[] NOT NULL DEFAULT '{}',              -- everyone the case was routed to
  deadline         timestamptz,
  level_started_at timestamptz,
  created_at       timestamptz NOT NULL,
  acknowledged_at  timestamptz,
  first_response_at timestamptz,
  last_activity_at timestamptz NOT NULL,
  going_by         uuid REFERENCES users(id),                  -- SOS: who tapped "I'm going"
  call             jsonb,                                       -- Call to talk: {by, when, where, tomorrow, message_id}
  location_gateway text,                                        -- SOS: strongest recent gateway
  location_at      timestamptz,
  trail            jsonb NOT NULL DEFAULT '[]',                -- SOS: where the child has been, in order
  version          int NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS cases_school_status ON cases (school_id, status);

-- Short messages (max 60 characters) shown on the band, from adult-side quick choices.
CREATE TABLE IF NOT EXISTS band_messages (
  id           bigserial PRIMARY KEY,
  school_id    uuid NOT NULL REFERENCES schools(id),
  band_id      bigint NOT NULL REFERENCES bands(id),
  case_id      uuid REFERENCES cases(id),
  from_user    uuid REFERENCES users(id),
  kind         text NOT NULL,                                  -- call | coming | moved
  vars         jsonb NOT NULL DEFAULT '{}',
  text         text NOT NULL CHECK (char_length(text) <= 60),
  created_at   timestamptz NOT NULL,
  delivered_at timestamptz,
  seen_at      timestamptz
);

CREATE TABLE IF NOT EXISTS case_events (
  id        bigserial PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  case_id   uuid NOT NULL REFERENCES cases(id),
  at        timestamptz NOT NULL,
  actor_id  uuid REFERENCES users(id),
  kind      text NOT NULL,
  detail    jsonb NOT NULL DEFAULT '{}',
  prev_hash bytea NOT NULL,
  hash      bytea NOT NULL                                     -- sha256(prev_hash || event), append-only chain
);
CREATE INDEX IF NOT EXISTS case_events_case ON case_events (case_id, id);

CREATE TABLE IF NOT EXISTS timers (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id),
  case_id    uuid NOT NULL REFERENCES cases(id),
  kind       text NOT NULL CHECK (kind IN ('escalate','remind','sos_repeat')),
  level      int NOT NULL,
  due_at     timestamptz NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}',
  done       boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS timers_due ON timers (due_at) WHERE NOT done;

-- Alerts leave through the outbox, so a crash can repeat one but never lose one.
-- kind + vars let the apps show the text in English or Hindi; title/body are the English fallback.
CREATE TABLE IF NOT EXISTS outbox (
  id              bigserial PRIMARY KEY,
  school_id       uuid NOT NULL REFERENCES schools(id),
  channel         text NOT NULL CHECK (channel IN ('push','sms','call_task','panel')),
  to_user         uuid REFERENCES users(id),
  kind            text,
  vars            jsonb NOT NULL DEFAULT '{}',
  title           text NOT NULL,
  body            text NOT NULL,
  case_id         uuid REFERENCES cases(id),
  created_at      timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  attempts        int NOT NULL DEFAULT 0,
  sent_at         timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox (next_attempt_at) WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS notifications (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id),
  user_id    uuid REFERENCES users(id),                        -- NULL = office panel
  channel    text NOT NULL,
  kind       text,
  vars       jsonb NOT NULL DEFAULT '{}',
  title      text NOT NULL,
  body       text NOT NULL,
  case_id    uuid REFERENCES cases(id),
  created_at timestamptz NOT NULL,
  read_at    timestamptz
);

-- What the child chose on the band (and skipped questions, code 0). Private by default.
CREATE TABLE IF NOT EXISTS feelings (
  id            bigserial PRIMARY KEY,
  school_id     uuid NOT NULL REFERENCES schools(id),
  student_id    uuid NOT NULL REFERENCES users(id),
  code          int NOT NULL,                                  -- 1..10; 0 = a question left unanswered
  skipped       boolean NOT NULL DEFAULT false,
  suggested     int,
  accepted      boolean,
  ctx           jsonb NOT NULL DEFAULT '{}',                   -- context the model used (period, rise, movement ...)
  source        text NOT NULL DEFAULT 'band-ask',              -- band-ask | band-self
  model_updated boolean NOT NULL DEFAULT false,
  at            timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS feelings_student ON feelings (student_id, at DESC);

CREATE TABLE IF NOT EXISTS exercises (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id),
  student_id uuid NOT NULL REFERENCES users(id),
  result     text NOT NULL,                                    -- better | talk | none
  at         timestamptz NOT NULL
);

-- Anonymous class answers for "class weather": there is deliberately no student column.
CREATE TABLE IF NOT EXISTS mood (
  id        bigserial PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id),
  class_id  uuid NOT NULL REFERENCES classes(id),
  code      int NOT NULL,
  at        timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id           bigserial PRIMARY KEY,
  school_id    uuid NOT NULL REFERENCES schools(id),
  rule         text NOT NULL,
  rule_version int NOT NULL,
  student_id   uuid REFERENCES users(id),
  class_id     uuid REFERENCES classes(id),
  to_user      uuid REFERENCES users(id),
  detail       jsonb NOT NULL DEFAULT '{}',
  at           timestamptz NOT NULL
);

-- Every staff read needs a reason. `key` is a case id or "st:<student id>".
CREATE TABLE IF NOT EXISTS access_log (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  key        text NOT NULL,
  case_id    uuid REFERENCES cases(id),
  student_id uuid REFERENCES users(id),
  reason     text NOT NULL,
  at         timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id            bigserial PRIMARY KEY,
  school_id     uuid NOT NULL REFERENCES schools(id),
  class_id      uuid NOT NULL REFERENCES classes(id),
  activity_code text NOT NULL,
  day           date NOT NULL,
  done_at       timestamptz,
  UNIQUE (class_id, activity_code, day)
);

-- What the counsellor chose to share with a parent. Never automatic.
CREATE TABLE IF NOT EXISTS parent_messages (
  id         bigserial PRIMARY KEY,
  school_id  uuid NOT NULL REFERENCES schools(id),
  student_id uuid NOT NULL REFERENCES users(id),
  from_user  uuid NOT NULL REFERENCES users(id),
  nonce      bytea NOT NULL,
  text_enc   bytea NOT NULL,                                   -- AES-256-GCM with the school's key
  created_at timestamptz NOT NULL,
  read_at    timestamptz
);

-- Row-level security on every tenant table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schools','classes','timetable','users','trusted_adults','consents','health_profiles','bands',
    'gateways','band_events','sightings','cases','band_messages','case_events','timers','outbox','notifications',
    'feelings','exercises','mood','alerts','access_log','activities','parent_messages']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant ON %I', t);
    EXECUTE format($p$CREATE POLICY tenant ON %I USING (
        current_setting('app.role', true) = 'system'
        OR school_id::text = current_setting('app.school_id', true))$p$, t);
  END LOOP;
END $$;

-- Case events are append-only.
CREATE OR REPLACE FUNCTION pp_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'case_events is append-only'; END $$;
DROP TRIGGER IF EXISTS case_events_append_only ON case_events;
CREATE TRIGGER case_events_append_only BEFORE UPDATE OR DELETE ON case_events
  FOR EACH ROW EXECUTE FUNCTION pp_no_update();
