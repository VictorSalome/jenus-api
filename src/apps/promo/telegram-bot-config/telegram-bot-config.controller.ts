import { Request, Response } from "express";
import fetch from "node-fetch";
import * as repo from "./telegram-bot-config.repository.js";

const maskToken = (token: string): string => {
  const [id, secret] = token.split(":");
  if (!secret) return "***";
  const tail = secret.slice(-4);
  return `${id}:${secret.slice(0, 4)}...${tail}`;
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
      botToken: maskToken(config.botToken),
      groupId: config.groupId,
      updatedAt: config.updatedAt,
    },
  });
};

export const saveConfig = async (req: Request, res: Response): Promise<void> => {
  const { botToken, groupId } = req.body ?? {};
  if (!botToken || typeof botToken !== "string" || !botToken.trim()) {
    res.status(400).json({ success: false, message: "botToken é obrigatório" });
    return;
  }
  if (!groupId || typeof groupId !== "string" || !groupId.trim()) {
    res.status(400).json({ success: false, message: "groupId é obrigatório" });
    return;
  }

  await repo.saveConfig(botToken.trim(), groupId.trim());
  res.json({ success: true, data: { botToken: maskToken(botToken.trim()), groupId: groupId.trim() } });
};

export const revokeConfig = async (_req: Request, res: Response): Promise<void> => {
  await repo.clearConfig();
  res.json({ success: true, message: "Configuração removida. Cadastre um novo token gerado no @BotFather." });
};

export const testToken = async (req: Request, res: Response): Promise<void> => {
  let botToken: string | undefined = req.body?.botToken;

  if (!botToken) {
    const saved = await repo.getConfig();
    botToken = saved?.botToken;
  }

  if (!botToken) {
    res.status(400).json({ success: false, message: "Nenhum token configurado nem informado" });
    return;
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data: any = await r.json();

    if (!data.ok) {
      res.status(400).json({
        success: false,
        message: data.description || "Token inválido ou revogado no BotFather",
      });
      return;
    }

    res.json({
      success: true,
      botUsername: data.result?.username ? `@${data.result.username}` : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: "Erro ao validar token: " + (err?.message || "desconhecido") });
  }
};
