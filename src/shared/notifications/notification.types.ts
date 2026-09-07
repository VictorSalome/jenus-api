export type NotificationModule = 'curriculo' | 'financas' | 'promo' | 'system';
export type NotificationPriority = 'low' | 'normal' | 'high';
export type SoundType = 'default' | 'chat' | 'payment';

export interface NotificationType {
  id: string;
  module: NotificationModule;
  name: string;
  description: string;
  title_template: string;
  body_template: string;
  default_priority: NotificationPriority;
  default_enabled: number; // 0 ou 1
  sound_type: SoundType;
  created_at?: string;
}

export interface UserNotificationPreference {
  user_id: string;
  type_id: string;
  enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  updated_at?: string;
  type_name?: string;
  module?: NotificationModule;
  description?: string;
  sound_type?: SoundType;
}

export interface NotificationLog {
  id: number;
  user_id: string;
  type_id: string;
  title: string;
  body: string;
  payload_json?: string;
  fingerprint?: string;
  status: 'sent' | 'delivered' | 'failed' | 'opened' | 'skipped_disabled' | 'skipped_quiet_hours';
  sent_at: string;
}

export interface DispatchOptions {
  userId?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  fingerprint?: string;
  priority?: NotificationPriority;
  sound?: SoundType;
  templateVars?: Record<string, string | number>;
}
