export interface Env {
  DB: D1Database;
  /** Must match account.harithkavish.com's registered secret for the `diary` OAuth client. */
  OAUTH_SECRET_DIARY: string;
}
