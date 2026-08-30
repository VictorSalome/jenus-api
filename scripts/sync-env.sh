#!/bin/bash
# Sincroniza o .env LOCAL para o SERVIDOR.
# O .env é gitignored (nunca vai pelo git pull), então este script
# é o caminho legítimo para atualizar credenciais no servidor.
#
# Uso:
#   bash scripts/sync-env.sh              # sync + reinicia
#   bash scripts/sync-env.sh --dry-run    # só mostra o diff, sem alterar
#   bash scripts/sync-env.sh --no-restart # sync sem reiniciar

set -e

ORACLE_HOST="136.248.109.21"
ORACLE_USER="ubuntu"
SSH_KEY="$HOME/.ssh/oracle.key"
REMOTE_DIR="/home/ubuntu/jenus-api"
PM2_APP_NAME="jenus-api"

DRY_RUN=false
NO_RESTART=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --no-restart) NO_RESTART=true ;;
  esac
done

# Validações locais
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env não encontrado em $PROJECT_DIR"
  exit 1
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "❌ Chave SSH não encontrada: $SSH_KEY"
  exit 1
fi

echo "🔗 Conectando ao servidor $ORACLE_HOST..."

# Verifica se o servidor está acessível
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$ORACLE_USER@$ORACLE_HOST" "echo ok" > /dev/null 2>&1; then
  echo "❌ Não foi possível conectar ao servidor"
  exit 1
fi

# Mostra o diff antes de aplicar
echo ""
echo "📊 Diferenças que serão aplicadas:"
ssh -i "$SSH_KEY" "$ORACLE_USER@$ORACLE_HOST" "diff $REMOTE_DIR/.env /dev/stdin" < "$ENV_FILE" 2>/dev/null || true
echo ""

if [ "$DRY_RUN" = true ]; then
  echo "ℹ️  Modo dry-run: nenhuma alteração foi feita."
  exit 0
fi

# Confirmação
read -p "📝 Aplicar essas alterações no servidor? (s/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  echo "❌ Cancelado."
  exit 0
fi

# Copia o .env para o servidor
echo "📤 Enviando .env para o servidor..."
scp -i "$SSH_KEY" "$ENV_FILE" "$ORACLE_USER@$ORACLE_HOST:$REMOTE_DIR/.env"

# Reinicia o PM2
if [ "$NO_RESTART" = false ]; then
  echo "🔄 Reiniciando PM2 ($PM2_APP_NAME)..."
  ssh -i "$SSH_KEY" "$ORACLE_USER@$ORACLE_HOST" "pm2 reload $PM2_APP_NAME --update-env"
  echo "✅ PM2 reiniciado!"
else
  echo "ℹ️  Pulando reinício (--no-restart). Rode manualmente: pm2 reload $PM2_APP_NAME"
fi

echo ""
echo "✅ .env sincronizado com sucesso!"
echo "📊 Verifique no app: Monitor → Testar fluxo completo"
