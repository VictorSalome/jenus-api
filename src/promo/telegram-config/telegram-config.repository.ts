import { TelegramConfig } from './telegram-config.types.js';
import { getDb } from '../../core/database.js';

export const getConfig = async (): Promise<TelegramConfig | null | undefined> => {
  const db = await getDb();
  const row = await db.get('SELECT * FROM promo_telegram_config WHERE id = 1');
  
  if (!row) return null;
  
  // Map snake_case columns to camelCase
  return {
    id: row.id,
    apiId: row.api_id,
    apiHash: row.api_hash,
    phone: row.phone,
    sessionString: row.session_string,
    isConnected: !!row.is_connected,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

export const saveConfig = async (config: Partial<TelegramConfig>): Promise<void> => {
  const db = await getDb();
  const existing = await getConfig();
  
  // Only update fields that are provided (including empty strings to clear)
  const apiId = config.apiId !== undefined ? config.apiId : undefined;
  const apiHash = config.apiHash !== undefined ? config.apiHash : undefined;
  const phone = config.phone !== undefined ? config.phone : undefined;
  
  if (existing && existing.id) {
    const updates: string[] = [];
    const params: any[] = [];
    
    if (apiId !== undefined) { updates.push('api_id = ?'); params.push(apiId); }
    if (apiHash !== undefined) { updates.push('api_hash = ?'); params.push(apiHash); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    
    if (updates.length > 0) {
      params.push(1);
      await db.run(
        `UPDATE promo_telegram_config SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ...params
      );
    }
  } else {
    await db.run(
      `INSERT INTO promo_telegram_config (id, api_id, api_hash, phone, is_connected)
       VALUES (1, ?, ?, ?, 0)`,
      config.apiId || '',
      config.apiHash || '',
      config.phone || ''
    );
  }
};

export const updateSession = async (sessionString: string, isConnected: boolean): Promise<void> => {
  const db = await getDb();
  await db.run(
    'UPDATE promo_telegram_config SET session_string = ?, is_connected = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
    sessionString,
    isConnected ? 1 : 0
  );
};
