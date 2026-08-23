#!/bin/bash
# Deploy automático para Oracle Cloud
# Uso: pnpm deploy

set -e

ORACLE_HOST="136.248.109.21"
ORACLE_USER="ubuntu"
SSH_KEY="$HOME/.ssh/oracle.key"
REMOTE_DIR="/home/ubuntu/jenus-api"

echo "🚀 Deploy Oracle Cloud..."
echo ""

# 1. Build local
echo "🔨 Building..."
pnpm build

# 2. Commit + push
echo "📤 Pushing to origin..."
git add -A
git diff --cached --quiet && echo "Nothing to commit" && exit 0
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M')" || true
git push origin main

# 3. Deploy no Oracle
echo "🌐 Deploying no Oracle..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$ORACLE_USER@$ORACLE_HOST" \
  "cd $REMOTE_DIR && git pull origin main && npm install --production && npm run build && pm2 reload promo-monitor"

echo ""
echo "✅ Deploy concluído!"
echo "🌐 http://$ORACLE_HOST:3001"
