# Currículo MVP - Implementation Tracking

> **Objetivo:** MVP simples, funcional e confiável — sem overengineering
> **Validação:** Manual ponta a ponta
> **Testes automatizados:** Fora de escopo nesta fase

---

## 📋 FASES E TAREFAS

### FASE 1 — Banco de Dados & Migrations Automáticas
- [x] **1.1** Criar tabela `schema_migrations` (controle de migrations)
- [x] **1.2** Criar migration `001_initial` → `profile_skills`
- [x] **1.3** Criar migration `002_vagas` → `vagas`
- [x] **1.4** Criar migration `003_envios` → `envios`
- [x] **1.5** Implementar `runMigrations()` em `src/core/database.ts`
- [x] **1.6** Integrar `runMigrations()` no `initDb()` (startup automático)
- [x] **1.7** Verificar: `pnpm dev` → banco atualizado → API inicia

### FASE 2 — Parser Nativo de Vaga
- [x] **2.1** Criar `src/curriculos/analisar/vagaParser.js`
  - [x] **2.1.1** Função `parseVaga(texto)` → retorna estrutura padrão
  - [x] **2.1.2** Regex para extrair título (ex: "📢 VAGA ...")
  - [x] **2.1.3** Regex para extrair empresa (após " - " no título)
  - [x] **2.1.4** Regex para extrair senioridade (Júnior/Pleno/Sênior)
  - [x] **2.1.5** Regex/lista para extrair skills técnicas
  - [x] **2.1.6** Heurística para requirements/responsibilities
  - [x] **2.1.7** Preservar `rawDescription` original
  - [x] **2.1.8** Retornar `null` quando não identificado com confiança
- [x] **2.2** Testar parser com exemplo real (manual)

### FASE 3 — Integração Parser → Controller
- [x] **3.1** Modificar `src/curriculos/analisar/analisar.controller.js`
  - [x] **3.1.1** Importar `parseVaga`
  - [x] **3.1.2** No `gerarCurriculoController`: se `textoVaga` string → chamar parser
  - [x] **3.1.3** Persistir vaga parseada na tabela `vagas` (retorna `vaga_id`)
  - [x] **3.1.4** Passar dados estruturados para `personalizarCurriculo` → `gerarPdfCurriculo`
- [x] **3.3** Testar fluxo: POST `/gerar-curriculo` com texto cru → PDF gerado

### FASE 4 — Perfil Candidato → SQLite
- [x] **4.1** Substituir leitura de `candidate-profile.json` por `getDb()` em 5 arquivos:
  - [x] **4.1.1** `src/curriculos/analisar/analisar.controller.js` (top-level)
  - [x] **4.1.2** `src/curriculos/analisar/curriculoPersonalizador.service.js`
  - [x] **4.1.3** `src/curriculos/analisar/resumoProfissional.service.js`
  - [x] **4.1.4** `src/curriculos/buscas/match.service.js`
  - [x] **4.1.5** `src/curriculos/buscas/autoApply.service.js`
- [x] **4.2** Criar rota `PATCH /api/curriculo/profile/skills`
  - [x] **4.2.1** `src/curriculos/perfil/perfil.routes.js`
  - [x] **4.2.2** `INSERT OR REPLACE` em `profile_skills`
- [x] **4.3** Seed inicial: popular `profile_skills` a partir do JSON existente
- [x] **4.4** Testar: GET perfil via DB + PATCH adiciona skill → persiste após restart

### FASE 5 — Compatibilidade (Sob Demanda)
- [x] **5.1** Criar `src/curriculos/compatibilidade.service.js`
  - [x] **5.1.1** `getCompatibilidade(vagaId)` → compara `vaga.skills` vs `profile_skills`
  - [x] **5.1.2** Separar: `matchedSkills`, `missingSkills`, `requiredMissingSkills`, `optionalMissingSkills`
  - [x] **5.1.3** Calcular `matchPercent` simples
- [x] **5.2** Criar rota `GET /api/curriculo/vagas/:id/compatibilidade`
- [x] **5.3** Testar: colar vaga → salvar → GET compatibilidade → ver % + gaps

