import { Request, Response } from 'express';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import * as telegramConfigRepo from '../telegram-config/telegram-config.repository.js';
import { findAll } from '../channel/channel.repository.js';

export const testTelegram = async (_req: Request, res: Response): Promise<void> => {
  try {
    const telegramConfig = await telegramConfigRepo.getConfig();

    if (!telegramConfig?.apiId || !telegramConfig?.apiHash) {
      res.status(400).json({
        success: false,
        message: 'API_ID e API_HASH não configurados'
      });
      return;
    }

    if (!telegramConfig?.sessionString) {
      res.status(400).json({
        success: false,
        message: 'Sessão não encontrada. Faça a autenticação primeiro.'
      });
      return;
    }

    // Tentar conectar ao Telegram com a sessão salva
    const session = new StringSession(telegramConfig.sessionString);
    const client = new TelegramClient(
      session,
      parseInt(telegramConfig.apiId),
      telegramConfig.apiHash,
      { connectionRetries: 2, autoReconnect: false }
    );

    await client.connect();

    // Verificar se está autorizado
    const isAuthorized = await client.isUserAuthorized();
    if (!isAuthorized) {
      await client.destroy();
      res.status(400).json({
        success: false,
        message: 'Sessão expirada ou inválida. Faça a autenticação novamente.'
      });
      return;
    }

    // Tentar ler um canal ativo
    const channels = await findAll();
    const activeChannel = channels.find((ch: any) => ch.is_active === 1);
    let channelMessage = '';

    if (activeChannel) {
      try {
        const entity = await client.getEntity(activeChannel.username);
        const messages = await client.getMessages(entity, { limit: 1 });
        if (messages.length > 0) {
          channelMessage = ` Canal ${activeChannel.username} respondeu!`;
        } else {
          channelMessage = ` Canal ${activeChannel.username} acessado (sem mensagens novas).`;
        }
      } catch {
        channelMessage = ` Não foi possível acessar ${activeChannel?.username || 'o canal'}.`;
      }
    }

    await client.destroy();

    res.json({
      success: true,
      message: `✅ Telegram conectado e autenticado!${channelMessage}`
    });

  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Erro ao testar Telegram: ' + (err.message || 'Erro desconhecido')
    });
  }
};

export const testFilters = async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ success: false, message: 'Texto é obrigatório' });
      return;
    }
    
    // Simulação - em produção usaria filter.service.ts
    const matches = [];
    if (text.toLowerCase().includes('galaxy')) matches.push('Galaxy');
    if (text.toLowerCase().includes('rtx')) matches.push('RTX');
    if (text.toLowerCase().includes('iphone')) matches.push('iPhone');
    
    res.json({ 
      success: true, 
      data: { 
        text, 
        matches, 
        wouldSend: matches.length > 0 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao testar filtros' });
  }
};
