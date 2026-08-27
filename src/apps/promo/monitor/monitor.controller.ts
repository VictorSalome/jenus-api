import { Request, Response } from 'express';
import { startMonitor, stopMonitor, getMonitorStatus } from './monitor.service.js';
import { startTelegramMonitor } from './monitor.telegram.js';
import { getConnectionStatus } from './monitor.state.js';
import { sendTelegramMessage } from '../telegram-bot/bot.service.js';
import { sendDiscordPromo } from '../discord/discord.service.js';

export const getStatus = async (_req: Request, res: Response): Promise<void> => {
  const status = getMonitorStatus();
  res.json({ success: true, data: status });
};

export const getConnectionStatusEndpoint = async (_req: Request, res: Response): Promise<void> => {
  const status = getConnectionStatus();
  res.json({ success: true, data: status });
};

export const testConnection = async (_req: Request, res: Response): Promise<void> => {
  try {
    const sent = await sendTelegramMessage(
      '🚀 *Promo Monitor* — Teste de Conexão\n\n' +
      '🤖 Bot Telegram funcionando!\n' +
      `🕐 ${new Date().toLocaleString('pt-BR')}\n\n` +
      '_Conexão verificada com sucesso._'
    );

    if (sent) {
      res.json({ success: true, message: 'Mensagem enviada ao grupo de teste!' });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erro ao enviar mensagem. Verifique TELEGRAM_BOT_TOKEN e TELEGRAM_BOT_GROUP_ID no .env',
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao testar conexão' });
  }
};

export const testFullFlow = async (_req: Request, res: Response): Promise<void> => {
  const results: { telegram?: string; discord?: string; error?: string } = {};

  // 1. Testar Bot Telegram
  try {
    const tgSent = await sendTelegramMessage(
      '🧪 *Teste de Fluxo Completo*\n\n' +
      '📦 *Produto:* Smart TV LG 43" 4K UHD\n' +
      '💰 *Preço:* R$ 1.999,00\n' +
      '🏪 *Loja:* Amazon\n\n' +
      '_Esta é uma simulação para testar o fluxo Promo Monitor → Discord._'
    );
    results.telegram = tgSent ? 'Mensagem enviada ao grupo Promo-Teste' : 'Falha ao enviar';
  } catch (err: any) {
    results.telegram = `Erro: ${err.message}`;
  }

  // 2. Testar Discord (enviar promoção simulada)
  try {
    const dcSent = await sendDiscordPromo({
      product: 'Smart TV LG 43" 4K UHD',
      price: 1999.00,
      originalPrice: 2999.00,
      discount: '33% OFF',
      store: 'Amazon',
      link: 'https://t.me/promoteste',
      filterName: '🧪 Teste de Fluxo',
      channel: '@promo_teste',
      imageUrl: null,
      imageBuffer: null,
    });
    results.discord = dcSent ? 'Embed de promoção enviado ao Discord' : 'Falha ao enviar';
  } catch (err: any) {
    results.discord = `Erro: ${err.message}`;
  }

  const hasError = Object.values(results).some((v) => v?.startsWith('Erro') || v?.startsWith('Falha'));
  res.status(hasError ? 500 : 200).json({
    success: !hasError,
    message: hasError ? 'Alguns testes falharam' : 'Fluxo completo testado com sucesso!',
    data: results,
  });
};

export const start = async (_req: Request, res: Response): Promise<void> => {
  try {
    await startMonitor();
    res.json({ success: true, message: 'Monitor iniciado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao iniciar monitor' });
  }
};

export const stop = async (_req: Request, res: Response): Promise<void> => {
  try {
    await stopMonitor();
    res.json({ success: true, message: 'Monitor parado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao parar monitor' });
  }
};

export const forceCheck = async (_req: Request, res: Response): Promise<void> => {
  try {
    await startTelegramMonitor();
    res.json({ success: true, message: 'Verificação forçada concluída' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro na verificação' });
  }
};
