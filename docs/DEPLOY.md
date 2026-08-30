# 🚀 Jenus API — Deploy

## Infraestrutura

- **Host Oracle Cloud**: `136.248.109.21` (user `ubuntu`, SSH key `~/.ssh/oracle.key`)
- **Diretório remoto**: `/home/ubuntu/jenus-api`
- **PM2**: processo `promo-monitor` rodando `dist/index.js`
- **GitHub**: `VictorSalome/enviaPromo`, branch `main` (GitHub Actions faz deploy em push)
- **Railway**: `railway.toml` com `startCommand: node dist/index.js`

## Scripts de deploy (2 únicos)

- `scripts/setup-oracle.sh` — **setup inicial** da VM (1ª vez): instala OS/Node/PM2, clona o repo em `/home/ubuntu/jenus-api`, builda e gera o `.env` a partir de `.env.example`. **Não escreve segredos** — você edita o `.env` depois.
- `scripts/deploy-oracle.sh` — **atualização** (usado por `npm run deploy`): `git pull` + `build` + `pm2 reload`. Não altera o `.env`.

> Os antigos `deploy.sh`, `deploy-manual.sh` e `oracle-deploy.sh` foram removidos (escreviam `.env` com webhook placeholder e segredos hardcoded).

## Deploy Manual (Oracle)

```bash
npm run deploy          # = bash scripts/deploy-oracle.sh
```

O script:
1. Faz `npm run build` local
2. Commit + push para `main`
3. No Oracle: `git pull && npm install && npm run build && pm2 restart jenus-api`

> ⚠️ O projeto usa **pnpm** localmente (pnpm-lock.yaml). O script remoto ainda usa `npm install` — se o servidor não tiver pnpm, instale com `npm install -g pnpm` na VM. O `npm install` funciona por ler package.json, mas a consistência de lockfile exige pnpm.

## Atualizar Variáveis (.env)

O `.env` é **gitignored** — não vai para o servidor via git. Para atualizar:

```bash
npm run sync-env         # = bash scripts/sync-env.sh
```

O script:
1. Mostra o diff entre `.env` local e `.env` do servidor
2. Confirma com você antes de aplicar
3. Copia o `.env` via `scp`
4. Reinicia o PM2 com `--update-env`

Opções:
```bash
npm run sync-env --dry-run     # só mostra diff, sem alterar
npm run sync-env --no-restart  # copia sem reiniciar (reinicie manual: pm2 reload jenus-api)
```

## PM2

```bash
npm run start:pm2    # pm2 start scripts/pm2.config.js
npm run restart:pm2  # pm2 restart
npm run logs:pm2     # pm2 logs jenus-api
```

Config em `scripts/pm2.config.js`: 1 instância, autorestart, NODE_ENV=production, logs em `./logs/`.

## Setup Inicial da VM

Ver `docs/ORACLE_CLOUD.md` e `docs/TUTORIAL_DEPLOY.md` para o passo a passo completo da Oracle. Resumo:

```bash
# 1. Acessar a VM
ssh -i ~/.ssh/oracle.key ubuntu@136.248.109.21

# 2. Instalar dependências
sudo apt install -y nodejs git
sudo npm install -g pm2

# 3. Clonar e rodar (ou usar scripts/setup-oracle.sh)
git clone https://github.com/VictorSalome/enviaPromo.git /home/ubuntu/jenus-api
cd /home/ubuntu/jenus-api
cp .env.example .env        # edite com ADMIN_USERNAME, ADMIN_PASSWORD_HASH e JWT secrets
npm install --prod
npm run build
pm2 start scripts/pm2.config.cjs
```

## Variáveis de Ambiente (produção)

Crie `.env` na VM com pelo menos:

```
NODE_ENV=production
PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$10$...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
DISCORD_WEBHOOK_URL=...
```

Referência completa: `.env.example`.

## Notas

- `dist/index.js` é o entrypoint do deploy — a reestruturação para `src/apps/` não muda o artefato.
- O build copia `src/curriculos` → `dist/curriculos` (JS legado não é compilado pelo tsc).
- Backups: `data/` (SQLite) não deve ser versionado — em produção, considere backup periódico dos arquivos `data/*.db`.