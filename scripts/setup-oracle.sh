#!/bin/bash
# Script de deploy para Oracle Cloud - VM.Standard.E2.1.Micro
# Com swap para compensar 1GB RAM

set -e

IP="136.248.109.21"

echo "🚀 Deploy Promo Monitor no Oracle Cloud"
echo "IP: $IP"
echo ""

# Verifica se está rodando na VM
if [ "$(hostname -I | grep $IP)" = "" ]; then
  echo "❌ Execute este script DENTRO da VM via SSH!"
  echo "Comando: ssh -i sua-chave.key ubuntu@$IP"
  exit 1
fi

echo "📦 Atualizando sistema..."
sudo apt update -qq

echo "📦 Instalando Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

echo "💾 Configurando swap (2GB para compensar RAM)..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
sudo bash -c 'echo "/swapfile none swap sw 0 0" >> /etc/fstab'
free -h

echo "📥 Clonando repositório..."
cd ~/
git clone https://github.com/VictorSalome/enviaPromo.git
cd enviaPromo

echo "📦 Instalando dependências..."
npm install

echo "🔨 Build..."
npm run build

echo "🌐 Instalando PM2..."
sudo npm install -g pm2

echo "📝 Configurando .env..."
cat > .env << 'EOF'
NODE_ENV=production
PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$yXf3vK0vlJKnRD3sWMiVyOeUYdyV4zceeLgxf.Qc5TRE0C3Q5hJrK
SESSION_SECRET=chave-oracle-cloud-promo-monitor-32-chars
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1515734935909171263/nV1DfgLt3U7vmg7tyb8nIJqtIGzxv_oF5yrdWb4zVUslS_RMyUMEW1xv7LVy5zXr5qU5
CHECK_INTERVAL_SECONDS=30
MIN_TIME_BETWEEN_MESSAGES=30
URGENT_ENABLED=true
DATABASE_PATH=./data/promo-monitor.db
EOF

echo "📁 Criando diretório de dados..."
mkdir -p data

echo "🚀 Iniciando aplicação..."
pm2 start dist/index.js --name "promo-monitor"
pm2 save
pm2 startup systemd --non-interactive

echo "✅ DEPLOY CONCLUÍDO!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "🌐 Acesse: http://$IP:3001"
echo "👤 Login: admin / admin123"
echo ""
echo "📋 Comandos úteis:"
echo "  pm2 logs promo-monitor  - Ver logs"
echo "  pm2 restart promo-monitor  - Reiniciar"
echo "  pm2 stop promo-monitor  - Parar"
echo ""
