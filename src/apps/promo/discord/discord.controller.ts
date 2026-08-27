import { Request, Response } from "express";
import * as discordService from "./discord.service.js";

export const testDiscord = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const sent = await discordService.sendTestMessage();
    if (sent) {
      res.json({ success: true, message: "Mensagem de teste enviada ao Discord!" });
    } else {
      res.status(500).json({ success: false, message: "Falha ao enviar mensagem de teste." });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: "Erro no servidor" });
  }
};
