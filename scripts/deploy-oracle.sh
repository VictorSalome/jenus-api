#!/bin/bash

# Deploy de ATUALIZAÇÃO para Oracle Cloud (usado por `npm run deploy`).
# O setup INICIAL da VM é feito uma única vez por scripts/setup-oracle.sh.
# Este script NÃO altera o .env da VM — ele faz git pull + build + pm2 reload.
# O .env (com DISCORD_WEBHOOK_URL, JWT_*, etc.) deve estar presente na VM.
#
# Uso:
#   npm run deploy
#   npm run deploy:oracle

set -e

ORACLE_HOST="136.248.109.21"
ORACLE_USER="ubuntu"
SSH_KEY="$HOME/.ssh/oracle.key"
REMOTE_DIR="/home/ubuntu/jenus-api"
PM2_APP_NAME="jenus-api"

echo "🚀 Deploy Oracle Cloud..."
echo ""

# ─────────────────────────────────────────────
# 1. Build local
# ─────────────────────────────────────────────

echo "🔨 Building local..."

npm run build

echo "✅ Build local concluído."
echo ""

# ─────────────────────────────────────────────
# 2. Commit + Push
# ─────────────────────────────────────────────

echo "📤 Verificando alterações..."

git add -A

if git diff --cached --quiet; then
  echo "ℹ️ Nenhuma alteração para commit."
else
  git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')"
  git push origin main

  echo "✅ Código enviado para GitHub."
fi

echo ""

# ─────────────────────────────────────────────
# 3. Deploy Oracle
# ─────────────────────────────────────────────

echo "🌐 Conectando à Oracle..."

# O VM tem apenas 956MB de RAM — rodar `npx tsc` lá estoura a memória (OOM),
# apagando o dist/ sem conseguir reconstruí-lo. Por isso o build é feito
# LOCALMENTE (passo 1) e o dist/ é copiado pronto para o VM.

# 1. Sincronizar código + dependências no VM
ssh -i "$SSH_KEY" \
  -o StrictHostKeyChecking=no \
  "$ORACLE_USER@$ORACLE_HOST" \
  "
    set -e
    cd '$REMOTE_DIR'
    echo '📥 Sincronizando código...'
    git fetch origin main
    git reset --hard origin/main
    echo '📦 Instalando dependências...'
    npm install
  "

# 2. Copiar o dist/ compilado localmente para o VM.
# Segurança: não apagar o dist/ atual antes de garantir que o novo chegou.
# Se o scp falhar (rede/VM) ou o mv quebrar no meio, o dist/ antigo continua
# no lugar e o PM2 não fica apontando para um arquivo inexistente.
echo '📦 Copiando dist/ local para o VM...'
if ! scp -i "$SSH_KEY" -o StrictHostKeyChecking=no -r dist "$ORACLE_USER@$ORACLE_HOST:$REMOTE_DIR/dist_new"; then
  echo '❌ Falha ao copiar dist/ — deploy abortado (dist/ antigo preservado).'
  exit 1
fi
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$ORACLE_USER@$ORACLE_HOST" "
  set -e
  cd '$REMOTE_DIR'
  if [ ! -f dist_new/index.js ]; then
    echo '❌ dist_new/index.js ausente — abortando para não apagar o dist/ atual.'
    rm -rf dist_new
    exit 1
  fi
  # Troca atômica: dist/ nunca fica ausente entre o rm e o mv (evita
  # ERR_MODULE_NOT_FOUND + crash-loop do PM2 caso ele reinicie no meio
  # da troca — incidente já observado em produção).
  rm -rf dist_old
  mv dist dist_old
  mv dist_new dist
  rm -rf dist_old
  echo '✅ dist/ atualizado no VM'
"

# 3. Recarregar PM2
ssh -i "$SSH_KEY" \
  -o StrictHostKeyChecking=no \
  "$ORACLE_USER@$ORACLE_HOST" \
  "
    set -e
    cd '$REMOTE_DIR'
    echo '🔎 Verificando PM2...'
    if pm2 describe '$PM2_APP_NAME' >/dev/null 2>&1; then
      echo '♻️ Processo encontrado. Recarregando...'
      pm2 reload '$PM2_APP_NAME' --update-env
    else
      echo '🚀 Processo não encontrado. Criando...'
      pm2 start scripts/pm2.config.cjs
    fi
    echo '💾 Salvando PM2...'
    pm2 save
    echo '📊 Status:'
    pm2 status
    echo '✅ Deploy Oracle concluído!'
  "

echo ""
echo "========================================="
echo "🎉 DEPLOY CONCLUÍDO"
echo "========================================="
echo ""
echo "🌐 API: http://$ORACLE_HOST:3001"