### FASE 6 — Envio Atômico (PENDING → SENT/FAILED)
- [ ] **6.1** Modificar `src/curriculos/email/email.service.js`
  - [ ] **6.1.1** `BEGIN TRANSACTION` → `INSERT INTO envios (status='PENDING')` → `COMMIT`
  - [ ] **6.1.2** Tentar envio via nodemailer
  - [ ] **6.1.3** Sucesso → `UPDATE envios SET status='SENT' WHERE id=?`
  - [ ] **6.1.4** Falha → `UPDATE envios SET status='FAILED' WHERE id=?`
- [ ] **6.2** Contagem: `SELECT COUNT(*) FROM envios WHERE status='SENT'`
- [ ] **6.3** Testar: enviar currículo → verificar status no DB

### FASE 7 — Teste de E-mail (Backend Validation)
- [ ] **7.1** Criar `src/curriculos/email/emailTest.routes.js`
  - [ ] **7.1.1** `POST /api/curriculo/email-test { to, subject, body }`
  - [ ] **7.1.2** Validação no backend (não apenas frontend)
- [ ] **7.2** Feature flag backend: `ENABLE_EMAIL_TEST` (env)
- [ ] **7.3** Testar: chamar endpoint → e-mail de teste chega

### FASE 8 — Frontend MVP
- [ ] **8.1** Adicionar hooks em `src/lib/curriculo.ts`
  - [ ] **8.1.1** `useImportarVaga` → POST `/analisar-vaga` (parser)
  - [ ] **8.1.2** `useVagas` → GET `/listar-vagas`
  - [ ] **8.1.3** `useCompatibilidade` → GET `/compatibilidade/:id`
  - [ ] **8.1.4** `useProfileSkills` → PATCH `/profile/skills`
  - [ ] **8.1.5** `useEnvioCount` → GET `/monitor` (count SENT)
  - [ ] **8.1.6** `useEmailTeste` → POST `/email-test`
- [ ] **8.2** Modificar `src/app/(curriculo)/index.tsx`
  - [ ] **8.2.1** Botão "Colar vaga" → modal textarea
  - [ ] **8.2.2** Chamar `useImportarVaga` → mostrar dados parseados editáveis
  - [ ] **8.2.3** Botão "Salvar vaga" → persiste + navega para compatibilidade
- [ ] **8.3** Modificar `src/app/(curriculo)/preview.tsx`
  - [ ] **8.3.1** Mostrar compatibilidade (matchPercent + gaps)
  - [ ] **8.3.2** Mostrar contador "Vagas enviadas: X" (useEnvioCount)
  - [ ] **8.3.3** Botão "Testar e-mail" (condicional via flag)
- [ ] **8.4** Tela de perfil: editar skills (useProfileSkills)

### FASE 9 — Validação Manual Ponta a Ponta
- [ ] **9.1** `pnpm dev` → backend sobe + migrations aplicadas
- [ ] **9.2** Colar vaga real no app → parser identifica título/empresa/skills
- [ ] **9.3** Revisar/editar dados → salvar vaga
- [ ] **9.4** Ver compatibilidade com perfil → % + gaps
- [ ] **9.5** Gerar currículo → preview OK
- [ ] **9.6** Enviar currículo → status SENT no DB
- [ ] **9.7** Contador "Vagas enviadas" incrementa
- [ ] **9.8** Teste de e-mail funcional
- [ ] **9.9** Reiniciar backend (`pnpm dev`) → migrations não duplicam → dados persistem
- [ ] **9.10** ✅ MVP FUNCIONAL VALIDADO

---

## 📝 LOG DE EXECUÇÃO

| Data | Fase | Tarefa | Status | Observações |
|------|------|--------|--------|-------------|
| 2026-08-22 | — | Planejamento concluído | ✅ | Plano aprovado, regras de simplicidade definidas |
| 2026-08-22 | 1 | Banco de Dados & Migrations | ✅ | Tabelas criadas, runMigrations() integrado no initDb(), build passa |
| 2026-08-22 | 2-3 | Parser Nativo + Integração Controller | ✅ | Parser criado, integrado no gerarCurriculoController, vaga persistida, build passa |
| 2026-08-22 | 4 | Perfil Candidato → SQLite | ✅ | 5 arquivos migrados, rota PATCH /profile/skills criada, seed executado (27 skills), build passa |
| 2026-08-22 | 5 | Compatibilidade | ✅ | Service + rota GET /vagas/:id/compatibilidade, matchPercent + gaps, build passa |

---

## ⚠️ REGRAS DE IMPLEMENTAÇÃO (Anti-Overengineering)

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