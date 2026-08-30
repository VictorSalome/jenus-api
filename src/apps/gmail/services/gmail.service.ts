import { google } from "googleapis";
import { getDb } from "../../../core/database.js";
import * as logger from "../../../core/logger.js";
import { getValidClient, getStoredTokens } from "./oauth.service.js";

interface Reply {
  id: string;
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  date: string;
  internalDate: string;
}

function extractHeader(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractBodyText(
  payload: any,
): string {
  const parts: string[] = [];

  const walk = (node: any): void => {
    if (!node) return;
    if (node.mimeType === "text/plain" && node.body?.data) {
      parts.push(Buffer.from(node.body.data, "base64").toString("utf8"));
      return;
    }
    if (node.mimeType === "text/html" && node.body?.data && parts.length === 0) {
      const html = Buffer.from(node.body.data, "base64").toString("utf8");
      parts.push(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      return;
    }
    (node.parts || []).forEach(walk);
  };
  walk(payload);
  return parts.join("\n").trim();
}

/**
 * Busca a thread do Gmail associada a um message-id enviado via SMTP.
 * Usa a query `rfc822msgid:<messageId>` do Gmail. O resultado (threadId)
 * é cacheado em curriculo_envios.gmail_thread_id.
 */
export async function findThreadByMessageId(
  userId: string,
  messageId: string,
  envioId?: number,
): Promise<string | null> {
  const client = await getValidClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const res = await gmail.users.messages.list({
    userId: "me",
    q: `rfc822msgid:${messageId}`,
    maxResults: 1,
  });

  const msg = res.data.messages?.[0];
  if (!msg?.id) return null;

  const full = await gmail.users.messages.get({ userId: "me", id: msg.id });
  const threadId = full.data.threadId || msg.threadId || null;

  if (threadId && envioId) {
    const db = await getDb();
    await db.run(
      "UPDATE curriculo_envios SET gmail_thread_id = ? WHERE id = ?",
      threadId,
      envioId,
    );
  }

  return threadId;
}

/**
 * Lista as respostas recebidas na thread de um envio.
 * messageId = Message-ID do email ORIGINAL enviado por SMTP (gravado no envio).
 */
export async function listReplies(
  userId: string,
  messageId: string,
  envioId?: number,
): Promise<Reply[]> {
  const client = await getValidClient(userId);
  const stored = await getStoredTokens(userId);
  const connectedEmail = (stored?.email || "").toLowerCase();

  const gmail = google.gmail({ version: "v1", auth: client });

  let threadId = envioId ? await getCachedThreadId(envioId) : null;
  if (!threadId) {
    threadId = await findThreadByMessageId(userId, messageId, envioId);
  }
  if (!threadId) return [];

  const threadRes = await gmail.users.threads.get({ userId: "me", id: threadId });
  const messages = threadRes.data.messages || [];

  const replies: Reply[] = [];
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });
    const payload = detail.data.payload || {};
    const headers = payload.headers || [];
    const from = extractHeader(headers, "From");
    const fromEmail = (from.match(/<([^>]+)>/) || [])[1] || from;

    // Ignora o email enviado pela própria conta conectada.
    if (fromEmail.toLowerCase() === connectedEmail) continue;

    replies.push({
      id: msg.id!,
      messageId: extractHeader(headers, "Message-ID"),
      threadId: detail.data.threadId || "",
      from,
      subject: extractHeader(headers, "Subject"),
      snippet: detail.data.snippet || "",
      bodyText: extractBodyText(payload),
      date: extractHeader(headers, "Date"),
      internalDate: detail.data.internalDate || "",
    });
  }

  return replies.sort(
    (a, b) => parseInt(a.internalDate || "0") - parseInt(b.internalDate || "0"),
  );
}

async function getCachedThreadId(envioId: number): Promise<string | null> {
  const db = await getDb();
  const row = await db.get<{ gmail_thread_id: string | null }>(
    "SELECT gmail_thread_id FROM curriculo_envios WHERE id = ?",
    envioId,
  );
  return row?.gmail_thread_id || null;
}

/**
 * Envia uma resposta na mesma thread, com In-Reply-To e References
 * apontando para a mensagem original (mantém a conversa agrupada).
 */
export async function sendReply(
  userId: string,
  params: {
    to: string;
    subject: string;
    body: string;
    inReplyToMessageId: string;
    threadId?: string;
    envioId?: number;
  },
): Promise<{ messageId: string; threadId: string }> {
  const client = await getValidClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  let threadId = params.threadId;
  if (!threadId && params.envioId) {
    threadId = await getCachedThreadId(params.envioId) || undefined;
  }
  if (!threadId) {
    threadId = (await findThreadByMessageId(userId, params.inReplyToMessageId, params.envioId)) || undefined;
  }

  const subject = params.subject.replace(/^(Re|RE|RES|RESP):\s*/i, "Re: ");
  const headers = [
    `From: ${(await getStoredTokens(userId))?.email || ""}`,
    `To: ${params.to}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@jenus.local>`,
    `In-Reply-To: <${params.inReplyToMessageId}>`,
    `References: <${params.inReplyToMessageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ].join("\r\n");

  const raw = Buffer.from(`${headers}\r\n\r\n${params.body}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: { threadId, raw },
  });

  logger.info(`Resposta enviada via Gmail → ${params.to}`, "Gmail");
  return {
    messageId: sent.data.id || "",
    threadId: sent.data.threadId || threadId || "",
  };
}
