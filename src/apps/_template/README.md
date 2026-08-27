# Template de aplicação

Este backend é um hub: várias aplicações de produto (hoje `curriculos` e
`promo`) compartilham o mesmo processo, a mesma API e o mesmo banco SQLite,
cada uma com sua fatia isolada de rotas e tabelas. Esta pasta é um
esqueleto pronto para copiar quando você quiser adicionar uma nova
aplicação (ex.: um hipotético app de "carros").

## Passo a passo

1. **Copie esta pasta** para `src/apps/<app>` (ex.: `src/apps/carros`).
   Não copie o `README.md`.

2. **Renomeie tudo que tem `template`/`exemplo`** nos arquivos copiados:
   - `config.ts`: `templateConfig` → `carrosConfig`, adicione as variáveis
     de ambiente reais desta app (zod, mesmo padrão de `core/config.ts`).
     Nunca reaproveite uma variável já declarada em `core/config.ts` ou em
     outra app — se for algo genuíno de infraestrutura (porta, CORS, rate
     limit padrão), já existe em `core/config.ts`.
   - `migrations/index.ts`: `templateMigrations` → `carrosMigrations`, IDs
     `template_001_initial` → `carros_001_initial` (o prefixo `<app>_` é
     obrigatório e precisa ser único entre TODAS as apps, já que todas
     dividem a mesma tabela `schema_migrations`). Nomeie as tabelas com o
     prefixo `carros_` (ex.: `carros_veiculos`) — é o que evita colisão de
     nomes num banco SQLite único sem schemas separados.
   - `repositories/`, `controllers/`, `routes/`: renomeie os arquivos e a
     lógica para as entidades reais da app.
   - `index.ts`: `templateModule` → `carrosModule`, `name: "carros"`,
     `prefix: "/api/carros"`.

3. **Registre as migrations** em `src/core/database.ts`:
   ```ts
   import { carrosMigrations } from '../apps/carros/migrations/index.js';
   // ...
   await runMigrations(database, [...curriculoMigrations, ...promoMigrations, ...carrosMigrations]);
   ```
   Se a app tiver seed inicial, siga o padrão de
   `apps/promo/migrations/seed.ts` e chame o seed logo depois do
   `runMigrations` em `initDb()`.

4. **Registre a app** em `src/index.ts`:
   ```ts
   import carrosModule from "./apps/carros/index.js";
   // ...
   registerApp(app, carrosModule);
   ```
   Por padrão `registerApp` exige `requireAuth` (o mesmo login único
   admin usado por todo o backend) em todas as rotas da app. Se a app
   precisar de algum endpoint público (webhook, callback externo), use
   `protected: false` no `AppModule` e aplique `requireAuth` rota a rota
   internamente — veja `apps/promo/deploy/deploy.routes.ts` como
   referência (é assim que o endpoint de deploy do promo fica público).

5. **Valide**: `npx tsc --noEmit`, depois rode localmente e confirme que
   `/api/carros/...` responde e que `schema_migrations` ganhou as novas
   entradas (`SELECT name FROM schema_migrations WHERE name LIKE 'carros_%'`).

## O que NÃO duplicar

Estas peças já existem em `shared/` e devem ser **reusadas**, nunca
recriadas dentro da nova app:

- **Auth**: `shared/auth/auth.middleware.ts` (`requireAuth`/`optionalAuth`),
  `shared/auth/jwt-auth.ts` (geração/verificação de token). Login continua
  único (um admin, um JWT válido para todas as apps) — se sua app
  precisar de múltiplos usuários/roles próprios, isso é uma decisão de
  produto separada, converse antes de implementar.
- **Email**: `shared/email/mailer.ts` para SMTP genérico
  (`criarTransporter`, `getSmtpRuntimeConfig`, `sendMail`). Lógica de
  template de email específica da sua app fica dentro dela, mas por cima
  do `mailer.ts`, sem reimplementar a parte de transporte.
- **Rate limit**: `shared/rate-limit/presets.ts` (`defaultLimiter`,
  `authLimiter`, `strictLimiter`). Só crie um preset novo se os já
  existentes genuinamente não servirem.
- **Logger**: `core/logger.ts`.
- **Banco**: `core/database.ts` (`getDb()`) — conexão SQLite singleton
  compartilhada. Nunca abra uma conexão própria.
