import { getDb } from '../../core/database.js';

export const getStats = async (): Promise<any> => {
  const db = await getDb();
  
  const [today, week, month, channels, filters] = await Promise.all([
    db.get(`SELECT COUNT(*) as count FROM promo_sent_messages 
      WHERE sent_at >= datetime('now', 'start of day') 
      AND sent_at < datetime('now', 'start of day', '+1 day')`),
    db.get(`SELECT COUNT(*) as count FROM promo_sent_messages 
      WHERE sent_at > datetime('now', '-7 days')`),
    db.get(`SELECT COUNT(*) as count FROM promo_sent_messages 
      WHERE sent_at > datetime('now', '-30 days')`),
    db.get('SELECT COUNT(*) as count FROM promo_channels WHERE is_active = 1'),
    db.get('SELECT COUNT(*) as count FROM promo_filters WHERE is_active = 1'),
  ]);
  
  return {
    today: today?.count || 0,
    week: week?.count || 0,
    month: month?.count || 0,
    activeChannels: channels?.count || 0,
    activeFilters: filters?.count || 0
  };
};

export const getByChannel = async (): Promise<any[]> => {
  const db = await getDb();
  return db.all(`
    SELECT channel, COUNT(*) as count 
    FROM promo_sent_messages 
    WHERE sent_at > datetime('now', '-7 days')
    GROUP BY channel
    ORDER BY count DESC
  `);
};

export const getByFilter = async (): Promise<any[]> => {
  const db = await getDb();
  return db.all(`
    SELECT json_each.value as filter_name, COUNT(*) as count
    FROM promo_sent_messages, json_each(matched_filters)
    WHERE sent_at > datetime('now', '-7 days')
    GROUP BY filter_name
    ORDER BY count DESC
  `);
};
