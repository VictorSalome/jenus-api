import { getDb } from '../../core/database.js';

export const addSentMessage = async (data: {
  link?: string;
  product?: string;
  price?: number;
  store?: string;
  channel: string;
  messageText: string;
  matchedFilters: string[];
}): Promise<void> => {
  const db = await getDb();
  await db.run(
    `INSERT INTO promo_sent_messages (link, product, price, store, channel, message_text, matched_filters)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    data.link || null,
    data.product || null,
    data.price || null,
    data.store || null,
    data.channel,
    data.messageText,
    JSON.stringify(data.matchedFilters)
  );
};

export const isDuplicate = async (link?: string, product?: string, price?: number, minutes: number = 30): Promise<boolean> => {
  const db = await getDb();
  const p = price || 0;
  const safeMinutes = Math.max(1, Math.floor(minutes)); // Sanitize: integer >= 1

  const existing = await db.get(
    `SELECT 1 FROM promo_sent_messages 
     WHERE (
       (link = ? AND price = ?)
       OR (product = ? AND price = ?)
     )
     AND sent_at > datetime('now', ? || ' minutes')
     LIMIT 1`,
    link || '', p, product || '', p, `-${safeMinutes}`
  );
  return !!existing;
};

export const getRecentMessages = async (limit: number = 50): Promise<any[]> => {
  const db = await getDb();
  return db.all(
    'SELECT * FROM promo_sent_messages ORDER BY sent_at DESC LIMIT ?',
    limit
  );
};
