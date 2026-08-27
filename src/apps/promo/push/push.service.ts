import axios from 'axios';
import { getDb } from '../../../core/database.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[a-zA-Z0-9]+\]$/.test(token) ||
    /^ExpoPushToken\[[a-zA-Z0-9]+\]$/.test(token);
}

// Register or reactivate a device token
export async function registerToken(token: string, platform: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('SELECT id, is_active FROM promo_device_tokens WHERE token = ?', token);

  if (existing) {
    await db.run(
      'UPDATE promo_device_tokens SET is_active = 1, platform = ?, last_used_at = datetime("now") WHERE token = ?',
      platform, token
    );
  } else {
    await db.run(
      'INSERT INTO promo_device_tokens (token, platform, is_active) VALUES (?, ?, 1)',
      token, platform
    );
  }
}

// Deactivate a device token
export async function unregisterToken(token: string): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE promo_device_tokens SET is_active = 0 WHERE token = ?', token);
}

// Get all active tokens
export async function getActiveTokens(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all('SELECT token FROM promo_device_tokens WHERE is_active = 1');
  return (rows as any[]).map((r) => r.token);
}

// Send push to all active devices
export async function sendPushNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
}): Promise<{ sent: number; failed: number }> {
  const tokens = await getActiveTokens();
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const messages = tokens
    .filter(isExpoPushToken)
    .map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: 'default' as const,
      priority: payload.priority || ('normal' as const),
      badge: 1,
    }));

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const { data } = await axios.post(EXPO_PUSH_URL, chunk);
      const receipts = data?.data || [];
      for (const receipt of receipts) {
        if (receipt.status === 'ok') sent++;
        else failed++;
      }
    } catch {
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

// Send test push to a specific token
export async function sendTestPush(token: string): Promise<boolean> {
  if (!isExpoPushToken(token)) return false;

  try {
    await axios.post(EXPO_PUSH_URL, {
      to: token,
      title: '🔔 Teste de notificação',
      body: 'Se as notificações estão funcionando!',
      data: { screen: 'test' },
      sound: 'default',
    });
    return true;
  } catch {
    return false;
  }
}

// Get token count
export async function getTokenCount(): Promise<{ total: number; active: number }> {
  const db = await getDb();
  const totalRow = await db.get('SELECT COUNT(*) as c FROM promo_device_tokens');
  const activeRow = await db.get('SELECT COUNT(*) as c FROM promo_device_tokens WHERE is_active = 1');
  return { total: (totalRow as any)?.c || 0, active: (activeRow as any)?.c || 0 };
}
