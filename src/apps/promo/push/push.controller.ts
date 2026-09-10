import { Request, Response, NextFunction } from 'express';
import { getDb } from '../../../core/database.js';
import {
  registerToken,
  unregisterToken,
  sendTestPush,
  sendPushNotification,
  getTokenCount,
} from './push.service.js';

export const pushController = {
  async listTokens(_req: Request, res: Response, next: NextFunction) {
    try {
      const db = await getDb();
      const rows = await db.all(
        'SELECT id, token, platform, user_id, is_active, created_at, last_used_at FROM promo_device_tokens ORDER BY id DESC'
      );
      res.json({ success: true, count: rows.length, tokens: rows });
    } catch (err: any) {
      next(err);
    }
  },

  async sendManualPush(req: Request, res: Response, next: NextFunction) {
    const title = (req.query.title as string) || req.body?.title || '🔔 Notificação de Teste';
    const body = (req.query.body as string) || req.body?.body || 'Compra aprovada no valor de R$ 120,00';
    const screen = (req.query.screen as string) || req.body?.screen || 'detected';
    let targetToken = (req.query.token as string) || req.body?.token;
    const userId = (req as any).user?.userId;

    try {
      const db = await getDb();
      if (!targetToken) {
        // Restrito ao próprio usuário autenticado — nunca pega o token mais
        // recente de outro usuário (a rota exige requireAuth, então userId
        // sempre existe aqui).
        const latest = await db.get(
          'SELECT token FROM promo_device_tokens WHERE is_active = 1 AND user_id = ? ORDER BY last_used_at DESC, id DESC LIMIT 1',
          userId
        );
        targetToken = latest?.token;
      }

      if (!targetToken) {
        return res.status(404).json({
          success: false,
          message: 'Nenhum token ativo encontrado para este usuário. Registre o dispositivo primeiro.',
        });
      }

      const result = await sendPushNotification({
        title,
        body,
        data: { screen },
        priority: 'high',
        token: targetToken,
      });

      res.json({
        success: true,
        message: 'Push disparado com sucesso!',
        tokenUtilizado: targetToken,
        result,
      });
    } catch (err: any) {
      next(err);
    }
  },

  async register(req: Request, res: Response) {
    const { token, platform } = req.body;
    const userId = (req as any).user?.userId;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }
    if (!platform || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'Platform deve ser "ios" ou "android"' });
    }

    try {
      await registerToken(token, platform, userId);
      res.json({ success: true, message: 'Token registrado' });
    } catch (err) {
      console.error('[Push] Erro ao registrar token:', err);
      res.status(500).json({ error: 'Erro ao registrar token' });
    }
  },

  async unregister(req: Request, res: Response) {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }

    try {
      await unregisterToken(token);
      res.json({ success: true, message: 'Token removido' });
    } catch (err) {
      console.error('[Push] Erro ao remover token:', err);
      res.status(500).json({ error: 'Erro ao remover token' });
    }
  },

  async test(req: Request, res: Response, next: NextFunction) {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }

    try {
      const result = await sendTestPush(token);
      if (result.success) {
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ success: false, error: result.message });
      }
    } catch (err: any) {
      console.error('[Push] Erro no teste:', err);
      next(err);
    }
  },

  async stats(_req: Request, res: Response) {
    try {
      const counts = await getTokenCount();
      res.json({ success: true, ...counts });
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar stats' });
    }
  },
};
