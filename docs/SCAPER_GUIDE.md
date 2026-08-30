# 🤖 Scraper de Vagas - Documentação

## 📍 Visão Geral

Este módulo permite buscar vagas de empregos automaticamente, adaptar currículos e enviar candidaturas.

## 🎯 Fluxo Completo

```
1. Scraper → Busca vagas por API/RSS
2. Análise → Extrai dados da vaga
3. Match → Calcula compatibilidade
4. Currículo → Personaliza e gera PDF
5. Envio → Envia e-mail automaticamente
```

## 🔗 Endpoints Disponíveis

### Scraper (sem autenticação em dev)

| Método | Endpoint | Descrição | Parâmetros |
|--------|----------|-----------|------------|
| GET | `/api/curriculo/scraper/vagas` | Busca vagas gerais | `query`, `tags`, `limit` |
| GET | `/api/curriculo/scraper/tecnologia/:tech` | Por tecnologia | `tech` (React, Node.js, etc) |
| GET | `/api/curriculo/scraper/remoto` | Vagas remotas | `tecnologia`, `nivel` |
| POST | `/api/curriculo/scraper/batch` | Múltiplas tecnologias | Body: `{ tecnologias[], limit }` |
| GET | `/api/curriculo/scraper/status` | Status do serviço | - |

### Auto-Apply (requer autenticação)

| Método | Endpoint | Descrição | Autenticação |
|--------|----------|-----------|--------------|
| POST | `/api/curriculo/auto-apply` | Pipeline completo | Login obrigatório |

## 💡 Exemplos de Uso

### Buscar vagas de React
```bash
curl "http://localhost:3001/api/curriculo/scraper/vagas?query=react&tags=javascript,typescript&limit=5"
```

### Buscar vagas por tecnologia
```bash
curl "http://localhost:3001/api/curriculo/scraper/tecnologia/react%20native"
```

### Vagas remotas de Node.js
```bash
curl "http://localhost:3001/api/curriculo/scraper/remoto?tecnologia=node.js&nivel=senior"
```

### Batch (múltiplas tecnologias)
```bash
curl -X POST "http://localhost:3001/api/curriculo/scraper/batch" \
  -H "Content-Type: application/json" \
  -d '{"tecnologias":["react","nodejs","typescript"],"limit":10}'
```

### Pipeline completo (auto-apply)
```bash
curl -X POST "http://localhost:3001/api/curriculo/auto-apply" \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=..." \  # Sessão autenticada
  -d '{"query":"react senior","minScore":70,"limit":5,"autoSend":true}'
```

## 🔐 Autenticação

### API Key (para scrapers externos)
Configure em `.env`:
```env
API_KEYS=seu-token-aqui,outro-token
```

Use no header:
```
X-API-Key: seu-token-aqui
```

### Login (Web UI)
```bash
# POST /api/auth/login
{
  "username": "admin",
  "password": "sua_senha_hash_bcrypt"
}
```

## 📁 Estrutura de Arquivos

```
src/curriculos/
├── buscas/
│   ├── scraperBR.service.js    # Serviço de scraping
│   ├── feed.service.js         # Feeds de vagas (já existente)
│   ├── autoApply.service.js    # Pipeline auto-aplicar
│   └── match.service.js        # Cálculo de compatibilidade
├── scraper/
│   └── scraper.routes.js       # Rotas do scraper
├── analisar/
│   ├── vagaExtractor.service.js # Extrai dados da vaga
│   ├── curriculoPersonalizador.service.js # Personaliza currículo
│   └── analisar.controller.js  # Controllers principais
├── email/
│   └── email.service.js        # Envio de e-mails
└── pdf/
    └── pdfGenerator.service.js # Gera PDF do currículo
```

## ⚙️ Configurações

### SMTP (para envio de e-mails)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seuemail@gmail.com
SMTP_PASS=senha_de_app
EMAIL_FROM=seuemail@gmail.com
```

### Candidate Profile
`candidate-profile.json` deve conter:
```json
{
  "personalInfo": {
    "name": "Seu Nome",
    "email": "seu@email.com",
    "phone": "11999999999",
    "linkedin": "https://...",
    "github": "https://...",
    "portfolio": "https://..."
  },
  "experiences": [...],
  "education": [...],
  "skills": {...},
  "certifications": [...],
  "languages": [...]
}
```

## 🚀 Como Usar

1. **Configure o SMTP** - Edite `.env` com credenciais
2. **Configure o candidato** - Edite `candidate-profile.json`
3. **Instale dependências**: `npm install`
4. **Build**: `npm run build`
5. **Inicie**: `npm start`

Acesse `http://localhost:3001/envia-curriculo` para a interface web.