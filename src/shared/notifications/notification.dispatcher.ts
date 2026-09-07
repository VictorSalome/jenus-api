import { getDb } from '../../core/database.js';
import * as logger from '../../core/logger.js';
import { sendPushNotification } from '../../apps/promo/push/push.service.js';
import type {
  DispatchOptions,
  NotificationType,
  UserNotificationPreference,
  NotificationPriority,
} from './notification.types.js';

const DEFAULT_USER_ID = 'vssousa';

function interpolate(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{{${key}}}`;
  });
}

function isWithinQuietHours(start: string, end: string, now: Date = new Date()): boolean {
  if (!start || !end) return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  // Atravessa meia-noite (ex: 22:00 até 08:00)
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

export class NotificationDispatcher {
  /**
   * Ponto central para despacho de qualquer notificação do ecossistema.
   */
  async dispatch(
    typeId: string,
    options: DispatchOptions = {},
  ): Promise<{ success: boolean; reason?: string; logId?: number; sentCount?: number }> {
    const userId = options.userId || DEFAULT_USER_ID;
    const db = await getDb();

    // 1. Validação de Idempotência (Fingerprint)
    if (options.fingerprint) {
      const existing = await db.get(
        'SELECT id FROM notifications_log WHERE fingerprint = ?',
        options.fingerprint,
      );
      if (existing) {
        logger.debug(
          `[Dispatcher] Push ignorado por idempotência (fingerprint duplicado: ${options.fingerprint})`,
          'Notifications',
        );
        return { success: false, reason: 'duplicate_fingerprint' };
      }
    }

    // 2. Busca o Tipo de Notificação
    const type = await db.get<NotificationType>(
      'SELECT * FROM notification_types WHERE id = ?',
      typeId,
    );
    if (!type) {
      logger.warn(`[Dispatcher] Tipo de notificação inexistente: ${typeId}`, 'Notifications');
      return { success: false, reason: 'type_not_found' };
    }

    // 3. Checagem de Preferências do Usuário
    const pref = await db.get<UserNotificationPreference>(
      'SELECT * FROM user_notification_preferences WHERE user_id = ? AND type_id = ?',
      userId,
      typeId,
    );

    const isEnabled = pref ? Boolean(pref.enabled) : Boolean(type.default_enabled);
    if (!isEnabled) {
      logger.info(
        `[Dispatcher] Notificação ${typeId} cancelada pois o usuário ${userId} desativou este canal`,
        'Notifications',
      );
      return { success: false, reason: 'disabled_by_user' };
    }

    // 4. Verificação de Quiet Hours (Horário de Silêncio)
    const priority: NotificationPriority = options.priority || type.default_priority;
    if (pref && Boolean(pref.quiet_hours_enabled) && priority !== 'high') {
      const inQuiet = isWithinQuietHours(pref.quiet_hours_start, pref.quiet_hours_end);
      if (inQuiet) {
        logger.info(
          `[Dispatcher] Notificação ${typeId} suspensa devido ao Horário de Silêncio (${pref.quiet_hours_start} - ${pref.quiet_hours_end})`,
          'Notifications',
        );
        await db.run(
          `INSERT INTO notifications_log (user_id, type_id, title, body, payload_json, fingerprint, status)
           VALUES (?, ?, ?, ?, ?, ?, 'skipped_quiet_hours')`,
          userId,
          typeId,
          options.title || type.name,
          options.body || '',
          JSON.stringify(options.data || {}),
          options.fingerprint || null,
        );
        return { success: false, reason: 'skipped_quiet_hours' };
      }
    }

    // 5. Montagem dos Textos (Templates dinâmicos com tags {{key}})
    const title = options.title || interpolate(type.title_template, options.templateVars);
    const body = options.body || interpolate(type.body_template, options.templateVars);

    // 6. Preparação dos Metadados e Deep Links
    const payloadData: Record<string, unknown> = {
      ...(options.data || {}),
      typeId,
      module: type.module,
      soundType: options.sound || type.sound_type,
    };

    // 7. Disparo Nativo Push (FCM / APNs)
    let pushResult = { sent: 0, failed: 0 };
    try {
      pushResult = await sendPushNotification({
        title,
        body,
        data: payloadData,
        priority: priority === 'low' ? 'normal' : 'high',
      });
    } catch (err: any) {
      logger.error(`[Dispatcher] Erro ao enviar push para ${typeId}: ${err.message}`, 'Notifications');
    }

    // 8. Registro de Auditoria no Banco de Dados
    const result = await db.run(
      `INSERT INTO notifications_log (user_id, type_id, title, body, payload_json, fingerprint, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      typeId,
      title,
      body,
      JSON.stringify(payloadData),
      options.fingerprint || null,
      pushResult.sent > 0 ? 'sent' : 'failed',
    );

    logger.info(
      `[Dispatcher] Notificação disparada: [${typeId}] "${title}" -> ${pushResult.sent} dispositivos entregues`,
      'Notifications',
    );

    return {
      success: pushResult.sent > 0,
      logId: result.lastID,
      sentCount: pushResult.sent,
    };
  }
}

export const notificationDispatcher = new NotificationDispatcher();
