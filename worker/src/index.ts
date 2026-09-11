import type { Env } from "./env";
import { AUTHORIZE_URL, exchangeCodeForToken, fetchProfile } from "./ecosystem";
import { generateCodeVerifier, codeChallengeFor, randomToken } from "./pkce";
import { assignHandle, changeHandle } from "./handles";
import { createPage, getPage, listPagesForHandle, updatePage } from "./pages";
import { createSession, destroySession, getSessionUser, readCookie } from "./session";

const OAUTH_CLIENT_ID = "diary";

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function callbackUri(url: URL): string {
  return `${url.origin}/api/auth/callback`;
}

async function handleLogin(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const redirectUri = callbackUri(url);

  const verifier = generateCodeVerifier();
  const challenge = await codeChallengeFor(verifier);
  const state = randomToken(16);
  // Where to send the browser back to once signed in -- defaults home.
  const next = url.searchParams.get("next") ?? "/";
  // A silent probe: the front page uses this to check "is this visitor
  // already signed in anywhere in the ecosystem?" via a real top-level
  // navigation (required -- the shared session cookie is SameSite=Lax, so it
  // is only ever sent on a genuine top-level navigation, never a background
  // fetch or an iframe). See handleCallback for the quiet return path.
  const silent = url.searchParams.get("silent") === "1";

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("client_id", OAUTH_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("state", state);
  if (silent) authorize.searchParams.set("prompt", "none");

  const cookieBase = "Path=/api/auth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=300";
  return new Response(null, {
    status: 302,
    headers: [
      ["Location", authorize.toString()],
      ["Set-Cookie", `diary_oauth_verifier=${verifier}; ${cookieBase}`],
      ["Set-Cookie", `diary_oauth_state=${state}; ${cookieBase}`],
      ["Set-Cookie", `diary_oauth_next=${encodeURIComponent(next)}; ${cookieBase}`],
    ],
  });
}

const clearTempCookies = [
  "diary_oauth_verifier=; Path=/api/auth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  "diary_oauth_state=; Path=/api/auth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  "diary_oauth_next=; Path=/api/auth/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
];

function loginFailure(reason: string): Response {
  return new Response(`Sign-in failed: ${reason}`, {
    status: 400,
    headers: [["content-type", "text/plain"], ...clearTempCookies.map((c) => ["Set-Cookie", c] as const)],
  });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const next = decodeURIComponent(readCookie(request, "diary_oauth_next") ?? "/");

  if (url.searchParams.get("error")) {
    // login_required is prompt=none's own, expected way of saying "not signed
    // in" -- a silent probe never shows this to anyone, it just lands back
    // where it started, still signed out. A non-silent attempt never sends
    // prompt=none, so in practice this is the only error code that reaches
    // here, and it is never a failure worth a page for.
    return new Response(null, {
      status: 302,
      headers: [["Location", next], ...clearTempCookies.map((c) => ["Set-Cookie", c] as const)],
    });
  }

  const expectedState = readCookie(request, "diary_oauth_state");
  const verifier = readCookie(request, "diary_oauth_verifier");

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return loginFailure("invalid or expired sign-in attempt -- please try again");
  }

  const token = await exchangeCodeForToken({
    code,
    codeVerifier: verifier,
    redirectUri: callbackUri(url),
    clientSecret: env.OAUTH_SECRET_DIARY,
  });
  if (!token) return loginFailure("could not exchange the authorization code");

  const profile = await fetchProfile(token.accessToken);
  if (!profile) return loginFailure("could not read the signed-in profile");

  const existing = await env.DB.prepare("SELECT handle FROM users WHERE id = ?")
    .bind(profile.sub)
    .first<{ handle: string }>();

  const handle = existing?.handle ?? (await assignHandle(env, profile.sub, profile.preferred_username));
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, handle, name, picture, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, picture = excluded.picture, updated_at = excluded.updated_at`,
  )
    .bind(profile.sub, handle, profile.name, profile.picture, now, now)
    .run();

  const sessionCookie = await createSession(env, profile.sub);
  const destination = next === "/" ? `/@${handle}` : next;

  return new Response(null, {
    status: 302,
    headers: [
      ["Location", destination],
      ["Set-Cookie", sessionCookie],
      ...clearTempCookies.map((c) => ["Set-Cookie", c] as const),
    ],
  });
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const cookie = await destroySession(env, request);
  return new Response(null, { status: 204, headers: [["Set-Cookie", cookie]] });
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!user) return json({ signedIn: false });
  return json({ signedIn: true, user });
}

async function handleChangeHandle(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: "not_signed_in" }, 401);
  const body = await request.json<{ handle?: string }>().catch(() => null);
  if (!body?.handle) return json({ error: "handle_required" }, 400);

  const result = await changeHandle(env, user.id, body.handle);
  if (result === "invalid") return json({ error: "invalid_handle" }, 400);
  if (result === "taken") return json({ error: "handle_taken" }, 409);
  return json({ ok: true, handle: body.handle.toLowerCase() });
}

async function handleListPages(handle: string, env: Env): Promise<Response> {
  const pages = await listPagesForHandle(env, handle);
  if (pages === null) return json({ error: "not_found" }, 404);
  return json({ handle, pages });
}

async function handleGetPage(handle: string, slug: string, env: Env): Promise<Response> {
  const page = await getPage(env, handle, slug);
  if (!page) return json({ error: "not_found" }, 404);
  return json({ handle, page });
}

async function handleCreatePage(request: Request, env: Env): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: "not_signed_in" }, 401);

  const body = await request.json<{ slug?: string; title?: string; content?: string }>().catch(() => null);
  if (!body?.slug || !body.title) {
    return json({ error: "page_name_and_title_required" }, 400);
  }

  const result = await createPage(env, user.id, {
    slug: body.slug,
    title: body.title,
    content: body.content ?? "",
  });
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ ok: true, id: result.id, slug: result.slug, handle: user.handle }, 201);
}

async function handleUpdatePage(request: Request, env: Env, handle: string, slug: string): Promise<Response> {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: "not_signed_in" }, 401);

  const body = await request.json<{ slug?: string; title?: string; content?: string }>().catch(() => null);
  if (!body) return json({ error: "invalid_body" }, 400);

  const result = await updatePage(env, user.id, handle, slug, body);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 400;
    return json({ error: result.error }, status);
  }
  return json({ ok: true, slug: result.slug });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/api/auth/login" && method === "GET") return handleLogin(request);
    if (path === "/api/auth/callback" && method === "GET") return handleCallback(request, env);
    if (path === "/api/auth/logout" && method === "POST") return handleLogout(request, env);
    if (path === "/api/me" && method === "GET") return handleMe(request, env);
    if (path === "/api/me/handle" && method === "PATCH") return handleChangeHandle(request, env);
    if (path === "/api/pages" && method === "POST") return handleCreatePage(request, env);

    // /api/pages/@handle -> list; /api/pages/@handle/page-name -> single page
    const pageMatch = path.match(/^\/api\/pages\/@([^/]+)(?:\/([^/]+))?$/);
    if (pageMatch) {
      const [, handle, slug] = pageMatch;
      if (!slug && method === "GET") return handleListPages(handle, env);
      if (slug && method === "GET") return handleGetPage(handle, slug, env);
      if (slug && method === "PUT") return handleUpdatePage(request, env, handle, slug);
    }

    return json({ error: "not_found" }, 404);
  },
};
