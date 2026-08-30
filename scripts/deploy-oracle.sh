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

    echo '🔨 Executando build...'
    npm run build

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