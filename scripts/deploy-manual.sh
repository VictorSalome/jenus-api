#!/bin/bash
# Script de deploy para Oracle Cloud - Execute na VM

clear
echo "🚀 PROMO MONITOR - DEPLOY ORACLE CLOUD"
echo "========================================"
echo ""

echo "📦 Passo 1: Atualizando sistema..."
sudo apt update -qq

echo "📦 Passo 2: Instalando Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

echo "💾 Passo 3: Configurando swap (2GB)..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

echo "📥 Passo 4: Baixando projeto..."
cd ~/
rm -rf enviaPromo 2>/dev/null
git clone https://github.com/VictorSalome/enviaPromo.git
cd enviaPromo

echo "📦 Passo 5: Instalando dependências..."
npm install

echo "🔨 Passo 6: Build..."
npm run build

echo "📝 Passo 7: Configurando .env..."
cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$yXf3vK0vlJKnRD3sWMiVyOeUYdyV4zceeLgxf.Qc5TRE0C3Q5hJrK
SESSION_SECRET=chave-oracle-cloud-promo-monitor-32-caracteres
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1515734935909171263/nV1DfgLt3U7vmg7tyb8nIJqtIGzxv_oF5yrdWb4zVUslS_RMyUMEW1xv7LVy5zXr5qU5
CHECK_INTERVAL_SECONDS=30
MIN_TIME_BETWEEN_MESSAGES=30
URGENT_ENABLED=true
DATABASE_PATH=./data/promo-monitor.db
ENVEOF

echo "📁 Passo 8: Criando diretório de dados..."
mkdir -p data

echo "🌐 Passo 9: Instalando PM2..."
sudo npm install -g pm2

echo "🚀 Passo 10: Iniciando aplicação..."
pm2 delete promo-monitor 2>/dev/null
pm2 start dist/index.js --name "promo-monitor"
pm2 save
pm2 startup systemd --non-interactive

echo ""
echo "========================================"
echo "✅ DEPLOY CONCLUÍDO!"
echo "========================================"
echo ""
echo "🌐 Acesse: http://$(curl -s ifconfig.me):3001"
echo "👤 Login: admin"
echo "🔑 Senha: admin123"
echo ""
echo "📊 Status do monitor:"
pm2 status

echo ""
echo "📋 Comandos úteis:"
echo "  pm2 logs promo-monitor     - Ver logs"
echo "  pm2 restart promo-monitor  - Reiniciar"
echo "  pm2 stop promo-monitor     - Parar"
echo "  pm2 monit                   - Monitorar recursos"
echo ""
