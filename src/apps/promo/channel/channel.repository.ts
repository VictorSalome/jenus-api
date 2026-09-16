import { getDb } from '../../../core/database.js';
import { Channel } from './channel.types.js';

export const findAll = async (): Promise<Channel[]> => {
  const db = await getDb();
  const rows = await db.all('SELECT id, username, name, is_active as isActive, created_at as createdAt FROM promo_channels ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    username: r.username,
    name: r.name,
    isActive: Boolean(r.isActive),
    createdAt: r.createdAt
  }));
};

export const findById = async (id: number): Promise<Channel | undefined> => {
  const db = await getDb();
  return db.get('SELECT id, username, name, is_active, created_at FROM promo_channels WHERE id = ?', id);
};

export const findByUsername = async (username: string): Promise<Channel | undefined> => {
  const db = await getDb();
  return db.get('SELECT id, username, name, is_active, created_at FROM promo_channels WHERE username = ?', username);
};

export const create = async (channel: Omit<Channel, 'id' | 'createdAt'>): Promise<number> => {
  const db = await getDb();
  const result = await db.run(
    'INSERT INTO promo_channels (username, name, is_active) VALUES (?, ?, ?)',
    channel.username,
    channel.name || null,
    channel.isActive ? 1 : 0
  );
  return result.lastID!;
};

export const update = async (id: number, channel: Partial<Channel>): Promise<void> => {
  const db = await getDb();
  await db.run(
    `UPDATE promo_channels 
     SET username = COALESCE(?, username),
         name = COALESCE(?, name),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`,
    channel.username || null,
    channel.name || null,
    channel.isActive !== undefined ? (channel.isActive ? 1 : 0) : null,
    id
  );
};

export const remove = async (id: number): Promise<void> => {
  const db = await getDb();
  await db.run('DELETE FROM promo_channels WHERE id = ?', id);
};

export const toggle = async (id: number): Promise<void> => {
  const db = await getDb();
  await db.run(
    'UPDATE promo_channels SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?',
    id
  );
};
