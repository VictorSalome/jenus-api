# Oracle Cloud Free Tier - Guia de Deploy

## 🎯 O que é?
Oracle Cloud oferece **VMs ARM (AMPERE) gratuitas para sempre**:
- 4 OCPUs ARM
- 24GB RAM
- 200GB Storage
- IP público fixo
- **Nunca expira!**

---

## 📝 Passo a Passo

### 1. Criar conta no Oracle Cloud
1. Acesse: https://www.oracle.com/cloud/free/
2. Clique em "Start for free"
3. Crie conta com email (pode usar email pessoal)
4. **Importante:** Adicione cartão de crédito (não cobra nada no free tier)
5. Complete o cadastro

### 2. Criar VM (Instância)
1. No console, vá em: **Menu ≡ → Compute → Instances**
2. Clique em **"Create Instance"**
3. Configurações:
   - **Name:** promo-monitor
   - **Image:** Canonical Ubuntu 22.04 (ARM)
   - **Shape:** VM.Standard.A1.Flex (AMPERE)
   - **OCPUs:** 4
   - **Memory:** 24GB
   - **Boot Volume:** 100GB
   - **Add SSH Keys:** Gere nova chave SSH (salve o arquivo .key)
4. Clique **"Create"**

### 3. Configurar Regras de Firewall (Security List)
1. Vá na VCN (Virtual Cloud Network)
2. Security Lists → Default Security List
3. Add Ingress Rule:
   - **Source Type:** CIDR
   - **Source CIDR:** 0.0.0.0/0
   - **IP Protocol:** TCP
   - **Destination Port Range:** 3001
4. Add outro para porta 80 (HTTP) e 443 (HTTPS) se quiser Nginx

### 4. Conectar na VM
```bash
# No terminal local
chmod 400 sua-chave-ssh.key
ssh -i sua-chave-ssh.key ubuntu@IP_PUBLICO_DA_VM
```

O IP público está na página da instância no Oracle Cloud.

### 5. Deploy Automático
Na VM, execute:

```bash
# Clone seu repositório
git clone https://github.com/VictorSalome/enviaPromo.git
cd enviaPromo

# Executa script de instalação inicial
chmod +x scripts/setup-oracle.sh
./scripts/setup-oracle.sh
```

> O `setup-oracle.sh` clona para `/home/ubuntu/jenus-api`, builda e gera o `.env`
> a partir de `.env.example`. Ele **não escreve segredos** — edite o `.env` após rodar.

### 6. Configurar .env
```bash
cd /home/ubuntu/jenus-api
cp .env.example .env
nano .env
```

Preencha os valores reais (não deixe placeholders):
```
NODE_ENV=production
PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=...        # gere com bcrypt
JWT_ACCESS_SECRET=...          # segredo forte (>=16 chars)
JWT_REFRESH_SECRET=...         # segredo forte (>=16 chars)
SESSION_SECRET=...             # segredo forte (>=32 chars)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<ID>/<TOKEN>
CHECK_INTERVAL_SECONDS=30
MIN_TIME_BETWEEN_MESSAGES=30
URGENT_ENABLED=true
DATABASE_PATH=./data/promo-monitor.db
```

### 7. Iniciar Aplicação
```bash
# Reinicia com PM2
pm2 restart promo-monitor

# Ver logs
pm2 logs
```

### 8. Acessar
- Dashboard: `http://IP_PUBLICO:3001`
- Login: `admin` / sua senha

---

## 🔧 Comandos Úteis

```bash
# Ver status
pm2 status

# Ver logs em tempo real
pm2 logs promo-monitor

# Reiniciar
pm2 restart promo-monitor

# Parar
pm2 stop promo-monitor

# Ver uso de recursos
pm2 monit

# Atualizar app (após git pull)
git pull
npm install
npm run build
pm2 restart promo-monitor
```

---

## 🔄 Atualizar Aplicação

```bash
cd /home/ubuntu/jenus-api
git pull
npm install
npm run build
pm2 restart promo-monitor
```

---

## 📊 Monitoramento

```bash
# Uso de CPU/RAM
htop

# Uso de disco
df -h

# Logs do sistema
journalctl -u pm2-ubuntu
```

---

## 🛡️ Segurança (Opcional)

### Configurar Firewall (UFW)
```bash
sudo apt install ufw
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3001/tcp  # App
sudo ufw enable
```

### Configurar Nginx + SSL (Let's Encrypt)
```bash
# Instala certbot
sudo apt install certbot

# Gera certificado
sudo certbot certonly --standalone -d seu-dominio.com

# Configura Nginx (veja nginx-config.md)
sudo cp scripts/nginx.conf /etc/nginx/sites-available/promo-monitor
sudo ln -s /etc/nginx/sites-available/promo-monitor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## ✅ Verificação

Após o deploy, teste:
1. Acesse `http://IP_PUBLICO:3001`
2. Faça login
3. Verifique se o monitor pode ser iniciado
4. Teste uma mensagem no WhatsApp

---

## 🆘 Troubleshooting

### Erro: Porta 3001 já em uso
```bash
sudo lsof -i :3001
sudo kill -9 PID
```

### Erro: Permissão negada no SQLite
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/jenus-api/data
```

### Erro: Node.js não encontrado
```bash
# Verifica versão
node -v

# Se não estiver instalado
sudo apt install nodejs npm -y
```

---

**Pronto! Seu Promo Monitor está online 24/7!** 🚀
