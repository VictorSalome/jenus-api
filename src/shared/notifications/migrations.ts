import type { Migration } from '../../core/migrations/runner.js';

export const notificationMigrations: Migration[] = [
  {
    id: '20260907_01_create_notifications_schema',
    up: `
      -- 1. Catálogo oficial de tipos de notificação
      CREATE TABLE IF NOT EXISTS notification_types (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        title_template TEXT NOT NULL,
        body_template TEXT NOT NULL,
        default_priority TEXT NOT NULL DEFAULT 'normal',
        default_enabled INTEGER NOT NULL DEFAULT 1,
        sound_type TEXT DEFAULT 'default',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. Preferências do usuário por tipo de evento
      CREATE TABLE IF NOT EXISTS user_notification_preferences (
        user_id TEXT NOT NULL,
        type_id TEXT NOT NULL REFERENCES notification_types(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 1,
        quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
        quiet_hours_start TEXT DEFAULT '22:00',
        quiet_hours_end TEXT DEFAULT '08:00',
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, type_id)
      );

      -- 3. Log e auditoria de notificações enviadas
      CREATE TABLE IF NOT EXISTS notifications_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type_id TEXT NOT NULL REFERENCES notification_types(id),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        payload_json TEXT,
        fingerprint TEXT UNIQUE,
        status TEXT DEFAULT 'sent',
        sent_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_log_user ON notifications_log(user_id, sent_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_log_fingerprint ON notifications_log(fingerprint);

      -- 4. Inserção do catálogo de eventos do sistema
      INSERT OR IGNORE INTO notification_types (id, module, name, description, title_template, body_template, default_priority, default_enabled, sound_type)
      VALUES
        -- Módulo de Currículos
        ('curriculo.recruiter_reply', 'curriculo', 'Mensagem de Recrutador (Chat)', 'Respostas recebidas de recrutadores via e-mail estilo WhatsApp', '💬 {{sender}}', '{{snippet}}', 'high', 1, 'chat'),
        ('curriculo.interview_scheduled', 'curriculo', 'Convite para Entrevista', 'Notificação imediata quando uma candidatura avança para entrevista', '🎉 Convite para Entrevista: {{company}}', 'Parabéns! Você foi convidado para entrevista para a vaga {{position}}.', 'high', 1, 'default'),
        ('curriculo.application_pending_review', 'curriculo', 'Nova Vaga Compatível (>85%)', 'Vagas com alta compatibilidade encontradas pelos robôs de busca', '🎯 Vaga Compatível ({{match}}%): {{position}}', '{{company}} · Currículo adaptado pronto para sua revisão e envio.', 'normal', 1, 'default'),
        ('curriculo.weekly_analytics', 'curriculo', 'Relatório Semanal de Candidaturas', 'Resumo consolidado semanal de envios, aberturas e respostas', '📊 Resumo Semanal de Candidaturas', '{{sent_count}} candidaturas enviadas e {{replies_count}} respostas nesta semana.', 'low', 1, 'default'),

        -- Módulo de Finanças
        ('financas.transaction_detected', 'financas', 'Compra / Transação Identificada', 'Gastos detectados automaticamente pelo iOS Shortcut ou Android', '💳 {{merchant}}', 'Compra de R$ {{amount}} identificada. Toque para categorizar.', 'high', 1, 'payment'),
        ('financas.invoice_closed', 'financas', 'Fatura do Cartão Fechada', 'Aviso quando a fatura de cartão de crédito fecha no mês', '🧾 Fatura Fechada: {{card_name}}', 'Valor total: R$ {{amount}}. Vencimento em {{due_date}}.', 'high', 1, 'default'),
        ('financas.invoice_due_soon', 'financas', 'Vencimento de Fatura no Dia', 'Lembrete matinal no dia de vencimento de uma fatura de cartão', '⚠️ Fatura Vence Hoje: {{card_name}}', 'Lembrete: sua fatura de R$ {{amount}} vence hoje.', 'high', 1, 'default'),
        ('financas.installment_completed', 'financas', 'Última Parcela Finalizada', 'Comemoração ao quitar a última parcela de uma compra', '🎉 Parcela Finalizada!', 'Você acabou de quitar a última parcela ({{current}}/{{total}}) de {{description}}!', 'normal', 1, 'default'),

        -- Módulo de Promoções
        ('promo.price_target_reached', 'promo', 'Alerta de Preço Alvo Atingido', 'Notificação urgente quando um produto atinge o valor desejado', '🚨 Alerta de Preço: {{product_name}}', 'Caiu para R$ {{current_price}}! Toque para aproveitar antes que acabe.', 'high', 1, 'default'),
        ('promo.telegram_session_disconnected', 'promo', 'Sessão do Telegram Desconectada', 'Alerta quando o robô de promoções precisa de reconexão', '🔌 Monitor de Promoções Pausado', 'A sessão do Telegram expirou. Toque para reconectar.', 'high', 1, 'default'),

        -- Módulo de Sistema & Segurança
        ('system.resource_critical', 'system', 'Alerta Crítico de Servidor', 'Uso elevado de memória RAM, disco ou falha de processos na VM', '⚠️ Alerta de Servidor Oracle', 'Uso de RAM atingiu {{usage}}%. Verifique a integridade do sistema.', 'high', 1, 'default'),
        ('system.security_new_login', 'system', 'Segurança: Novo Login Detectado', 'Alerta ao realizar login a partir de um novo dispositivo ou IP', '🔒 Novo Acesso à sua Conta', 'Novo login identificado em {{device}} (IP: {{ip}}).', 'high', 1, 'default');
    `,
  },
];
