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
    "SELECT id, slug, title, content, created_at, updated_at FROM pages WHERE user_id = ? ORDER BY updated_at DESC",
  )
    .bind(user.id)
    .all<PageRow>();
  return results;
}

export async function getPage(env: Env, handle: string, slug: string): Promise<PageRow | null> {
  const row = await env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.content, p.created_at, p.updated_at
     FROM pages p JOIN users u ON u.id = p.user_id
     WHERE u.handle = ? AND p.slug = ?`,
  )
    .bind(handle, slug)
    .first<PageRow>();
  return row ?? null;
}

export async function createPage(
  env: Env,
  userId: string,
  input: { slug: string; title: string; content: string },
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const slug = normalizeSlug(input.slug);
  if (!slug) return { ok: false, error: "invalid_page_name" };
  if (!input.title.trim()) return { ok: false, error: "title_required" };

  const existing = await env.DB.prepare("SELECT id FROM pages WHERE user_id = ? AND slug = ?")
    .bind(userId, slug)
    .first<{ id: string }>();
  if (existing) return { ok: false, error: "already_exists" };

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO pages (id, user_id, slug, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, userId, slug, input.title.trim(), input.content ?? "", now, now)
    .run();

  return { ok: true, id, slug };
}

export async function updatePage(
  env: Env,
  userId: string,
  handle: string,
  currentSlug: string,
  input: { slug?: string; title?: string; content?: string },
): Promise<{ ok: true; slug: string } | { ok: false; error: "not_found" | "forbidden" | "invalid_page_name" | "already_exists" }> {
  const row = await env.DB.prepare(
    `SELECT p.user_id FROM pages p JOIN users u ON u.id = p.user_id
     WHERE u.handle = ? AND p.slug = ?`,
  )
    .bind(handle, currentSlug)
    .first<{ user_id: string }>();

  if (!row) return { ok: false, error: "not_found" };
  if (row.user_id !== userId) return { ok: false, error: "forbidden" };

  let nextSlug = currentSlug;
  if (input.slug !== undefined && input.slug !== currentSlug) {
    const normalized = normalizeSlug(input.slug);
    if (!normalized) return { ok: false, error: "invalid_page_name" };
    const clash = await env.DB.prepare("SELECT id FROM pages WHERE user_id = ? AND slug = ?")
      .bind(userId, normalized)
      .first<{ id: string }>();
    if (clash) return { ok: false, error: "already_exists" };
    nextSlug = normalized;
  }

  const title = input.title?.trim();
  await env.DB.prepare(
    `UPDATE pages SET
       slug = ?,
       title = COALESCE(?, title),
       content = COALESCE(?, content),
       updated_at = ?
     WHERE user_id = ? AND slug = ?`,
  )
    .bind(nextSlug, title || null, input.content ?? null, Date.now(), userId, currentSlug)
    .run();

  return { ok: true, slug: nextSlug };
}
