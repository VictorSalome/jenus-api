import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { google } from 'googleapis';
import { getDb } from '../../../core/database.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
const FIREBASE_PROJECT_ID = 'jenus-hub';

const FIREBASE_SA_PATH = path.resolve(process.cwd(), 'secrets/firebase-service-account.json');
let jwtClient: any = null;

async function getFcmAccessToken(): Promise<string | null> {
  if (!fs.existsSync(FIREBASE_SA_PATH)) {
    console.warn('[PushService] secrets/firebase-service-account.json não encontrado para FCM.');
    return null;
  }
  try {
    if (!jwtClient) {
      const sa = JSON.parse(fs.readFileSync(FIREBASE_SA_PATH, 'utf8'));
      jwtClient = new google.auth.JWT({
        email: sa.client_email,
        key: sa.private_key,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
    }
    const tokenRes = await jwtClient.getAccessToken();
    return tokenRes.token || null;
  } catch (err) {
    console.warn('[PushService] Erro ao obter Google FCM access token:', err);
    return null;
  }
}

async function sendFcmMessage(token: string, payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
}): Promise<boolean> {
  try {
    const accessToken = await getFcmAccessToken();
    if (!accessToken) return false;

    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    const res = await axios.post(
      `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
      {
        message: {
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: stringData,
          android: {
            priority: payload.priority === 'normal' ? 'NORMAL' : 'HIGH',
            notification: {
              sound: 'default',
              default_vibrate_timings: true,
              default_light_settings: true,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );
    return !!res.data?.name;
  } catch (err: any) {
    console.warn('[PushService] Falha no disparo FCM v1:', err?.response?.data || err.message);
    return false;
  }
}

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

// Send push to all active devices or specific token
export async function sendPushNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
  token?: string;
}): Promise<{ sent: number; failed: number }> {
  const activeTokens = await getActiveTokens();
  const rawTokens = payload.token ? [payload.token] : activeTokens;
  if (rawTokens.length === 0) return { sent: 0, failed: 0 };

  const expoTokens = rawTokens.filter(isExpoPushToken);
  const otherTokens = rawTokens.filter((t) => !isExpoPushToken(t));

  let sent = 0;
  let failed = 0;

  if (expoTokens.length > 0) {
    const messages = expoTokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: 'default' as const,
      priority: payload.priority || ('high' as const),
      badge: 1,
    }));

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      try {
        const { data } = await axios.post(EXPO_PUSH_URL, chunk);
        const receipts = data?.data || [];
        for (const receipt of receipts) {
          if (receipt.status === 'ok') sent++;
          else failed++;
        }
      } catch (e) {
        console.warn('[PushService] Erro ao enviar chunk Expo:', e);
        failed += chunk.length;
      }
    }
  }

  if (otherTokens.length > 0) {
    console.log(`[PushService] Enviando para ${otherTokens.length} token(s) nativos (FCM):`, otherTokens);
    for (const tok of otherTokens) {
      const ok = await sendFcmMessage(tok, payload);
      if (ok) sent++;
      else failed++;
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
