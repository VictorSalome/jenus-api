#!/bin/bash
# Script de SETUP INICIAL da VM Oracle Cloud (1ª execução).
# Uso (DENTRO da VM via SSH):
#   ssh -i ~/.ssh/oracle.key ubuntu@136.248.109.21
#   bash scripts/setup-oracle.sh
#
# Este script NÃO escreve segredos nem placeholders. Ele instala o ambiente,
# clona o repositório, builda e gera o `.env` a partir de `.env.example`.
# Você PRECISA editar o `.env` depois para preencher os valores reais
# (DISCORD_WEBHOOK_URL, JWT_*, ADMIN_PASSWORD_HASH, etc).

set -e

REMOTE_DIR="/home/ubuntu/jenus-api"
REPO_URL="https://github.com/VictorSalome/enviaPromo.git"
BRANCH="main"

echo "🚀 Setup inicial do Promo Monitor na Oracle VM ($REMOTE_DIR)"

# 1. SO + Node 20 + PM2
echo "📦 Instalando dependências do sistema..."
sudo apt update -qq
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pm2

# 2. Swap (compensar RAM da VM)
echo "💾 Configurando swap (2GB)..."
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Clonar repositório
echo "📥 Clonando repositório em $REMOTE_DIR..."
if [ -d "$REMOTE_DIR" ]; then
  echo "⚠️  $REMOTE_DIR já existe — pulando clone."
else
  git clone -b "$BRANCH" "$REPO_URL" "$REMOTE_DIR"
fi
cd "$REMOTE_DIR"

# 4. Instalar + build
echo "📦 Instalando dependências e build..."
npm install
npm run build

# 5. Gerar .env a partir do template (SEM segredos hardcoded)
echo "📝 Gerando .env a partir de .env.example..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ .env criado. EDITE agora e preencha os valores reais:"
  echo "   - DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<ID>/<TOKEN>"
  echo "   - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / ADMIN_PASSWORD_HASH / SESSION_SECRET"
  echo "   Depois rode: pm2 restart jenus-api"
else
  echo "ℹ️  .env já existe — não sobrescrevendo. Confira se DISCORD_WEBHOOK_URL está correto."
fi

# 6. Dados
mkdir -p data

# 7. Iniciar com PM2 (via config central)
echo "🚀 Iniciando com PM2..."
pm2 start dist/index.js --name "jenus-api" || pm2 restart jenus-api
pm2 save
pm2 startup systemd --non-interactive || true

echo ""
echo "✅ Setup concluído!"
echo "🌐 API: http://136.248.109.21:3001"
echo "📋 Próximo passo obrigatório: editar $REMOTE_DIR/.env com os valores reais e rodar 'pm2 restart jenus-api'"
