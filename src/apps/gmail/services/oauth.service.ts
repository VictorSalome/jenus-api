import { google } from "googleapis";
import { getDb } from "../../../core/database.js";
import * as logger from "../../../core/logger.js";
import { encryptToken, decryptToken } from "./crypto.js";

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/gmail/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function createOAuthClient(): OAuth2Client {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID ou GOOGLE_CLIENT_SECRET não configurados");
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  scope?: string;
  email?: string;
}

export async function exchangeCode(code: string): Promise<TokenSet> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  return {
    access_token: tokens.access_token!,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || Date.now() + 3600_000,
    scope: tokens.scope,
  };
}

interface StoredRow {
  email: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: number | null;
  scope: string | null;
}

export async function getStoredTokens(
  userId: string,
): Promise<TokenSet | null> {
  const db = await getDb();
  const row = await db.get<StoredRow>(
    "SELECT email, access_token_enc, refresh_token_enc, expires_at, scope FROM gmail_tokens WHERE user_id = ?",
    userId,
  );
  if (!row || !row.access_token_enc) return null;
  return {
    email: row.email || undefined,
    access_token: decryptToken(row.access_token_enc),
    refresh_token: row.refresh_token_enc
      ? decryptToken(row.refresh_token_enc)
      : undefined,
    expiry_date: row.expires_at ?? 0,
    scope: row.scope || undefined,
  };
}

export async function saveTokens(
  userId: string,
  tokens: TokenSet,
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO gmail_tokens (user_id, email, access_token_enc, refresh_token_enc, expires_at, scope, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email,
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       updated_at = CURRENT_TIMESTAMP`,
    userId,
    tokens.email || null,
    encryptToken(tokens.access_token),
    tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    tokens.expiry_date,
    tokens.scope || null,
  );
}

export async function deleteStoredTokens(userId: string): Promise<void> {
  const db = await getDb();
  await db.run("DELETE FROM gmail_tokens WHERE user_id = ?", userId);
}

/**
 * Retorna um OAuth2Client com access token válido. Renova via refresh token
 * se estiver expirado e re-grava o novo token criptografado.
 */
export async function getValidClient(userId: string): Promise<OAuth2Client> {
  const stored = await getStoredTokens(userId);
  if (!stored || !stored.access_token) {
    const err: any = new Error("Gmail não conectado");
    err.code = "GMAIL_NOT_CONNECTED";
    throw err;
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
    expiry_date: stored.expiry_date,
  });

  if (stored.expiry_date && stored.expiry_date < Date.now() + 60_000) {
    if (!stored.refresh_token) {
      const err: any = new Error(
        "Token Gmail expirado e sem refresh token — reconecte a conta",
      );
      err.code = "GMAIL_EXPIRED";
      throw err;
    }
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    await saveTokens(userId, {
      email: stored.email,
      access_token: credentials.access_token!,
      refresh_token: stored.refresh_token,
      expiry_date: credentials.expiry_date || Date.now() + 3600_000,
      scope: stored.scope,
    });
    logger.info("Access token do Gmail renovado", "Gmail");
  }

  return client;
}

export async function getConnectedEmail(userId: string): Promise<string | null> {
  const stored = await getStoredTokens(userId);
  return stored?.email || null;
}
