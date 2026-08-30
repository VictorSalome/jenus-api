import { Request, Response } from "express";
import { google } from "googleapis";
import * as logger from "../../../core/logger.js";
import { getDb } from "../../../core/database.js";
import {
  getAuthUrl,
  createOAuthClient,
  exchangeCode,
  getStoredTokens,
  saveTokens,
  deleteStoredTokens,
} from "../services/oauth.service.js";
import { listReplies, sendReply } from "../services/gmail.service.js";

// Store de `state` (CSRF) em memória: state → { userId, expiresAt }
const stateStore = new Map<string, { userId: string; expiresAt: number }>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

function cleanupStateStore(): void {
  const now = Date.now();
  for (const [key, val] of stateStore) {
    if (val.expiresAt < now) stateStore.delete(key);
  }
}

const getUserId = (req: Request): string => {
  const user = (req as any).user;
  return user?.userId ? String(user.userId) : "admin";
};

function htmlPage(title: string, message: string): string {
  return `<html><body style="font-family:sans-serif;background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh"><div style="text-align:center;max-width:480px;padding:0 16px"><h2>${title}</h2><p style="color:#94a3b8">${message}</p></div></body></html>`;
}

export const authUrl = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    cleanupStateStore();
    const state = `${userId}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    stateStore.set(state, { userId, expiresAt: Date.now() + STATE_TTL_MS });

    const url = getAuthUrl(state);
    res.json({ success: true, url, state });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Callback do Google (navegador). Troca o code e salva os tokens.
 * Retorna HTML simples — não JSON, pois o Google redireciona o navegador aqui.
 */
export const callback = async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.set("Content-Type", "text/html");
    res.send(htmlPage("Autorização não concluída", `${error}. Você já pode voltar ao app.`));
    return;
  }

  if (!code || !state) {
    res.set("Content-Type", "text/html");
    res.status(400).send(htmlPage("Requisição inválida", "Faltam parâmetros code/state."));
    return;
  }

  const stored = stateStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    res.set("Content-Type", "text/html");
    res.status(400).send(htmlPage("State inválido ou expirado", "Reinicie a conexão pelo app."));
    return;
  }

  try {
    const tokens = await exchangeCode(code);
    // userinfo.email scope → obtém o email conectado
    let email: string | null = null;
    try {
      const client = createOAuthClient();
      client.setCredentials({ access_token: tokens.access_token });
      const info = await google.oauth2("v2").userinfo.get({ auth: client as any });
      email = info.data.email || null;
    } catch (e) {
      logger.warn("Não foi possível obter email do userinfo", "Gmail");
    }

    await saveTokens(stored.userId, { ...tokens, email: email || undefined });
    stateStore.delete(state);
    logger.info("Gmail conectado com sucesso", "Gmail");

    res.set("Content-Type", "text/html");
    res.send(htmlPage("✅ Gmail conectado!", "Você já pode voltar ao app."));
  } catch (err: any) {
    logger.error(`Erro no callback Gmail: ${err.message}`, "Gmail");
    res.set("Content-Type", "text/html");
    res.status(500).send(htmlPage("Erro ao conectar", err.message));
  }
};

export const status = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const stored = await getStoredTokens(userId);
    res.json({
      success: true,
      connected: Boolean(stored?.access_token),
      email: stored?.email || null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const messages = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const envioId = Number(req.query.envioId);

    const db = await getDb();
    const envio = await db.get<{ message_id: string | null }>(
      "SELECT message_id FROM curriculo_envios WHERE id = ?",
      envioId,
    );
    if (!envio) {
      res.status(404).json({ success: false, message: "Envio não encontrado" });
      return;
    }
    if (!envio.message_id) {
      res.json({ success: true, replies: [], message: "Envio sem message_id" });
      return;
    }

    const replies = await listReplies(userId, envio.message_id, envioId);
    res.json({ success: true, replies });
  } catch (err: any) {
    if (err?.code === "GMAIL_NOT_CONNECTED") {
      res.status(400).json({ success: false, message: "Gmail não conectado" });
      return;
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

export const send = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { envioId, body } = req.body;

    if (!envioId || !body || !String(body).trim()) {
      res
        .status(400)
        .json({ success: false, message: "envioId e body são obrigatórios" });
      return;
    }

    const db = await getDb();
    const envio = await db.get<{
      message_id: string | null;
      email_destino: string;
      vaga_titulo: string;
      gmail_thread_id: string | null;
    }>(
      "SELECT message_id, email_destino, vaga_titulo, gmail_thread_id FROM curriculo_envios WHERE id = ?",
      envioId,
    );
    if (!envio) {
      res.status(404).json({ success: false, message: "Envio não encontrado" });
      return;
    }
    if (!envio.message_id) {
      res
        .status(400)
        .json({ success: false, message: "Envio sem message_id para responder" });
      return;
    }

    const result = await sendReply(userId, {
      to: envio.email_destino,
      subject: envio.vaga_titulo,
      body: String(body).trim(),
      inReplyToMessageId: envio.message_id,
      threadId: envio.gmail_thread_id || undefined,
      envioId,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    if (err?.code === "GMAIL_NOT_CONNECTED") {
      res.status(400).json({ success: false, message: "Gmail não conectado" });
      return;
    }
    logger.error(`Erro ao enviar resposta Gmail: ${err.message}`, "Gmail");
    res.status(500).json({ success: false, message: err.message });
  }
};

export const disconnect = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    await deleteStoredTokens(userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
