export interface TelegramConfig {
  id?: number;
  apiId: string;
  apiHash: string;
  phone?: string;
  sessionString?: string;
  isConnected: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelegramConfigInput {
  apiId: string;
  apiHash: string;
  phone?: string;
}
