import type { Env } from "./env";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,79})$/;

export function normalizeSlug(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return SLUG_RE.test(candidate) ? candidate : null;
}

export interface PageRow {
  id: string;
  topic: string;
  slug: string;
  title: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export async function listPagesForHandle(env: Env, handle: string): Promise<PageRow[] | null> {
  const user = await env.DB.prepare("SELECT id FROM users WHERE handle = ?").bind(handle).first<{ id: string }>();
  if (!user) return null;
  const { results } = await env.DB.prepare(
    "SELECT id, topic, slug, title, content, created_at, updated_at FROM pages WHERE user_id = ? ORDER BY updated_at DESC",
  )
    .bind(user.id)
    .all<PageRow>();
  return results;
}

export async function getPage(env: Env, handle: string, topic: string, slug: string): Promise<PageRow | null> {
  const row = await env.DB.prepare(
    `SELECT p.id, p.topic, p.slug, p.title, p.content, p.created_at, p.updated_at
     FROM pages p JOIN users u ON u.id = p.user_id
     WHERE u.handle = ? AND p.topic = ? AND p.slug = ?`,
  )
    .bind(handle, topic, slug)
    .first<PageRow>();
  return row ?? null;
}

export async function createPage(
  env: Env,
  userId: string,
  input: { topic: string; slug: string; title: string; content: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const topic = normalizeSlug(input.topic);
  const slug = normalizeSlug(input.slug);
  if (!topic || !slug) return { ok: false, error: "invalid_topic_or_slug" };
  if (!input.title.trim()) return { ok: false, error: "title_required" };

  const existing = await env.DB.prepare(
    "SELECT id FROM pages WHERE user_id = ? AND topic = ? AND slug = ?",
  )
    .bind(userId, topic, slug)
    .first<{ id: string }>();
  if (existing) return { ok: false, error: "already_exists" };

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO pages (id, user_id, topic, slug, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, topic, slug, input.title.trim(), input.content ?? "", now, now)
    .run();

  return { ok: true, id };
}

export async function updatePage(
  env: Env,
  userId: string,
  handle: string,
  topic: string,
  slug: string,
  input: { title?: string; content?: string },
): Promise<"ok" | "not_found" | "forbidden"> {
  const row = await env.DB.prepare(
    `SELECT p.user_id FROM pages p JOIN users u ON u.id = p.user_id
     WHERE u.handle = ? AND p.topic = ? AND p.slug = ?`,
  )
    .bind(handle, topic, slug)
    .first<{ user_id: string }>();

  if (!row) return "not_found";
  if (row.user_id !== userId) return "forbidden";

  const title = input.title?.trim();
  await env.DB.prepare(
    `UPDATE pages SET
       title = COALESCE(?, title),
       content = COALESCE(?, content),
       updated_at = ?
     WHERE user_id = ? AND topic = ? AND slug = ?`,
  )
    .bind(title || null, input.content ?? null, Date.now(), userId, topic, slug)
    .run();

  return "ok";
}
