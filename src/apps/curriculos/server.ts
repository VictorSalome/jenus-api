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
import { loggerMiddleware } from './shared/utils/logger.js';
import { autoStartScheduler } from './buscas/scheduler.service.js';

import analisarRoutes, { pdfPreviewRouter } from './analisar/analisar.routes.js';
import testeRoutes from './teste/teste.routes.js';
import smtpRoutes from './shared/smtp/smtp.routes.js';
import buscasRoutes from './buscas/buscas.routes.js';
import pendingRoutes from './buscas/pending.routes.js';
import sourcesRoutes from './buscas/sources.routes.js';
import scraperRoutes from './scraper/scraper.routes.js';
import monitorRoutes from './monitor/monitor.routes.js';
import perfilRoutes from './perfil/perfil.routes.js';
import compatibilidadeRoutes from './compatibilidade.routes.js';
import emailTestRoutes from './shared/email/emailTest.routes.js';

const app = express();

await initializeSmtpRuntimeConfig();

autoStartScheduler();

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
app.use('/', buscasRoutes);
app.use('/', pendingRoutes);
app.use('/', sourcesRoutes);
// Prefixo próprio: as rotas de scraper.routes.ts (busca "crua" por
// tecnologia/remoto, sem persistir) usam /vagas, o que colidia com
// compatibilidade.routes.ts (listagem das vagas cadastradas com
// compatibilidade calculada, é o que o app realmente consome).
app.use('/scraper', scraperRoutes);
app.use('/', monitorRoutes);
app.use('/', compatibilidadeRoutes);
app.use('/', emailTestRoutes);
app.use('/', testeRoutes);
app.use('/', smtpRoutes);

app.use(notFoundHandler);

app.use(errorHandler);

export { pdfPreviewRouter };
export default app;
