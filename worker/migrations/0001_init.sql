-- Diary backend schema.
--
-- Identity comes from account.harithkavish.com's OAuth server: users.id is
-- that account's stable UUID (the token's `sub`), never a Diary-invented id.
-- Diary never sees a password or the ecosystem session cookie -- only this id
-- and the profile fields userinfo hands back.

CREATE TABLE users (
  id TEXT PRIMARY KEY,               -- account UUID (oauth `sub`)
  handle TEXT UNIQUE NOT NULL,       -- the public @handle used in every URL
  name TEXT NOT NULL,
  picture TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Opaque bearer sessions, DB-backed rather than signed, so a session can be
-- revoked by deleting the row instead of waiting out a token's expiry.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,               -- random token, held in an httpOnly cookie
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Every page is public to read; only its owner may write it, enforced in the
-- API layer (the owner is whoever the session resolves to, checked against
-- user_id on every write).
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, topic, slug)
);
CREATE INDEX idx_pages_user ON pages(user_id);
