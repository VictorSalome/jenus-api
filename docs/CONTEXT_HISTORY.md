# Currículo MVP - Contexto e Histórico de Implementação

> **Data de início:** 2026-08-22  
> **Objetivo:** MVP simples, funcional e confiável — sem overengineering  
> **Validação:** Manual ponta a ponta  
> **Testes automatizados:** Fora de escopo nesta fase

---

## 🎯 OBJETIVO DO PROJETO

Criar um módulo de currículo que permita:
1. **Colar descrição de vaga** → Parser nativo extrai dados estruturados
2. **Salvar vaga** no SQLite
3. **Calcular compatibilidade** com perfil do candidato (skills match)
4. **Gerar currículo** direcionado (PDF)
5. **Enviar por e-mail** com registro atômico (PENDING → SENT/FAILED)
6. **Contar envios** realizados (status = SENT)

---

## 📋 PLANO APROVADO - FASES

### FASE 1 — Banco de Dados & Migrations Automáticas ✅ CONCLUÍDA
- Tabela `schema_migrations` (controle de migrations)
- Migration `001_initial` → `profile_skills`
- Migration `002_vagas` → `vagas`
- Migration `003_envios` → `envios`
- `runMigrations()` implementado em `src/core/database.ts`
- Integrado no `initDb()` (startup automático)
- Build passando

**Arquivos criados/modificados:**
- `src/core/migrations/index.ts` (novo)
- `src/core/database.ts` (modificado - adicionado runMigrations)

---

### FASE 2 — Parser Nativo de Vaga ✅ CONCLUÍDA
- Parser 100% nativo (regex + heurísticas, sem IA)
- Extrai: título, empresa, senioridade, skills, requirements, responsibilities
- Preserva `rawDescription` original
- Retorna `null` quando não identificado com confiança

**Arquivo criado:**
- `src/curriculos/analisar/vagaParser.js`

---

### FASE 3 — Integração Parser → Controller ✅ CONCLUÍDA
- Parser integrado no `gerarCurriculoController`
- Vaga parseada persistida na tabela `vagas` (retorna `vaga_id`)
- Fallback para extractor original se parser falhar
- Response inclui `vagaId` para uso posterior

**Arquivo modificado:**
- `src/curriculos/analisar/analisar.controller.js`

---

### FASE 4 — Perfil Candidato → SQLite ✅ CONCLUÍDA
- Substituída leitura de `candidate-profile.json` por `getDb()` em 5 arquivos:
  - `src/curriculos/analisar/analisar.controller.js` ✅
  - `src/curriculos/analisar/curriculoPersonalizador.service.js` ✅
  - `src/curriculos/analisar/resumoProfissional.service.js` ✅
  - `src/curriculos/buscas/match.service.js` ✅
  - `src/curriculos/buscas/autoApply.service.js` ✅
- Rota `PATCH /api/curriculo/profile/skills` criada em `src/curriculos/perfil/perfil.routes.js`
- Seed inicial executado: 27 skills populadas na tabela `profile_skills`
- Build passando

---

### FASE 5 — Compatibilidade (Sob Demanda) ✅ CONCLUÍDA
- Serviço `src/curriculos/compatibilidade.service.js` com `getCompatibilidade(vagaId)` e `listarVagasComCompatibilidade()`
- Rota `GET /api/curriculo/vagas/:id/compatibilidade` em `src/curriculos/compatibilidade.routes.js`
- Retorna: `matchPercent`, `matchedSkills`, `missingSkills`, `requiredMissingSkills`, `optionalMissingSkills`, `summary`
- Listagem de vagas com compatibilidade: `GET /api/curriculo/vagas`
- Build passando

---

### FASE 6 — Envio Atômico (PENDING → SENT/FAILED) ⏳ PENDENTE
- Modificar `email.service.js`
- `BEGIN TRANSACTION` → `INSERT INTO envios (status='PENDING')` → `COMMIT`
- Tentar envio → Sucesso: `UPDATE status='SENT'` / Falha: `UPDATE status='FAILED'`
- Contagem: `SELECT COUNT(*) FROM envios WHERE status='SENT'`

---

### FASE 7 — Teste de E-mail (Backend Validation) ⏳ PENDENTE
- Rota `POST /api/curriculo/email-test { to, subject, body }`
- Validação no backend (não apenas frontend)
- Feature flag: `ENABLE_EMAIL_TEST`

---

### FASE 8 — Frontend MVP ⏳ PENDENTE
- Hooks em `src/lib/curriculo.ts`:
  - `useImportarVaga`, `useVagas`, `useCompatibilidade`, `useProfileSkills`, `useEnvioCount`, `useEmailTeste`
- `index.tsx`: Botão "Colar vaga" → modal → dados parseados editáveis → salvar
- `preview.tsx`: Compatibilidade + contador "Vagas enviadas" + botão teste e-mail
- Tela de perfil: editar skills

---

