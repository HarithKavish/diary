import type { Env } from "./env";

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{0,29})$/;

/** Lowercase, ecosystem-safe slug. Returns null if the input can't be made into one. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return HANDLE_RE.test(candidate) ? candidate : null;
}

async function handleTaken(env: Env, handle: string, excludingUserId?: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM users WHERE handle = ? AND id != ?")
    .bind(handle, excludingUserId ?? "")
    .first<{ id: string }>();
  return row !== null;
}

/**
 * A handle for a user who does not have one yet.
 *
 * Their chosen identifier on account.harithkavish.com is preferred, since
 * that is already unique ecosystem-wide. If it is missing, invalid here, or
 * (in the unlikely case) already claimed by a different diary user, falls
 * back to a short id derived from their account UUID -- always available,
 * and changeable afterwards via PATCH /api/me/handle.
 */
export async function assignHandle(env: Env, userId: string, preferredUsername: string | null): Promise<string> {
  const preferred = normalizeHandle(preferredUsername);
  if (preferred && !(await handleTaken(env, preferred, userId))) return preferred;

  const fallback = `user-${userId.replace(/-/g, "").slice(0, 8)}`;
  if (!(await handleTaken(env, fallback, userId))) return fallback;

  // Only reachable if the fallback itself collides -- vanishingly unlikely
  // given it is derived from a UUID, but a page must always have a handle.
  return `${fallback}-${Date.now().toString(36)}`;
}

export async function changeHandle(env: Env, userId: string, newHandle: string): Promise<"ok" | "invalid" | "taken"> {
  const normalized = normalizeHandle(newHandle);
  if (!normalized) return "invalid";
  if (await handleTaken(env, normalized, userId)) return "taken";
  await env.DB.prepare("UPDATE users SET handle = ?, updated_at = ? WHERE id = ?")
    .bind(normalized, Date.now(), userId)
    .run();
  return "ok";
}
