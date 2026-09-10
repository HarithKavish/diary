-- Drop topic: a page name is enough to identify a page under a user
-- (/@handle/page-name instead of /@handle/topic/page-name). Topic may come
-- back later as tags, which are a many-to-many concept, not a path segment.

CREATE TABLE pages_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, slug)
);

INSERT INTO pages_new (id, user_id, slug, title, content, created_at, updated_at)
  SELECT id, user_id, slug, title, content, created_at, updated_at FROM pages;

DROP TABLE pages;
ALTER TABLE pages_new RENAME TO pages;
CREATE INDEX idx_pages_user ON pages(user_id);