### FASE 9 — Validação Manual Ponta a Ponta ⏳ PENDENTE
- `pnpm dev` → backend sobe + migrations aplicadas
- Colar vaga real → parser identifica título/empresa/skills
- Revisar/editar → salvar vaga
- Ver compatibilidade → % + gaps
- Gerar currículo → preview OK
- Enviar → status SENT no DB
- Contador incrementa
- Teste de e-mail funcional
- Reiniciar backend → migrations não duplicam → dados persistem

---

## 🛑 REGRAS DE IMPLEMENTAÇÃO (Anti-Overengineering)

> Se durante a implementação surgir criação de:
> - Vários services desnecessários
> - Repositories para cada tabela
> - DTOs para tudo
> - Interfaces abstratas extensas
> - Factory patterns
> - Camada de domínio enorme
> - Sistema complexo de migrations
> - Filas/workers
> - Redis
> - Novas dependências sem necessidade
>
> **PARAR** e lembrar: *"Estamos implementando um MVP simples. Não adicione abstrações ou infraestrutura que não sejam necessárias para o fluxo atual."*

---

## 📁 ESTRUTURA DE ARQUIVOS RELEVANTES

### Backend (jenus-api)
```
src/
├── core/
│   ├── database.ts           # getDb, initDb, runMigrations
│   └── migrations/index.ts   # migrations definitions
├── curriculos/
│   ├── analisar/
│   │   ├── analisar.controller.js        # gerar/enviar curriculo
│   │   ├── vagaParser.js                 # parser nativo (NOVO)
│   │   ├── vagaExtractor.service.js      # extractor original
│   │   ├── curriculoPersonalizador.service.js
│   │   └── resumoProfissional.service.js
│   ├── buscas/
│   │   ├── match.service.js              # compatibilidade
│   │   └── autoApply.service.js
│   ├── email/
│   │   └── email.service.js              # envio + registro atômico
│   ├── perfil/
│   │   └── perfil.routes.js              # PATCH /profile/skills (PENDENTE)
│   ├── pdf/
│   │   └── pdfGenerator.service.js
│   └── server.js                         # router principal
```

### Frontend (jenus-hub)
```
src/
├── app/(curriculo)/
│   ├── index.tsx              # formulário + importar vaga
│   ├── preview.tsx            # preview + compatibilidade + envio
│   ├── history.tsx            # histórico
│   └── success.tsx            # sucesso
├── lib/
│   ├── curriculo.ts           # hooks (useGerarCurriculo, useEnviarCurriculo, etc.)
│   └── curriculo-nav.ts       # navegação
└── components/
    └── curriculo-header.tsx
```

---

## 🔧 COMANDOS ÚTEIS

```bash
# Backend
cd /Volumes/Mac_Dev/aplication/jenus-api
pnpm dev              # Inicia backend com migrations automáticas
pnpm build            # Build TypeScript

# Frontend
cd /Volumes/Mac_Dev/aplication/jenus-hub
pnpm expo start       # Inicia Expo/React Native
```

---

## 📝 PRÓXIMOS PASSOS IMEDIATOS

1. **Criar rota `PATCH /api/curriculo/profile/skills`** (`src/curriculos/perfil/perfil.routes.js`)
2. **Seed inicial** - popular `profile_skills` a partir do `candidate-profile.json`
3. **Implementar FASE 5** - Compatibilidade service + rota
4. **Implementar FASE 6** - Envio atômico em `email.service.js`
5. **Implementar FASE 7** - Teste de e-mail
6. **Implementar FASE 8** - Frontend hooks + UI
7. **FASE 9** - Validação manual completa

---

## ⚙️ CONFIGURAÇÕES IMPORTANTES

- **SQLite path:** `config.DATABASE_PATH` (ex: `./data/promo-monitor.db`)
- **Temp dir:** `process.env.TEMP_DIR || "temp"` (PDFs gerados)
- **Profile skills table:** `profile_skills (category, tech)` PK compuesta
- **Vagas table:** `vagas (id, title, company, seniority, raw_description, skills_json, requirements_json)`
- **Envios table:** `envios (id, vaga_id, filename, email_destino, vaga_titulo, status, created_at)`

---

## 🐛 PROBLEMAS CONHECIDOS / OBSERVAÇÕES

- O parser atual usa lista fixa de `TECH_KEYWORDS` - pode precisar expansão
- Senioridade detectada apenas por palavras-chave simples
- Empresa extraída apenas do título (formato "TÍTULO - EMPRESA")
- `resumoProfissional.service.js` usa lazy loading assíncrono para skills - verificar se não quebra chamadas síncronas existentes
- `match.service.js` agora é assíncrono - verificar chamadores

---

## 📌 DECISÕES TÉCNICAS

| Decisão | Justificativa |
|---------|---------------|
| SQLite sem ORM | Simplicidade, já existe no projeto |
| Migrations inline | Sem dependência extra, controle total |
| Parser nativo (regex) | Requisito explícito: sem IA nesta fase |
| Perfil 1 candidato | MVP para uso pessoal, multi-user depois |
| Envio PENDING→SENT/FAILED | Atomicidade sem filas complexas |
| Sem compat_logs | Histórico não necessário agora |
| Feature flags via env | Controle simples sem infra extra |

---

*Última atualização: 2026-08-22 - Fases 1-4 concluídas (backend core)*