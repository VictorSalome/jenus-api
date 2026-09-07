import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getDb } from '../../../core/database.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;
const DEFAULT_CHANNEL_ID = 'jenus-alerts';

let firebaseApp: App | null = null;

function getFirebaseApp(): App | null {
  if (firebaseApp) return firebaseApp;

  try {
    let serviceAccount: any = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
      const saPath =
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
        path.resolve(process.cwd(), 'secrets/firebase-service-account.json');
      if (fs.existsSync(saPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      }
    }

    if (serviceAccount) {
      firebaseApp = initializeApp(
        {
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || 'jenus-hub',
        },
        'jenus-hub'
      );
      console.log('[FirebaseAdmin] ✅ Inicializado com sucesso para projeto:', serviceAccount.project_id);
      return firebaseApp;
    }
  } catch (err) {
    console.warn('[FirebaseAdmin] Aviso ao inicializar Firebase Admin:', err);
  }

  return null;
}

async function sendFcmNotification(
  token: string,
  payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    priority?: 'normal' | 'high';
  }
): Promise<boolean> {
  const app = getFirebaseApp();
  if (!app) {
    console.warn('[PushService] Firebase Admin não inicializado (adicione secrets/firebase-service-account.json ou FIREBASE_SERVICE_ACCOUNT_JSON).');
    return false;
  }

  try {
    const stringData: Record<string, string> = {};
    if (payload.data) {
      for (const [k, v] of Object.entries(payload.data)) {
        stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
      }
    }

    const messaging = getMessaging(app);
    await messaging.send({
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: stringData,
      android: {
        priority: payload.priority === 'normal' ? 'normal' : 'high',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });
    return true;
  } catch (error: any) {
    console.warn('[PushService] Erro ao enviar push FCM:', error?.message || error);
    if (error?.code === 'messaging/registration-token-not-registered') {
      void unregisterToken(token);
    }
    return false;
  }
}

function isExpoPushToken(token: string): boolean {
  return (
    /^ExponentPushToken\[.+\]$/.test(token) ||
    /^ExpoPushToken\[.+\]$/.test(token)
  );
}

// Register or reactivate a device token
export async function registerToken(token: string, platform: string, userId?: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get('SELECT id, is_active, user_id FROM promo_device_tokens WHERE token = ?', token);

  if (existing) {
    await db.run(
      'UPDATE promo_device_tokens SET is_active = 1, platform = ?, user_id = COALESCE(?, user_id), last_used_at = datetime("now") WHERE token = ?',
      platform, userId || null, token
    );
  } else {
    await db.run(
      'INSERT INTO promo_device_tokens (token, platform, is_active, user_id) VALUES (?, ?, 1, ?)',
      token, platform, userId || null
    );
  }
}

// Deactivate a device token
export async function unregisterToken(token: string): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE promo_device_tokens SET is_active = 0 WHERE token = ?', token);
}

// Get all active tokens (optionally filtered by user_id)
export async function getActiveTokens(userId?: string): Promise<string[]> {
  const db = await getDb();
  if (userId) {
    const rows = await db.all('SELECT token FROM promo_device_tokens WHERE is_active = 1 AND user_id = ?', userId);
    return (rows as any[]).map((r) => r.token);
  }
  const rows = await db.all('SELECT token FROM promo_device_tokens WHERE is_active = 1');
  return (rows as any[]).map((r) => r.token);
}

// Send push to all active devices, specific user or specific token
export async function sendPushNotification(payload: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'high';
  token?: string;
  userId?: string;
}): Promise<{ sent: number; failed: number }> {
  const activeTokens = await getActiveTokens(payload.userId);
  const rawTokens = payload.token ? [payload.token] : activeTokens;
  const expoTokens = rawTokens.filter(isExpoPushToken);
  const fcmTokens = rawTokens.filter((t) => !isExpoPushToken(t));

  if (expoTokens.length === 0 && fcmTokens.length === 0) return { sent: 0, failed: 0 };

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
      channelId: DEFAULT_CHANNEL_ID,
      badge: 1,
    }));

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      try {
        const { data } = await axios.post(EXPO_PUSH_URL, chunk, {
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
        });
        const receipts = data?.data || [];
        for (let j = 0; j < receipts.length; j++) {
          const receipt = receipts[j];
          if (receipt.status === 'ok') {
            sent++;
          } else {
            failed++;
            if (receipt.details?.error === 'DeviceNotRegistered') {
              const deadToken = chunk[j]?.to;
              if (deadToken) {
                void unregisterToken(deadToken);
              }
            }
          }
        }
      } catch (e) {
        console.warn('[PushService] Erro ao enviar chunk Expo:', e);
        failed += chunk.length;
      }
    }
  }

  if (fcmTokens.length > 0) {
    for (const tok of fcmTokens) {
      const ok = await sendFcmNotification(tok, payload);
      if (ok) sent++;
      else failed++;
    }
  }

  return { sent, failed };
}

// Send test push to a specific token (suporta Expo e Firebase FCM)
export async function sendTestPush(token: string): Promise<boolean> {
  try {
    const result = await sendPushNotification({
      title: '🔔 Teste de notificação',
      body: 'Notificação de teste enviada com sucesso pelo Jenus!',
      data: { screen: 'system' },
      token,
      priority: 'high',
    });
    return result.sent > 0;
  } catch (err) {
    console.warn('[PushService] Erro no sendTestPush:', err);
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
