import axios from "axios";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getDb } from "../../../core/database.js";
import { logInfo, logError, logWarn } from "../shared/utils/logger.js";
import {
  carregarPerfilCandidato,
  personalizarCurriculo,
  calcularPontuacaoRelevancia,
} from "../analisar/curriculoPersonalizador.service.js";
import { gerarPdfCurriculo } from "../shared/pdf/pdfGenerator.service.js";
import { enviarCurriculoComRegistro } from "../shared/email/email.service.js";
import type {
  VagaEmailRaw,
  VagaNormalizada,
  AutomacaoState,
  AutomacaoStatus,
  AutomacaoConfig,
  AutomacaoLog,
  CandidaturaAutomacaoRow,
  SkipReason,
} from "./types.js";

class VagasEmailWorkerService {
  private state: AutomacaoState = "IDLE";
  private config: AutomacaoConfig = {
    minScore: 70,
    dailyLimit: 20,
    minDelaySeconds: 60,
    maxDelaySeconds: 120,
    windowHours: 72,
    feedUrl: "https://devagas-liard.vercel.app/vagas-email.json",
  };

  private totalVagas = 0;
  private processadas = 0;
  private enviadas = 0;
  private aguardando = 0;
  private puladas = 0;
  private falhas = 0;

  private vagaAtual: {
    jobId: string;
    title: string;
    company: string;
    email: string;
    score: number;
  } | null = null;

  private proximoEnvioTimestamp: number | null = null;
  private delayAtualSegundos: number | null = null;
  private iniciadoEm: string | null = null;
  private ultimoDisparoEm: string | null = null;
  private mensagem = "Pronto para iniciar";

  private abortController: AbortController | null = null;
  private delayPromiseResolve: (() => void) | null = null;
  private currentRunId: number | null = null;
  private currentRunUuid: string | null = null;

  constructor() {
    this.carregarConfiguracaoSalva().catch((err) => {
      logError("Erro ao carregar configuração inicial da automação:", err);
    });
  }

  private isInterrompido(): boolean {
    const s = this.state as AutomacaoState;
    return s === "STOPPING" || s === "STOPPED" || s === "IDLE" || Boolean(this.abortController?.signal.aborted);
  }

  // ── Configurações ──────────────────────────────────────────────────────────

  public async carregarConfiguracaoSalva(): Promise<AutomacaoConfig> {
    try {
      const db = await getDb();
      const row = await db.get<any>(
        "SELECT * FROM curriculo_automacao_config WHERE id = 1",
      );
      if (row) {
        this.config = {
          minScore: Number(row.min_score) || 70,
          dailyLimit: Number(row.daily_limit) || 20,
          minDelaySeconds: Number(row.min_delay_seconds) || 60,
          maxDelaySeconds: Number(row.max_delay_seconds) || 120,
          windowHours: Number(row.window_hours) || 72,
          feedUrl:
            row.feed_url ||
            "https://devagas-liard.vercel.app/vagas-email.json",
        };
      }
    } catch (err) {
      logError("Erro ao ler tabela curriculo_automacao_config:", err);
    }
    return this.config;
  }

