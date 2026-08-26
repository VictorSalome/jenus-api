import { Request, Response } from 'express';
import { registerToken, unregisterToken, sendTestPush, getTokenCount } from './push.service.js';

export const pushController = {
  async register(req: Request, res: Response) {
    const { token, platform } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }
    if (!platform || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'Platform deve ser "ios" ou "android"' });
    }

    try {
      await registerToken(token, platform);
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

  async test(req: Request, res: Response) {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token é obrigatório' });
    }

    try {
      const ok = await sendTestPush(token);
      if (ok) {
        res.json({ success: true, message: 'Push de teste enviado' });
      } else {
        res.status(400).json({ error: 'Token inválido ou falha no envio' });
      }
    } catch (err) {
      console.error('[Push] Erro no teste:', err);
      res.status(500).json({ error: 'Erro ao enviar push de teste' });
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
