import { Request, Response } from 'express';
import { getDb } from '../../core/database.js';
import { notificationDispatcher } from './notification.dispatcher.js';
import type { NotificationType } from './notification.types.js';

const getUserId = (req: Request): string => {
  const user = (req as any).user;
  return user?.userId ? String(user.userId) : 'vssousa';
};

/**
 * Lista todos os tipos de eventos disponíveis no sistema agrupados por módulo.
 */
export const getTypes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    const types = await db.all<NotificationType[]>(
      'SELECT * FROM notification_types ORDER BY module, name ASC',
    );
    res.json({ success: true, types });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Retorna as preferências do usuário para todos os tipos (com defaults caso ainda não configurado).
 */
export const getPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const db = await getDb();

    const rows = await db.all(
      `SELECT
         t.id as type_id,
         t.module,
         t.name as type_name,
         t.description,
         t.sound_type,
         t.default_priority,
         COALESCE(p.enabled, t.default_enabled) as enabled,
         COALESCE(p.quiet_hours_enabled, 0) as quiet_hours_enabled,
         COALESCE(p.quiet_hours_start, '22:00') as quiet_hours_start,
         COALESCE(p.quiet_hours_end, '08:00') as quiet_hours_end,
         p.updated_at
       FROM notification_types t
       LEFT JOIN user_notification_preferences p
         ON p.type_id = t.id AND p.user_id = ?
       ORDER BY t.module, t.name ASC`,
      userId,
    );

    const preferences = rows.map((r: any) => ({
      type_id: r.type_id,
      module: r.module,
      type_name: r.type_name,
      description: r.description,
      sound_type: r.sound_type,
      default_priority: r.default_priority,
      enabled: Boolean(r.enabled),
      quiet_hours_enabled: Boolean(r.quiet_hours_enabled),
      quiet_hours_start: r.quiet_hours_start,
      quiet_hours_end: r.quiet_hours_end,
      updated_at: r.updated_at,
    }));

    res.json({ success: true, preferences });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Atualiza a preferência do usuário para um tipo específico de evento.
 */
export const updatePreference = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { typeId, enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end } = req.body;

    if (!typeId) {
      res.status(400).json({ success: false, message: 'typeId é obrigatório' });
      return;
    }

    const db = await getDb();

    await db.run(
      `INSERT INTO user_notification_preferences (user_id, type_id, enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, type_id) DO UPDATE SET
         enabled = COALESCE(excluded.enabled, user_notification_preferences.enabled),
         quiet_hours_enabled = COALESCE(excluded.quiet_hours_enabled, user_notification_preferences.quiet_hours_enabled),
         quiet_hours_start = COALESCE(excluded.quiet_hours_start, user_notification_preferences.quiet_hours_start),
         quiet_hours_end = COALESCE(excluded.quiet_hours_end, user_notification_preferences.quiet_hours_end),
         updated_at = datetime('now')`,
      userId,
      typeId,
      enabled !== undefined ? (enabled ? 1 : 0) : 1,
      quiet_hours_enabled !== undefined ? (quiet_hours_enabled ? 1 : 0) : 0,
      quiet_hours_start || '22:00',
      quiet_hours_end || '08:00',
    );

    res.json({ success: true, message: 'Preferência atualizada com sucesso' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Histórico de notificações disparadas para o usuário.
 */
export const getHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const db = await getDb();

    const logs = await db.all(
      `SELECT l.*, t.name as type_name, t.module
       FROM notifications_log l
       LEFT JOIN notification_types t ON t.id = l.type_id
       WHERE l.user_id = ?
       ORDER BY l.sent_at DESC
       LIMIT ?`,
      userId,
      limit,
    );

    res.json({ success: true, logs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Disparo de teste para validar o som, texto e deep link de qualquer evento.
 */
export const testDispatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { typeId = 'curriculo.recruiter_reply', templateVars, data } = req.body;

    const sampleVars: Record<string, string | number> = {
      sender: 'Ana Paula (Tech Recruiter)',
      snippet: 'Olá Victor! Gostamos bastante do seu perfil. Podemos agendar uma conversa?',
      company: 'Tech Solutions',
      position: 'Senior React Native Developer',
      merchant: 'iFood / Restaurante Gourmet',
      amount: '45,90',
      card_name: 'Nubank Ultravioleta',
      due_date: '15/09',
      current: 10,
      total: 10,
      description: 'Notebook Dell',
      product_name: 'MacBook Air M3',
      current_price: '6.499,00',
      usage: '92',
      device: 'Chrome no Mac OS (São Paulo)',
      ip: '177.18.29.4',
      sent_count: 14,
      replies_count: 3,
      match: 94,
      ...(templateVars || {}),
    };

    const result = await notificationDispatcher.dispatch(typeId, {
      userId,
      templateVars: sampleVars,
      data: data || { route: typeId.startsWith('curriculo') ? '/(curriculo)/chat' : '/(financas)/transactions' },
    });

    res.json({
      success: result.success,
      message: result.success ? 'Push de teste disparado com sucesso' : `Falha no envio: ${result.reason}`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};