  public async salvarConfiguracao(
    novaConfig: Partial<AutomacaoConfig>,
  ): Promise<AutomacaoConfig> {
    this.config = { ...this.config, ...novaConfig };
    try {
      const db = await getDb();
      await db.run(
        `UPDATE curriculo_automacao_config
         SET min_score = ?, daily_limit = ?, min_delay_seconds = ?, max_delay_seconds = ?, window_hours = ?, feed_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        this.config.minScore,
        this.config.dailyLimit,
        this.config.minDelaySeconds,
        this.config.maxDelaySeconds,
        this.config.windowHours,
        this.config.feedUrl,
      );
    } catch (err) {
      logError("Erro ao persistir curriculo_automacao_config:", err);
    }
    return this.config;
  }

  // ── Logs e Histórico ───────────────────────────────────────────────────────

  private async registrarLog(
    level: "info" | "warn" | "error" | "success",
    message: string,
    jobId: string | null = null,
    details: any = null,
  ): Promise<void> {
    try {
      const db = await getDb();
      await db.run(
        `INSERT INTO curriculo_automacao_logs (level, message, job_id, details_json)
         VALUES (?, ?, ?, ?)`,
        level,
        message,
        jobId,
        details ? JSON.stringify(details) : null,
      );
      if (level === "error") logError(`[Automação] ${message}`, details);
      else if (level === "warn") logWarn(`[Automação] ${message}`);
      else logInfo(`[Automação] ${message}`);
    } catch (err) {
      logError("Falha ao salvar log de automação:", err);
    }
  }

  public async obterLogs(limit = 50, offset = 0): Promise<AutomacaoLog[]> {
    const db = await getDb();
    return db.all<AutomacaoLog[]>(
      "SELECT * FROM curriculo_automacao_logs ORDER BY id DESC LIMIT ? OFFSET ?",
      limit,
      offset,
    );
  }

  public async obterCandidaturas(
    status?: string,
    limit = 50,
    offset = 0,
  ): Promise<CandidaturaAutomacaoRow[]> {
    const db = await getDb();
    if (status && status !== "ALL") {
      return db.all<CandidaturaAutomacaoRow[]>(
        "SELECT * FROM curriculo_automacao_candidaturas WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        status,
        limit,
        offset,
      );
    }
    return db.all<CandidaturaAutomacaoRow[]>(
      "SELECT * FROM curriculo_automacao_candidaturas ORDER BY id DESC LIMIT ? OFFSET ?",
      limit,
      offset,
    );
  }

  // ── Status em Tempo Real ───────────────────────────────────────────────────

  public getStatus(): AutomacaoStatus {
    let proximoEnvioEmSegundos: number | null = null;
    if (this.proximoEnvioTimestamp && this.state === "RUNNING") {
      const diff = Math.ceil((this.proximoEnvioTimestamp - Date.now()) / 1000);
      proximoEnvioEmSegundos = diff > 0 ? diff : 0;
    }

    return {
      state: this.state,
      totalVagas: this.totalVagas,
      processadas: this.processadas,
      enviadas: this.enviadas,
      aguardando: this.aguardando,
      puladas: this.puladas,
      falhas: this.falhas,
      vagaAtual: this.vagaAtual,
      proximoEnvioEmSegundos,
      delayAtualSegundos: this.delayAtualSegundos,
      iniciadoEm: this.iniciadoEm,
      ultimoDisparoEm: this.ultimoDisparoEm,
      config: this.config,
      mensagem: this.mensagem,
    };
  }

  // ── Ingestão & Normalização do Feed ────────────────────────────────────────

  public async buscarVagasDoFeed(): Promise<VagaEmailRaw[]> {
    await this.carregarConfiguracaoSalva();
    const response = await axios.get<VagaEmailRaw[]>(this.config.feedUrl, {
      timeout: 20000,
    });
    if (!Array.isArray(response.data)) {
      throw new Error("Formato inválido retornado pelo endpoint de vagas");
    }
    return response.data;
  }

  private normalizarDadosVaga(vagaRaw: VagaEmailRaw): Record<string, any> {
    return {
      titulo: vagaRaw.title || "Desenvolvedor de Software",
      empresa: vagaRaw.company || "Empresa Confidencial",
      descricao: vagaRaw.description || "",
      stackTecnologica: Array.isArray(vagaRaw.skills) ? vagaRaw.skills : [],
      requisitosObrigatorios: Array.isArray(vagaRaw.requirements)
        ? vagaRaw.requirements
        : [],
      diferenciaisDesejaveis: Array.isArray(vagaRaw.benefits)
        ? vagaRaw.benefits
        : [],
      emailContato: vagaRaw.contactEmail ? vagaRaw.contactEmail.trim() : "",
      localizacao: vagaRaw.location || "",
      salario: vagaRaw.salary || "",
      sourceUrl: vagaRaw.sourceUrl || "",
    };
  }

  // ── Contagem e Reserva Atômica de Envios nas últimas 24h ──────────────────

  private async contarEnviosUltimas24h(): Promise<number> {
    const db = await getDb();
    const row = await db.get<{ total: number }>(
      `SELECT count(*) as total
       FROM curriculo_automacao_candidaturas
       WHERE status = 'SENT' AND sent_at >= datetime('now', '-24 hours')`,
    );
    return row?.total || 0;
  }

  /**
   * Reserva atomicamente um slot diário de envio usando transação no SQLite.
   * Impede condições de corrida (race conditions) mesmo em múltiplas instâncias ou requisições concorrentes.
   */
  private async reservarSlotEnvioAtomico(
    vaga: VagaNormalizada,
    runId: number | null,
    dailyLimit: number,
  ): Promise<boolean> {
    const db = await getDb();
    try {
      await db.exec("BEGIN IMMEDIATE");

      // 1. Contar envios confirmados (SENT) + slots em processamento ativo (PROCESSING nos últimos 10 min)
      const contagem = await db.get<{ total: number }>(
        `SELECT (
          (SELECT count(*) FROM curriculo_automacao_candidaturas WHERE status = 'SENT' AND sent_at >= datetime('now', '-24 hours')) +
          (SELECT count(*) FROM curriculo_automacao_candidaturas WHERE status = 'PROCESSING' AND updated_at >= datetime('now', '-10 minutes'))
        ) as total`,
      );

      const totalOcupado = contagem?.total ?? 0;
      if (totalOcupado >= dailyLimit) {
        await db.exec("ROLLBACK");
        return false;
      }

      // 2. Transiciona a vaga para PROCESSING reservando o slot atomicamente
      await db.run(
        `INSERT INTO curriculo_automacao_candidaturas
         (job_id, contact_email, company, vaga_title, vaga_url, location, salary, score, dados_vaga_json, status, run_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(job_id) DO UPDATE SET
           status = 'PROCESSING',
           run_id = excluded.run_id,
           updated_at = CURRENT_TIMESTAMP`,
        vaga.jobId,
        vaga.contactEmail,
        vaga.company,
        vaga.title,
        vaga.sourceUrl,
        vaga.location,
        vaga.salary,
        vaga.score,
        JSON.stringify(vaga.dadosVagaFormatados),
        runId,
      );

      await db.exec("COMMIT");
      return true;
    } catch (err) {
      try {
        await db.exec("ROLLBACK");
      } catch {}
      logError("Erro na reserva atômica de slot de envio:", err);
      return false;
    }
  }

  // ── Modo Preview Completo ──────────────────────────────────────────────────

  public async gerarPreview(
    configOverride?: Partial<AutomacaoConfig>,
  ): Promise<{
    totalNoFeed: number;
    elegiveis: VagaNormalizada[];
    puladas: VagaNormalizada[];
    enviosUltimas24h: number;
    limiteDiarioRestante: number;
    config: AutomacaoConfig;
  }> {
    const cfg: AutomacaoConfig = { ...this.config, ...configOverride };
    const vagasRaw = await this.buscarVagasDoFeed();
    const perfil = await carregarPerfilCandidato();
    const db = await getDb();

    const enviosUltimas24h = await this.contarEnviosUltimas24h();
    const limiteDiarioRestante = Math.max(0, cfg.dailyLimit - enviosUltimas24h);

    // Reconciliação defensiva de status 'PROCESSING' órfãos (ex: queda do processo no meio do envio)
    try {
      await db.run(`
        UPDATE curriculo_automacao_candidaturas
        SET status = 'FAILED',
            error_message = 'Interrompido por reinicialização do processo antes da confirmação',
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'PROCESSING' AND envio_id IS NULL
      `);
      await db.run(`
        UPDATE curriculo_automacao_candidaturas
        SET status = (SELECT status FROM curriculo_envios WHERE curriculo_envios.id = curriculo_automacao_candidaturas.envio_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'PROCESSING' AND envio_id IS NOT NULL
      `);
    } catch (recErr) {
      logWarn("Falha menor na reconciliação de status PROCESSING:", recErr);
    }

    // 1. Carregar histórico existente de job_ids e emails
    const candidaturasSalvas = await db.all<
      Array<{
        job_id: string;
        contact_email: string;
        status: string;
        sent_at: string | null;
      }>
    >("SELECT job_id, contact_email, status, sent_at FROM curriculo_automacao_candidaturas");

    const jobIdsSent = new Set<string>();
    const jobIdsHistory = new Map<string, string>();
    const emailsRecentementeEnviados = new Set<string>();

    const agora = Date.now();
    const windowMs = cfg.windowHours * 60 * 60 * 1000;

    for (const c of candidaturasSalvas) {
      jobIdsHistory.set(c.job_id, c.status);
      if (c.status === "SENT") {
        jobIdsSent.add(c.job_id);
        if (c.sent_at) {
          const sentTime = new Date(c.sent_at).getTime();
          if (agora - sentTime < windowMs) {
            emailsRecentementeEnviados.add(c.contact_email.toLowerCase());
          }
        }
      }
    }

    // Também verificar envios gerais da tabela curriculo_envios
    const enviosGerais = await db.all<
      Array<{ email_destino: string; created_at: string }>
    >(
      "SELECT email_destino, created_at FROM curriculo_envios WHERE status = 'SENT'",
    );
    for (const eg of enviosGerais) {
      if (eg.email_destino && eg.created_at) {
        const sentTime = new Date(eg.created_at).getTime();
        if (agora - sentTime < windowMs) {
          emailsRecentementeEnviados.add(eg.email_destino.toLowerCase().trim());
        }
      }
    }

    // 2. Normalizar e calcular score inicial de cada vaga
    const todasNormalizadas: VagaNormalizada[] = [];

    for (const vaga of vagasRaw) {
      const contactEmail = (vaga.contactEmail || "").trim().toLowerCase();
      const dadosVagaFormatados = this.normalizarDadosVaga(vaga);
      const score = calcularPontuacaoRelevancia(perfil, dadosVagaFormatados);

      const vagaNorm: VagaNormalizada = {
        jobId: vaga.id,
        title: vaga.title || "Vaga sem título",
        company: vaga.company || "Confidencial",
        contactEmail,
        location: vaga.location || "",
        salary: vaga.salary || "",
        sourceUrl: vaga.sourceUrl || "",
        description: vaga.description || "",
        requirements: Array.isArray(vaga.requirements) ? vaga.requirements : [],
        skills: Array.isArray(vaga.skills) ? vaga.skills : [],
        postedAt: vaga.postedAt || "",
        score,
        matchedSkills: [],
        missingSkills: [],
        eligible: false,
        status: "PENDING",
        dadosVagaFormatados,
      };

      // Validação básica de dados
      if (!contactEmail || !contactEmail.includes("@") || !vaga.title) {
        vagaNorm.status = "SKIPPED";
        vagaNorm.skipReason = "INVALID_DATA";
        todasNormalizadas.push(vagaNorm);
        continue;
      }

      // Já enviada anteriormente por este job_id
      if (jobIdsSent.has(vaga.id)) {
        vagaNorm.status = "SKIPPED";
        vagaNorm.skipReason = "ALREADY_SENT";
        todasNormalizadas.push(vagaNorm);
        continue;
      }

      // Já recebeu email nas últimas 72h
      if (emailsRecentementeEnviados.has(contactEmail)) {
        vagaNorm.status = "SKIPPED";
        vagaNorm.skipReason = "DUPLICATE_COMPANY_EMAIL_72H";
        todasNormalizadas.push(vagaNorm);
        continue;
      }

      // Score abaixo do corte
      if (score < cfg.minScore) {
        vagaNorm.status = "SKIPPED";
        vagaNorm.skipReason = "LOW_SCORE";
        todasNormalizadas.push(vagaNorm);
        continue;
      }

      // Passou pelos filtros preliminares
      vagaNorm.status = "PENDING";
      todasNormalizadas.push(vagaNorm);
    }

    // 3. Agrupar por contact_email para selecionar APENAS A MELHOR OPORTUNIDADE por empresa
    const vagasPorEmail = new Map<string, VagaNormalizada[]>();
    for (const v of todasNormalizadas) {
      if (v.status === "PENDING") {
        const emailKey = v.contactEmail;
        const lista = vagasPorEmail.get(emailKey) || [];
        lista.push(v);
        vagasPorEmail.set(emailKey, lista);
      }
    }

    // Para cada e-mail com múltiplas vagas, seleciona a de maior score
    for (const [_email, grupo] of vagasPorEmail.entries()) {
      if (grupo.length > 1) {
        grupo.sort((a, b) => b.score - a.score);
        const melhor = grupo[0];
        melhor.eligible = true;

        for (let i = 1; i < grupo.length; i++) {
          grupo[i].status = "SKIPPED";
          grupo[i].skipReason = "DUPLICATE_COMPANY_LOWER_SCORE";
        }
      } else if (grupo.length === 1) {
        grupo[0].eligible = true;
      }
    }

    // Ordenar as elegíveis por maior score
    const elegiveis = todasNormalizadas
      .filter((v) => v.eligible && v.status === "PENDING")
      .sort((a, b) => b.score - a.score);

    const puladas = todasNormalizadas.filter((v) => v.status === "SKIPPED");

    return {
      totalNoFeed: vagasRaw.length,
      elegiveis,
      puladas,
      enviosUltimas24h,
      limiteDiarioRestante,
      config: cfg,
    };
  }

  // ── Geração de Preview Individual de Currículo ─────────────────────────────

  public async gerarPreviewCurriculoVaga(jobId: string): Promise<any> {
    const vagasRaw = await this.buscarVagasDoFeed();
    const vaga = vagasRaw.find((v) => v.id === jobId);
    if (!vaga) throw new Error("Vaga não encontrada no feed");

    const dadosVagaFormatados = this.normalizarDadosVaga(vaga);
    const curriculo = await personalizarCurriculo(dadosVagaFormatados);

    // Persiste o snapshot no banco para garantir que o preview é exatamente o que será enviado
    try {
      const db = await getDb();
      await db.run(
        `UPDATE curriculo_automacao_candidaturas
         SET curriculo_snapshot_json = ?
         WHERE job_id = ?`,
        JSON.stringify(curriculo),
        jobId,
      );
    } catch {}

    return curriculo;
  }

  private async finalizarRun(
    status: AutomacaoState,
    stopReason?: string,
  ): Promise<void> {
    if (!this.currentRunId) return;
    try {
      const db = await getDb();
      await db.run(
        `UPDATE curriculo_automacao_runs
         SET status = ?,
             total_enviadas = ?,
             total_puladas = ?,
             total_falhas = ?,
             finished_at = CURRENT_TIMESTAMP,
             stop_reason = ?
         WHERE id = ?`,
        status,
        this.enviadas,
        this.puladas,
        this.falhas,
        stopReason || null,
        this.currentRunId,
      );
    } catch (err) {
      logError("Erro ao finalizar curriculo_automacao_runs:", err);
    }
  }

  // ── Métodos de Controle do Worker (Start / Pause / Resume / Stop) ──────────

  public async iniciar(configCustom?: Partial<AutomacaoConfig>): Promise<AutomacaoStatus> {
    if (this.state === "RUNNING" || this.state === "STOPPING") {
      throw new Error(
        "Uma automação já está em execução no servidor. Pause ou pare antes de iniciar outra.",
      );
    }

    // Trava síncrona imediata contra concorrência
    this.state = "RUNNING";

    try {
      if (configCustom) {
        await this.salvarConfiguracao(configCustom);
      } else {
        await this.carregarConfiguracaoSalva();
      }

      // Proteção atômica do limite diário antes de iniciar
      const enviosUltimas24h = await this.contarEnviosUltimas24h();
      if (enviosUltimas24h >= this.config.dailyLimit) {
        throw new Error(
          `Limite diário de ${this.config.dailyLimit} candidaturas já foi atingido nas últimas 24h.`,
        );
      }

      const runUuid = crypto.randomUUID();
      this.currentRunUuid = runUuid;

      const db = await getDb();
      const runInsert = await db.run(
        `INSERT INTO curriculo_automacao_runs
         (run_uuid, status, min_score, daily_limit, min_delay_seconds, max_delay_seconds, window_hours, config_snapshot_json)
         VALUES (?, 'RUNNING', ?, ?, ?, ?, ?, ?)`,
        runUuid,
        this.config.minScore,
        this.config.dailyLimit,
        this.config.minDelaySeconds,
        this.config.maxDelaySeconds,
        this.config.windowHours,
        JSON.stringify(this.config),
      );
      this.currentRunId = runInsert.lastID as number;

      this.iniciadoEm = new Date().toISOString();
      this.processadas = 0;
      this.enviadas = 0;
      this.puladas = 0;
      this.falhas = 0;
      this.mensagem = "Iniciando análise de vagas...";
      this.abortController = new AbortController();

      await this.registrarLog(
        "info",
        `[Run #${this.currentRunId}] Iniciando ciclo com snapshot: MinScore=${this.config.minScore}%, Limite=${this.config.dailyLimit}/dia, Delay=${this.config.minDelaySeconds}s-${this.config.maxDelaySeconds}s`,
      );

      // Dispara execução em background
      this.executarCiclo().catch(async (err) => {
        this.state = "FAILED";
        this.mensagem = `Erro fatal no worker: ${err?.message || err}`;
        await this.finalizarRun("FAILED", this.mensagem);
        await this.registrarLog("error", this.mensagem, null, {
          stack: err?.stack,
        });
      });

      return this.getStatus();
    } catch (err) {
      this.state = "IDLE";
      throw err;
    }
  }

  public pausar(): AutomacaoStatus {
    if (this.state === "RUNNING") {
      this.state = "PAUSED";
      this.mensagem = "Automação pausada pelo usuário";
      if (this.delayPromiseResolve) {
        this.delayPromiseResolve();
      }
      if (this.currentRunId) {
        getDb().then((db) => {
          db.run(
            "UPDATE curriculo_automacao_runs SET status = 'PAUSED' WHERE id = ?",
            this.currentRunId,
          );
        });
      }
      this.registrarLog("warn", "Automação pausada pelo usuário");
    }
    return this.getStatus();
  }

  public retomar(): AutomacaoStatus {
    if (this.state === "PAUSED") {
      this.state = "RUNNING";
      this.mensagem = "Automação retomada pelo usuário";
      if (this.delayPromiseResolve) {
        this.delayPromiseResolve();
      }
      if (this.currentRunId) {
        getDb().then((db) => {
          db.run(
            "UPDATE curriculo_automacao_runs SET status = 'RUNNING' WHERE id = ?",
            this.currentRunId,
          );
        });
      }
      this.registrarLog("info", "Automação retomada pelo usuário");
    }
    return this.getStatus();
  }

  public async parar(motivo = "Cancelado pelo usuário"): Promise<AutomacaoStatus> {
    if (this.state === "RUNNING" || this.state === "PAUSED") {
      this.state = "STOPPING";
      this.mensagem = "Parando worker imediatamente...";
      if (this.abortController) {
        this.abortController.abort();
      }
      if (this.delayPromiseResolve) {
        this.delayPromiseResolve();
      }
      this.state = "IDLE";
      this.mensagem = "Automação cancelada pelo usuário";
      this.proximoEnvioTimestamp = null;
      this.delayAtualSegundos = null;
      await this.finalizarRun("STOPPED", motivo);
      await this.registrarLog("warn", `Automação parada: ${motivo}`);
    }
    return this.getStatus();
  }

  // ── Delay Seguro com Jitter e Cancelamento Atômico ─────────────────────────

  private async aguardarDelay(segundos: number): Promise<boolean> {
    this.delayAtualSegundos = segundos;
    this.proximoEnvioTimestamp = Date.now() + segundos * 1000;

    let tempoRestante = segundos;
    while (tempoRestante > 0) {
      if (this.isInterrompido()) {
        this.delayAtualSegundos = null;
        this.proximoEnvioTimestamp = null;
        return false;
      }
      while ((this.state as AutomacaoState) === "PAUSED") {
        await new Promise<void>((resolve) => {
          this.delayPromiseResolve = resolve;
          setTimeout(resolve, 1000);
        });
        if (this.isInterrompido()) {
          this.delayAtualSegundos = null;
          this.proximoEnvioTimestamp = null;
          return false;
        }
      }

      await new Promise<void>((resolve) => {
        this.delayPromiseResolve = resolve;
        setTimeout(resolve, 1000);
      });
      tempoRestante--;
    }

    this.delayAtualSegundos = null;
    this.proximoEnvioTimestamp = null;
    return true;
  }

  private calcularDelayAleatorio(): number {
    const min = Math.max(10, this.config.minDelaySeconds);
    const max = Math.max(min, this.config.maxDelaySeconds);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // ── Ciclo Principal de Execução ────────────────────────────────────────────

  private async executarCiclo(): Promise<void> {
    const db = await getDb();
    const preview = await this.gerarPreview();

    this.totalVagas = preview.elegiveis.length + preview.puladas.length;
    this.aguardando = preview.elegiveis.length;
    this.puladas = preview.puladas.length;

    // 1. Salvar registros das puladas no banco para manter histórico limpo
    for (const p of preview.puladas) {
      try {
        await db.run(
          `INSERT INTO curriculo_automacao_candidaturas
           (job_id, contact_email, company, vaga_title, vaga_url, location, salary, score, dados_vaga_json, status, skip_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SKIPPED', ?)
           ON CONFLICT(job_id) DO UPDATE SET
             score = excluded.score,
             skip_reason = excluded.skip_reason,
             updated_at = CURRENT_TIMESTAMP`,
          p.jobId,
          p.contactEmail,
          p.company,
          p.title,
          p.sourceUrl,
          p.location,
          p.salary,
          p.score,
          JSON.stringify(p.dadosVagaFormatados),
          p.skipReason || "SKIPPED",
        );
      } catch (err) {
        // Ignora erro de inserção de puladas
      }
    }

    await this.registrarLog(
      "info",
      `Feed analisado: ${preview.totalNoFeed} vagas no total. ${preview.elegiveis.length} vagas elegíveis (score >= ${this.config.minScore}%) e ${preview.puladas.length} puladas. Limite diário disponível: ${preview.limiteDiarioRestante}.`,
    );

    if (this.currentRunId) {
      await db.run(
        `UPDATE curriculo_automacao_runs
         SET total_feed = ?, total_elegiveis = ?, total_puladas = ?
         WHERE id = ?`,
        preview.totalNoFeed,
        preview.elegiveis.length,
        preview.puladas.length,
        this.currentRunId,
      );
    }

    if (preview.elegiveis.length === 0) {
      this.state = "COMPLETED";
      this.mensagem = "Nenhuma vaga elegível para envio neste momento.";
      await this.finalizarRun("COMPLETED", this.mensagem);
      await this.registrarLog("info", this.mensagem);
      return;
    }

    // 2. Loop de processamento das vagas elegíveis
    for (let i = 0; i < preview.elegiveis.length; i++) {
      if (
        this.state === "STOPPING" ||
        this.state === "IDLE" ||
        this.abortController?.signal.aborted
      ) {
        await this.registrarLog("warn", "Ciclo interrompido imediatamente por comando de parada.");
        break;
      }

      // Pausa solicitada
      while ((this.state as AutomacaoState) === "PAUSED") {
        await new Promise((r) => setTimeout(r, 1000));
        if (this.isInterrompido()) break;
      }

      // Checagem atômica do limite diário antes de cada envio
      const enviosUltimas24h = await this.contarEnviosUltimas24h();
      if (enviosUltimas24h >= this.config.dailyLimit) {
        this.state = "COMPLETED";
        this.mensagem = `Limite diário de ${this.config.dailyLimit} envios atingido.`;
        await this.finalizarRun("COMPLETED", this.mensagem);
        await this.registrarLog("warn", this.mensagem);
        break;
      }

      const vaga = preview.elegiveis[i];
      this.vagaAtual = {
        jobId: vaga.jobId,
        title: vaga.title,
        company: vaga.company,
        email: vaga.contactEmail,
        score: vaga.score,
      };

      this.processadas++;
      this.aguardando = Math.max(0, preview.elegiveis.length - this.processadas);
      this.mensagem = `Processando: ${vaga.title} na empresa ${vaga.company}`;

      // A. Reserva atômica de slot no banco (trava imediata contra concorrência e race condition)
      const slotReservado = await this.reservarSlotEnvioAtomico(
        vaga,
        this.currentRunId,
        this.config.dailyLimit,
      );

      if (!slotReservado) {
        this.state = "COMPLETED";
        this.mensagem = `Limite diário de ${this.config.dailyLimit} envios atingido (reserva atômica de slot esgotada).`;
        await this.finalizarRun("COMPLETED", this.mensagem);
        await this.registrarLog("warn", this.mensagem);
        break;
      }

      // B. Gerar Currículo e Enviar (usando snapshot se já existir)
      let pdfPath: string | null = null;
      try {
        if (this.isInterrompido()) {
          await this.registrarLog("warn", "Parada solicitada antes de personalizar currículo.", vaga.jobId);
          break;
        }

        let curriculoPersonalizado: any = null;
        const candExistente = await db.get<any>(
          "SELECT curriculo_snapshot_json FROM curriculo_automacao_candidaturas WHERE job_id = ?",
          vaga.jobId,
        );

        if (candExistente?.curriculo_snapshot_json) {
          try {
            curriculoPersonalizado = JSON.parse(candExistente.curriculo_snapshot_json);
          } catch {}
        }

        if (!curriculoPersonalizado) {
          curriculoPersonalizado = await personalizarCurriculo(vaga.dadosVagaFormatados);
          await db.run(
            `UPDATE curriculo_automacao_candidaturas
             SET curriculo_snapshot_json = ?
             WHERE job_id = ?`,
            JSON.stringify(curriculoPersonalizado),
            vaga.jobId,
          );
        }

        await this.registrarLog(
          "info",
          `Gerando PDF com currículo calibrado para ${vaga.title} @ ${vaga.company} (Score: ${vaga.score}%)`,
          vaga.jobId,
        );

        pdfPath = await gerarPdfCurriculo(
          curriculoPersonalizado,
          vaga.dadosVagaFormatados,
        );

        if (!pdfPath) {
          throw new Error("Falha ao gerar o PDF do currículo.");
        }

        // Verificação crítica antes do disparo de e-mail irreversível
        if (this.isInterrompido()) {
          if (pdfPath) {
            try { await fs.unlink(pdfPath); } catch {}
          }
          await this.registrarLog(
            "warn",
            `Envio cancelado no último segundo antes do disparo para ${vaga.contactEmail} devido a comando de parada.`,
            vaga.jobId,
          );
          break;
        }

        const perfil = await carregarPerfilCandidato();
        const destinoFinal = (this.config.overrideEmail || vaga.contactEmail).trim();

        if (this.config.overrideEmail) {
          await this.registrarLog(
            "info",
            `[TESTE CONTROLADO] Redirecionando envio da vaga "${vaga.title}" para ${destinoFinal} (email original: ${vaga.contactEmail})`,
            vaga.jobId,
          );
        }

        // Envio oficial com registro atômico
        const resultadoEnvio = await enviarCurriculoComRegistro({
          emailDestino: destinoFinal,
          caminhoArquivoPdf: pdfPath,
          dadosVaga: vaga.dadosVagaFormatados,
          candidato: perfil.personalInfo,
          score: vaga.score,
        });

        // Limpeza do arquivo PDF temporário
        try {
          await fs.unlink(pdfPath);
          pdfPath = null;
        } catch {}

        // Atualizar status para SENT
        await db.run(
          `UPDATE curriculo_automacao_candidaturas
           SET status = 'SENT',
               envio_id = ?,
               sent_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE job_id = ?`,
          resultadoEnvio.envioId,
          vaga.jobId,
        );

        this.enviadas++;
        this.ultimoDisparoEm = new Date().toISOString();

        if (this.currentRunId) {
          await db.run(
            "UPDATE curriculo_automacao_runs SET total_enviadas = ? WHERE id = ?",
            this.enviadas,
            this.currentRunId,
          );
        }

        await this.registrarLog(
          "success",
          `✅ Candidatura enviada com sucesso para ${vaga.contactEmail} (${vaga.title} - ${vaga.company})`,
          vaga.jobId,
          { envioId: resultadoEnvio.envioId, messageId: resultadoEnvio.messageId },
        );
      } catch (err: any) {
        this.falhas++;
        const errMsg = err?.message || String(err);
        await db.run(
          `UPDATE curriculo_automacao_candidaturas
           SET status = 'FAILED',
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE job_id = ?`,
          errMsg,
          vaga.jobId,
        );

        if (this.currentRunId) {
          await db.run(
            "UPDATE curriculo_automacao_runs SET total_falhas = ? WHERE id = ?",
            this.falhas,
            this.currentRunId,
          );
        }

        await this.registrarLog(
          "error",
          `❌ Falha ao enviar candidatura para ${vaga.title} (${vaga.contactEmail}): ${errMsg}`,
          vaga.jobId,
        );

        if (pdfPath) {
          try {
            await fs.unlink(pdfPath);
          } catch {}
        }
      }

      // C. Delay randômico com jitter antes da próxima vaga (se ainda houver vagas)
      if (i < preview.elegiveis.length - 1) {
        const delaySegundos = this.calcularDelayAleatorio();
        await db.run(
          `UPDATE curriculo_automacao_candidaturas
           SET delay_applied_seconds = ?
           WHERE job_id = ?`,
          delaySegundos,
          vaga.jobId,
        );

        this.mensagem = `Aguardando intervalo seguro de ${delaySegundos}s antes do próximo envio...`;
        await this.registrarLog(
          "info",
          `Aguardando ${delaySegundos}s (jitter anti-bloqueio) antes do próximo envio.`,
        );

        const continuou = await this.aguardarDelay(delaySegundos);
        if (!continuou) {
          break;
        }
      }
    }

    if (this.state === "RUNNING") {
      this.state = "COMPLETED";
      this.vagaAtual = null;
      this.mensagem = `Ciclo concluído. Enviadas: ${this.enviadas}, Falhas: ${this.falhas}, Puladas: ${this.puladas}.`;
      await this.finalizarRun("COMPLETED");
      await this.registrarLog("success", this.mensagem);
    } else if (this.state === "STOPPING" || this.state === "IDLE") {
      await this.finalizarRun("STOPPED", "Interrompido pelo usuário");
    }
  }
}

export const vagasEmailWorker = new VagasEmailWorkerService();
