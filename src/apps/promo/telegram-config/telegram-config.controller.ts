import { Request, Response } from 'express';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';
import * as telegramConfigRepo from './telegram-config.repository.js';

// Mapa para armazenar sessões de autenticação em memória
interface AuthSession {
  client: TelegramClient;
  phoneCodeHash: string;
}
const authSessions = new Map<string, AuthSession>();

export const getConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await telegramConfigRepo.getConfig();
    if (config) {
      const safeConfig = {
        ...config,
        apiHash: config.apiHash ? `${config.apiHash.substring(0, 4)}****${config.apiHash.substring(config.apiHash.length - 4)}` : ''
      };
      res.json({ success: true, data: safeConfig });
    } else {
      res.json({ success: true, data: null });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar configuração' });
  }
};

export const saveConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiId, apiHash, phone } = req.body;
    
    if (!apiId || !apiHash) {
      res.status(400).json({ success: false, message: 'API_ID e API_HASH são obrigatórios' });
      return;
    }
    
    await telegramConfigRepo.saveConfig({ apiId, apiHash, phone });
    res.json({ success: true, message: 'Configuração salva com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao salvar configuração' });
  }
};

export const getStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await telegramConfigRepo.getConfig();
    res.json({ 
      success: true, 
      data: {
        isConfigured: !!(config?.apiId && config?.apiHash),
        isConnected: config?.isConnected ? true : false
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar status' });
  }
};

export const getAuthStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = await telegramConfigRepo.getConfig();
    res.json({ 
      success: true, 
      data: {
        isConfigured: !!(config?.apiId && config?.apiHash),
        isConnected: config?.isConnected ? true : false,
        hasSession: !!(config?.sessionString),
        phone: config?.phone || null
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar status de autenticação' });
  }
};

// Start Telegram authentication - sends SMS code
export const startAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await telegramConfigRepo.getConfig();
    if (!config || !config.apiId || !config.apiHash || !config.phone) {
      res.status(400).json({ success: false, message: 'Configure API_ID, API_HASH e telefone primeiro' });
      return;
    }

    const session = new StringSession('');
    const client = new TelegramClient(
      session,
      parseInt(config.apiId),
      config.apiHash,
      { connectionRetries: 3 }
    );

    console.log('[TelegramAuth] Conectando ao Telegram...');
    
    await client.connect();
    
    // Usar API direta para enviar código (funciona melhor que client.sendCode)
    const { Api } = await import('telegram');
    const sendCodeResult = await client.invoke(new Api.auth.SendCode({
      phoneNumber: config.phone,
      apiId: parseInt(config.apiId),
      apiHash: config.apiHash,
      settings: new Api.CodeSettings({})
    }));

    const phoneCodeHash = (sendCodeResult as any).phoneCodeHash;

    // Guardar na memória (userId → {client, phoneCodeHash})
    const sessionId = (req as any).user?.userId || req.ip || 'default';
    authSessions.set(sessionId, { client, phoneCodeHash });

    console.log('[TelegramAuth] ✅ Código SMS enviado para', config.phone);
    res.json({ success: true, message: 'Código SMS enviado para ' + config.phone });
    
  } catch (err: any) {
    console.error('[TelegramAuth] Erro ao enviar código:', err);
    res.status(500).json({ success: false, message: 'Erro ao enviar código: ' + (err.message || 'Unknown') });
  }
};

// Verify SMS code and complete authentication
export const verifyAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    const sessionId = (req as any).user?.userId || req.ip || 'default';
    
    if (!code) {
      res.status(400).json({ success: false, message: 'Código é obrigatório' });
      return;
    }

    const session = authSessions.get(sessionId);
    if (!session) {
      res.status(400).json({ success: false, message: 'Sessão de autenticação expirada. Clique em "Enviar Código SMS" novamente.' });
      return;
    }

    const config = await telegramConfigRepo.getConfig();
    if (!config) {
      res.status(400).json({ success: false, message: 'Configuração não encontrada' });
      return;
    }

    console.log('[TelegramAuth] Verificando código:', code);
    
    // Usar o MESMO cliente e phoneCodeHash do passo anterior
    const { Api } = await import('telegram');
    await session.client.invoke(new Api.auth.SignIn({
      phoneNumber: config.phone || '',
      phoneCodeHash: session.phoneCodeHash,
      phoneCode: code
    }));

    // Get session string
    const sessionString = (session.client.session as StringSession).save();
    
    // Update config with session
    await telegramConfigRepo.updateSession(sessionString, true);
    
    // Disconnect and cleanup
    await session.client.disconnect();
    authSessions.delete(sessionId);

    console.log('[TelegramAuth] ✅ Autenticação completa!');
    res.json({ success: true, message: 'Autenticação completa! Monitor pronto para uso.' });
    
  } catch (err: any) {
    console.error('[TelegramAuth] Erro ao verificar código:', err);
    res.status(500).json({ success: false, message: 'Erro ao verificar código: ' + (err.message || 'Unknown') });
  }
};
