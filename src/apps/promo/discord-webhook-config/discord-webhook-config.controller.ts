import { Request, Response } from "express";
import fetch from "node-fetch";
import * as repo from "./discord-webhook-config.repository.js";

const WEBHOOK_URL_RE = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;

const maskUrl = (url: string): string => {
  if (url.length <= 25) return "***";
  return `${url.slice(0, 40)}...${url.slice(-6)}`;
};

export const getConfig = async (_req: Request, res: Response): Promise<void> => {
  const config = await repo.getConfig();
  if (!config) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({
    success: true,
    data: {
      webhookUrl: maskUrl(config.webhookUrl),
      updatedAt: config.updatedAt,
    },
  });
};

export const saveConfig = async (req: Request, res: Response): Promise<void> => {
  const { webhookUrl } = req.body ?? {};
  if (!webhookUrl || typeof webhookUrl !== "string" || !webhookUrl.trim()) {
    res.status(400).json({ success: false, message: "webhookUrl é obrigatório" });
    return;
  }
  const trimmed = webhookUrl.trim();
  if (!WEBHOOK_URL_RE.test(trimmed)) {
    res.status(400).json({
      success: false,
      message: "URL inválida — deve ser no formato https://discord.com/api/webhooks/{id}/{token}",
    });
    return;
  }

  await repo.saveConfig(trimmed);
  res.json({ success: true, data: { webhookUrl: maskUrl(trimmed) } });
};

export const testWebhook = async (req: Request, res: Response): Promise<void> => {
  let webhookUrl: string | undefined = req.body?.webhookUrl;

  if (!webhookUrl) {
    const saved = await repo.getConfig();
    webhookUrl = saved?.webhookUrl;
  }

  if (!webhookUrl) {
    res.status(400).json({ success: false, message: "Nenhum webhook configurado nem informado" });
    return;
  }

  try {
    const r = await fetch(webhookUrl);
    const data: any = await r.json().catch(() => null);

    if (!r.ok || !data) {
      res.status(400).json({
        success: false,
        message: data?.message || `Webhook inválido ou apagado (HTTP ${r.status})`,
      });
      return;
    }

    res.json({ success: true, webhookName: data.name, channelId: data.channel_id });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Erro ao validar webhook: " + (err?.message || "desconhecido") });
  }
};

/**
 * Revogação REAL: apaga o webhook no próprio Discord (DELETE na URL, que já
 * contém o token) antes de limpar a config local — diferente do bot do
 * Telegram, aqui a API permite invalidar o antigo de verdade, não só abrir
 * um link manual.
 */
export const revokeConfig = async (_req: Request, res: Response): Promise<void> => {
  const config = await repo.getConfig();

  if (!config) {
    res.json({ success: true, discordRevoked: false, message: "Nenhum webhook configurado" });
    return;
  }

  let discordRevoked = false;
  let message: string;

  try {
    const r = await fetch(config.webhookUrl, { method: "DELETE" });
    if (r.ok || r.status === 404) {
      discordRevoked = true;
      message = r.status === 404
        ? "Webhook já não existia mais no Discord. Config local removida."
        : "Webhook revogado no Discord com sucesso. Config local removida.";
    } else {
      message = `Discord recusou a revogação (HTTP ${r.status}). Config local removida mesmo assim — revogue manualmente pelo Discord se necessário.`;
    }
  } catch (err: any) {
    message = `Não foi possível contatar o Discord (${err?.message || "erro de rede"}). Config local removida mesmo assim — revogue manualmente pelo Discord se necessário.`;
  }

  await repo.clearConfig();
  res.json({ success: true, discordRevoked, message });
};
