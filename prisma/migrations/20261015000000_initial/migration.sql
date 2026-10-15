-- Existing table names are preserved when adopting Prisma.
CREATE TABLE hi_fie_users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 32),
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE hi_fie_rooms (
  code VARCHAR(5) PRIMARY KEY CHECK (code ~ '^[A-Z2-9]{5}$'),
  updated BIGINT NOT NULL
);
CREATE TABLE hi_fie_members (
  room_code VARCHAR(5) NOT NULL REFERENCES hi_fie_rooms(code) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES hi_fie_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  seen BIGINT NOT NULL,
  PRIMARY KEY (room_code, user_id)
);
CREATE TABLE hi_fie_messages (
  sequence BIGSERIAL PRIMARY KEY,
  id UUID NOT NULL UNIQUE,
  room_code VARCHAR(5) NOT NULL REFERENCES hi_fie_rooms(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  system BOOLEAN NOT NULL DEFAULT FALSE,
  user_id UUID REFERENCES hi_fie_users(id) ON DELETE SET NULL,
  at BIGINT NOT NULL
);
CREATE INDEX hi_fie_messages_room_order ON hi_fie_messages(room_code, sequence DESC);
CREATE INDEX hi_fie_members_seen ON hi_fie_members(seen);
CREATE INDEX hi_fie_rooms_updated ON hi_fie_rooms(updated);
CREATE TABLE hi_fie_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  until_ms BIGINT NOT NULL
);
CREATE INDEX hi_fie_rate_limits_expiration ON hi_fie_rate_limits(until_ms);
