import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import { initializeSmtpRuntimeConfig } from './shared/smtp/smtpConfig.service.js';
import {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware,
  timeoutMiddleware,
  contentTypeMiddleware,
} from './shared/middleware/errorHandler.js';
import { loggerMiddleware, logInfo, logError } from './shared/utils/logger.js';

import analisarRoutes, { pdfPreviewRouter } from './analisar/analisar.routes.js';
import testeRoutes from './teste/teste.routes.js';
import smtpRoutes from './shared/smtp/smtp.routes.js';
import monitorRoutes from './monitor/monitor.routes.js';
import exportRoutes from './export/export.routes.js';
import perfilRoutes from './perfil/perfil.routes.js';
import compatibilidadeRoutes from './compatibilidade.routes.js';
import emailTestRoutes from './shared/email/emailTest.routes.js';
import analyticsRoutes from './analytics/analytics.routes.js';
import automacaoRoutes from './automacao/automacao.routes.js';
import { vagasEmailWorker } from './automacao/vagasEmailWorker.service.js';

import { startOportunidadesDiariasCron } from './automacao/notificacaoOportunidades.cron.js';

const app = express();

await initializeSmtpRuntimeConfig();
startOportunidadesDiariasCron();

// Scraper scheduler (fontes internacionais) permanece desativado por padrão: usuário
// controla envios e análises via Dashboard. A automação de envio (vagasEmailWorker),
// porém, retoma automaticamente no boot SOMENTE se o usuário já a tinha ligado antes
// (estado persistido em curriculo_automacao_config) — caso contrário fica parada por
// redeploy, exigindo um toggle manual toda vez.
try {
  const automacaoDeveEstarAtiva = await vagasEmailWorker.isAtivoPersistido();
  if (automacaoDeveEstarAtiva) {
    logInfo('[Boot] Retomando automação de envios (estado persistido = ativo)...');
    await vagasEmailWorker.iniciar();
  }
} catch (err) {
  logError('[Boot] Falha ao retomar automação de envios automaticamente:', err);
}

// O nginx injeta X-Forwarded-For/Proto. Sem `trust proxy` aqui o
// express-rate-limit deste app lança ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// (o `app.set("trust proxy", 1)` do index.ts raiz NÃO é herdado por este
// Express Application aninhado). Respeita a env TRUST_PROXY do deploy.
if (config.server.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(requestIdMiddleware);

app.use(timeoutMiddleware(30000));

if (config.server.env === 'production') {
  app.use(helmet(config.security.helmet));
} else {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
}

const limiter = rateLimit(config.rateLimit);
app.use(limiter);

app.use(
  contentTypeMiddleware([
    'application/json',
    'multipart/form-data',
    'application/x-www-form-urlencoded',
  ]),
);

app.use(
  express.json({
    limit: '10mb',
    verify: (req, res: express.Response, buf) => {
      try {
        JSON.parse(buf.toString());
      } catch {
        res.status(400).json({
          success: false,
          error: {
            message: 'JSON inválido',
            status: 400,
          },
        });
        return;
      }
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (config.dev.logRequests) {
  app.use(loggerMiddleware);
}

app.use('/', analisarRoutes);
app.use('/', perfilRoutes);
app.use('/', monitorRoutes);
app.use('/', compatibilidadeRoutes);
app.use('/', emailTestRoutes);
app.use('/', testeRoutes);
app.use('/', smtpRoutes);
app.use('/', exportRoutes);
app.use('/', analyticsRoutes);
app.use('/', automacaoRoutes);

app.use(notFoundHandler);

app.use(errorHandler);

export { pdfPreviewRouter };
export default app;
