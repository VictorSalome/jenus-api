import axios from "axios";
import crypto from "crypto";
import fs from "fs";
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

/**
 * Identifica se um erro retornado pelo envio SMTP (ex: Gmail) é temporário / rate limit.
 * Erros 4xx, quota exceeded, busy, rate limit, etc. são transitórios e aceitam backoff.
 * Erros 5xx definitivos (550, 535, etc.) não devem entrar em backoff infinito.
 */
export function isGmailRateLimitOuErroTemporario(err: any): boolean {
  if (!err) return false;
  const code = err.responseCode || err.code;
  const numCode = typeof code === "number" ? code : parseInt(String(code), 10);

  if (!isNaN(numCode) && numCode >= 400 && numCode < 500) return true;
  if (numCode === 421 || numCode === 450 || numCode === 451 || numCode === 452) return true;

  const codeStr = String(code || "").toUpperCase();
  if (
    codeStr === "ETIMEDOUT" ||
    codeStr === "ECONNRESET" ||
    codeStr === "ECONNREFUSED" ||
    codeStr === "ESOCKET" ||
    codeStr === "EHOSTUNREACH" ||
    codeStr === "ENOTFOUND" ||
    codeStr === "EPIPE" ||
    codeStr === "421" ||
    codeStr === "450" ||
    codeStr === "451" ||
    codeStr === "452"
  ) {
    return true;
  }

  const msg = String(err.message || err.response || err.toString() || "").toLowerCase();

  // Erros permanentes típicos do SMTP (550, 551, 552, 553, 554, 535) só devem ser tratados como transitórios se o texto indicar cota/rate limit
  if (numCode === 550 || numCode === 551 || numCode === 552 || numCode === 553 || numCode === 554 || numCode === 535) {
    return (
      msg.includes("rate limit") ||
      msg.includes("rate-limit") ||
      msg.includes("quota") ||
      msg.includes("too many") ||
      msg.includes("try again") ||
      msg.includes("deferred") ||
      msg.includes("user-rate limit")
    );
  }

  return (
    msg.includes("rate limit") ||
    msg.includes("rate-limit") ||
    msg.includes("quota") ||
    msg.includes("too many") ||
    msg.includes("try again") ||
    msg.includes("deferred") ||
    msg.includes("temporarily") ||
    msg.includes("busy") ||
    msg.includes("speed limit") ||
    msg.includes("user-rate limit") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("esocket") ||
    msg.includes("421") ||
    msg.includes("450") ||
    msg.includes("451") ||
    msg.includes("452")
  );
}

class VagasEmailWorkerService {
  private state: AutomacaoState = "IDLE";
  private config: AutomacaoConfig = {
    minScore: 70,
    hourlyLimit: 30,
    dailyLimit: 150,
    minDelaySeconds: 90,
    maxDelaySeconds: 150,
    windowHours: 72,
    feedUrl: "./data/vagas-email.json",
    semIa: false,
    maxBackoffAttempts: 3,
  };

  private totalVagas = 0;
  private processadas = 0;
  private enviadas = 0;
  private enviadasNestaHora = 0;
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
  private proximaJanelaTimestamp: number | null = null;
  private delayAtualSegundos: number | null = null;
  private iniciadoEm: string | null = null;
  private ultimoDisparoEm: string | null = null;
  private mensagem = "Pronto para iniciar";
  private pauseReason: string | null = null;
  private backoffAttempt = 0;

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
        "SELECT min_score, daily_limit, min_delay_seconds, max_delay_seconds, window_hours, feed_url FROM curriculo_automacao_config WHERE id = 1",
      );
      if (row) {
        const feedUrlSalva = row.feed_url;
        const feedUrlFinal =
          feedUrlSalva && feedUrlSalva !== "https://devagas-liard.vercel.app/vagas-email.json"
            ? feedUrlSalva
            : "./data/vagas-email.json";

        this.config = {
          minScore: Number(row.min_score) || 70,
          hourlyLimit: Number(row.hourly_limit) || 30,
          dailyLimit: Number(row.daily_limit) || 150,
          minDelaySeconds: Number(row.min_delay_seconds) || 90,
          maxDelaySeconds: Number(row.max_delay_seconds) || 150,
          windowHours: Number(row.window_hours) || 72,
          feedUrl: feedUrlFinal,
          semIa: Boolean(row.sem_ia),
          maxBackoffAttempts: 3,
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
         SET min_score = ?, hourly_limit = ?, daily_limit = ?, min_delay_seconds = ?, max_delay_seconds = ?, window_hours = ?, feed_url = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        this.config.minScore,
        this.config.hourlyLimit,
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
      "SELECT id, level, message, job_id, details_json, created_at FROM curriculo_automacao_logs ORDER BY id DESC LIMIT ? OFFSET ?",
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
        "SELECT id, job_id, contact_email, company, vaga_title, vaga_url, location, salary, score, dados_vaga_json, status, skip_reason, error_message, delay_applied_seconds, envio_id, sent_at, created_at, updated_at FROM curriculo_automacao_candidaturas WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        status,
        limit,
        offset,
      );
    }
    return db.all<CandidaturaAutomacaoRow[]>(
      "SELECT id, job_id, contact_email, company, vaga_title, vaga_url, location, salary, score, dados_vaga_json, status, skip_reason, error_message, delay_applied_seconds, envio_id, sent_at, created_at, updated_at FROM curriculo_automacao_candidaturas ORDER BY id DESC LIMIT ? OFFSET ?",
      limit,
      offset,
    );
  }

  // ── Status em Tempo Real ───────────────────────────────────────────────────

  public async contarEnviosHoraAtual(): Promise<number> {
    try {
      const { getRateLimitStatus } = await import("../shared/email/rateLimit.service.js");
      const status = await getRateLimitStatus(this.config.hourlyLimit || 30);
      this.enviadasNestaHora = status.total;
    } catch {
      // Fallback
    }
    return this.enviadasNestaHora;
  }

  public async aguardarProximaJanela(hourlyLimit: number): Promise<number> {
    const { getRateLimitStatus } = await import("../shared/email/rateLimit.service.js");
    const status = await getRateLimitStatus(hourlyLimit);
    const segundosAteProximaJanela = Math.max(5, status.waitSeconds);
    return segundosAteProximaJanela;
  }

  public getStatus(): AutomacaoStatus {
    let proximoEnvioEmSegundos: number | null = null;
    if (this.proximoEnvioTimestamp && (this.state === "RUNNING" || this.proximaJanelaTimestamp)) {
      const diff = Math.ceil((this.proximoEnvioTimestamp - Date.now()) / 1000);
      proximoEnvioEmSegundos = diff > 0 ? diff : 0;
    }

    let proximaJanelaEmSegundos: number | null = null;
    if (this.proximaJanelaTimestamp) {
      const diff = Math.ceil((this.proximaJanelaTimestamp - Date.now()) / 1000);
      proximaJanelaEmSegundos = diff > 0 ? diff : 0;
    }

    return {
      state: this.state,
      totalVagas: this.totalVagas,
      processadas: this.processadas,
      enviadas: this.enviadas,
      enviadasNestaHora: this.enviadasNestaHora,
      hourlyLimit: this.config.hourlyLimit || 30,
      aguardando: this.aguardando,
      puladas: this.puladas,
      falhas: this.falhas,
      vagaAtual: this.vagaAtual,
      proximoEnvioEmSegundos,
      proximaJanelaEmSegundos,
      delayAtualSegundos: this.delayAtualSegundos,
      iniciadoEm: this.iniciadoEm,
      ultimoDisparoEm: this.ultimoDisparoEm,
      config: this.config,
      mensagem: this.mensagem,
      pauseReason: this.pauseReason,
      backoffAttempt: this.backoffAttempt > 0 ? this.backoffAttempt : undefined,
    };
  }

  // ── Ingestão & Normalização do Feed ────────────────────────────────────────

  /**
   * Lê vagas diretamente de um arquivo local JSON.
   */
  public carregarVagasArquivoLocal(caminhoOriginal: string): VagaEmailRaw[] {
    let caminhoLimpo = caminhoOriginal;
    if (caminhoLimpo.startsWith("file://")) {
      caminhoLimpo = caminhoLimpo.replace(/^file:\/\//, "");
    }

    let caminhoFinal = path.isAbsolute(caminhoLimpo)
      ? caminhoLimpo
      : path.resolve(process.cwd(), caminhoLimpo);

    if (!fs.existsSync(caminhoFinal)) {
      const caminhoAlternativo = path.resolve(process.cwd(), "jenus-api", caminhoLimpo);
      if (fs.existsSync(caminhoAlternativo)) {
        caminhoFinal = caminhoAlternativo;
      } else {
        throw new Error(`Arquivo local de vagas não encontrado: ${caminhoFinal}`);
      }
    }

    const conteudo = fs.readFileSync(caminhoFinal, "utf-8").trim();
    if (!conteudo) {
      return [];
    }

    try {
      const dados = JSON.parse(conteudo);
      if (!Array.isArray(dados)) {
        throw new Error(
          `Formato inválido no arquivo local de vagas: esperado array em ${caminhoFinal}`,
        );
      }
      return dados;
    } catch (parseErr: any) {
      throw new Error(
        `Erro ao realizar parse de ${caminhoFinal}: ${parseErr?.message || parseErr}`,
      );
    }
  }

  /**
   * Obtém as vagas do feed. Suporta caminhos de arquivos locais (relativos, absolutos ou file://)
   * e URLs remotas HTTP/HTTPS com fallback automático para o arquivo local data/vagas-email.json.
   */
  public async buscarVagasDoFeed(feedUrlOverride?: string): Promise<VagaEmailRaw[]> {
    if (!feedUrlOverride) {
      await this.carregarConfiguracaoSalva();
    }
    const feedUrl = (feedUrlOverride || this.config.feedUrl || "./data/vagas-email.json").trim();

    const isFileProtocol = feedUrl.startsWith("file://");
    const isExplicitLocalPath =
      feedUrl.startsWith("./") ||
      feedUrl.startsWith("../") ||
      path.isAbsolute(feedUrl);
    const isHttp =
      feedUrl.startsWith("http://") || feedUrl.startsWith("https://");
    const isLocalFile = isFileProtocol || isExplicitLocalPath || !isHttp;

    if (isLocalFile) {
      logInfo(`[Worker] Carregando vagas do arquivo local: ${feedUrl}`);
      return this.carregarVagasArquivoLocal(feedUrl);
    }

    // URL HTTP/HTTPS (compatibilidade) com fallback inteligente para arquivo local
    try {
      const response = await axios.get<VagaEmailRaw[]>(feedUrl, {
        timeout: 20000,
      });
      if (!Array.isArray(response.data)) {
        throw new Error("Formato inválido retornado pelo endpoint de vagas");
      }
      return response.data;
    } catch (err: any) {
      logWarn(
        `[Worker] Falha ao acessar feed remoto (${feedUrl}): ${err?.message || err}. Tentando fallback local...`,
      );

      const caminhosFallback = [
        path.resolve(process.cwd(), "data/vagas-email.json"),
        path.resolve(process.cwd(), "./data/vagas-email.json"),
        path.resolve(process.cwd(), "jenus-api/data/vagas-email.json"),
      ];

      for (const fallbackPath of caminhosFallback) {
        if (fs.existsSync(fallbackPath)) {
          try {
            const vagasLocais = this.carregarVagasArquivoLocal(fallbackPath);
            logInfo(
              `[Worker] Fallback para arquivo local bem-sucedido: ${vagasLocais.length} vagas de ${fallbackPath}`,
            );
            return vagasLocais;
          } catch (fallbackErr: any) {
            logWarn(
              `[Worker] Erro ao carregar fallback de ${fallbackPath}: ${fallbackErr?.message}`,
            );
          }
        }
      }

      throw err;
    }
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
      semIa: Boolean(this.config.semIa),
    };
  }

  // ── Contagem e Reserva Atômica de Envios ───────────────────────────────────

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
   * Reserva atomicamente um slot de envio usando transação no SQLite (BEGIN IMMEDIATE).
   * Valida simultaneamente:
   * 1. Limite horário (hourlyLimit) considerando SENT na hora + PROCESSING ativo nos últimos 10 min.
   * 2. Limite diário de segurança (dailyLimit).
   * 3. Janela de re-envio por e-mail de contato (windowHours).
   * 4. Concorrência estrita no job_id:
   *    - Vaga nova: INSERT com status 'PROCESSING'.
   *    - Vaga existente: somente transiciona para 'PROCESSING' se status NÃO for 'SENT' nem 'PROCESSING' ativo
   *      (ou se for 'PROCESSING' órfão de crash há mais de 10 minutos sem envio_id).
   *    - Se changes === 0: conflito de concorrência detectado; aborta a reserva sem re-enviar e-mail.
   */
  public async reservarSlotEnvioAtomico(
    vaga: VagaNormalizada,
    runId: number | null,
    hourlyLimit: number,
    dailyLimit: number,
  ): Promise<{
    reservado: boolean;
    motivo?: "HOURLY_LIMIT" | "DAILY_LIMIT" | "ERROR" | "CONCURRENCY_CONFLICT";
  }> {
    const { runTransaction } = await import("../../../core/database.js");
    try {
      return await runTransaction(async (db) => {
        // 1. Contar envios confirmados (SENT) na hora atual + slots em processamento ativo (PROCESSING nos últimos 10 min por outros jobs)
        const contagemHora = await db.get<{ total: number }>(
          `SELECT (
            (SELECT count(*) FROM curriculo_envios WHERE created_at >= datetime('now', '-60 minutes')) +
            (SELECT count(*) FROM curriculo_automacao_candidaturas WHERE status = 'PROCESSING' AND envio_id IS NULL AND updated_at >= datetime('now', '-10 minutes') AND job_id != ?) +
            (SELECT count(*) FROM curriculo_pending_applications WHERE status = 'approved' AND reviewed_at >= datetime('now', '-10 minutes'))
          ) as total`,
          vaga.jobId,
        );

        const totalHoraOcupado = contagemHora?.total ?? 0;
        if (hourlyLimit > 0 && totalHoraOcupado >= hourlyLimit) {
          return { reservado: false, motivo: "HOURLY_LIMIT" as const };
        }

        // 2. Checar limite diário de segurança se configurado (> 0)
        if (dailyLimit > 0) {
          const contagemDia = await db.get<{ total: number }>(
            `SELECT count(*) as total FROM curriculo_automacao_candidaturas WHERE status = 'SENT' AND sent_at >= datetime('now', '-24 hours')`,
          );
          if ((contagemDia?.total ?? 0) >= dailyLimit) {
            return { reservado: false, motivo: "DAILY_LIMIT" as const };
          }
        }

        // 3. Validação do e-mail de contato para impedir disparo duplicado no período de tolerância
        const windowHours = this.config.windowHours || 72;
        const emailConflito = await db.get<{ total: number }>(
          `SELECT (
            (SELECT count(*) FROM curriculo_automacao_candidaturas
             WHERE lower(trim(contact_email)) = lower(trim(?))
               AND (
                 (status = 'SENT' AND sent_at >= datetime('now', ?))
                 OR (status = 'PROCESSING' AND job_id != ? AND updated_at >= datetime('now', '-10 minutes'))
               )
            ) +
            (SELECT count(*) FROM curriculo_envios
             WHERE lower(trim(email_destino)) = lower(trim(?))
               AND status = 'SENT'
               AND created_at >= datetime('now', ?)
            )
          ) as total`,
          vaga.contactEmail,
          `-${windowHours} hours`,
          vaga.jobId,
          vaga.contactEmail,
          `-${windowHours} hours`,
        );

        if ((emailConflito?.total ?? 0) > 0) {
          return { reservado: false, motivo: "CONCURRENCY_CONFLICT" as const };
        }

        // 4. Transiciona a vaga para PROCESSING reservando o slot atomicamente sob transação.
        const res = await db.run(
          `INSERT INTO curriculo_automacao_candidaturas
           (job_id, contact_email, company, vaga_title, vaga_url, location, salary, score, dados_vaga_json, status, run_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROCESSING', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(job_id) DO UPDATE SET
             status = 'PROCESSING',
             run_id = excluded.run_id,
             envio_id = NULL,
             error_message = NULL,
             skip_reason = NULL,
             updated_at = CURRENT_TIMESTAMP
           WHERE (
             curriculo_automacao_candidaturas.status NOT IN ('SENT', 'PROCESSING')
             AND curriculo_automacao_candidaturas.sent_at IS NULL
           )
           OR (
             curriculo_automacao_candidaturas.status = 'PROCESSING'
             AND curriculo_automacao_candidaturas.envio_id IS NULL
             AND curriculo_automacao_candidaturas.sent_at IS NULL
             AND curriculo_automacao_candidaturas.updated_at < datetime('now', '-10 minutes')
           )`,
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

        if (!res || res.changes === 0) {
          return { reservado: false, motivo: "CONCURRENCY_CONFLICT" as const };
        }

        return { reservado: true };
      });
    } catch (err) {
      logError("Erro na reserva atômica de slot de envio:", err);
      return { reservado: false, motivo: "ERROR" };
    }
  }

  /**
   * Reconcilia registros que ficaram em 'PROCESSING' por processos que sofreram crash ou reinicialização.
   * - Se já possui envio_id: sincroniza status real com a tabela curriculo_envios.
   * - Se NÃO possui envio_id e o registro está sem atualização há mais de 10 minutos: transiciona para FAILED.
   * Preserva registros PROCESSING recentes (< 10 min) de processos ativos.
   */
  public async reconciliarProcessosOrfaos(): Promise<{ reconciliados: number }> {
    const db = await getDb();
    try {
      await db.run(`
        UPDATE curriculo_automacao_candidaturas
        SET status = CASE 
              WHEN (SELECT status FROM curriculo_envios WHERE curriculo_envios.id = curriculo_automacao_candidaturas.envio_id) = 'PENDING'
              THEN 'PROCESSING'
              ELSE COALESCE((SELECT status FROM curriculo_envios WHERE curriculo_envios.id = curriculo_automacao_candidaturas.envio_id), 'FAILED')
            END,
            sent_at = CASE
              WHEN (SELECT status FROM curriculo_envios WHERE curriculo_envios.id = curriculo_automacao_candidaturas.envio_id) = 'SENT'
              THEN COALESCE(sent_at, (SELECT created_at FROM curriculo_envios WHERE curriculo_envios.id = curriculo_automacao_candidaturas.envio_id), CURRENT_TIMESTAMP)
              ELSE sent_at
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'PROCESSING' AND envio_id IS NOT NULL
      `);

      const res = await db.run(`
        UPDATE curriculo_automacao_candidaturas
        SET status = 'FAILED',
            error_message = 'Interrompido por timeout de processamento ou reinicialização do processo',
            updated_at = CURRENT_TIMESTAMP
        WHERE status = 'PROCESSING'
          AND envio_id IS NULL
          AND updated_at < datetime('now', '-10 minutes')
      `);

      return { reconciliados: res.changes || 0 };
    } catch (recErr) {
      logWarn(`[Worker] Falha na reconciliação de status PROCESSING: ${recErr}`);
      return { reconciliados: 0 };
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
    enviosHoraAtual: number;
    limiteHorarioRestante: number;
    limiteDiarioRestante: number;
    config: AutomacaoConfig;
  }> {
    const cfg: AutomacaoConfig = { ...this.config, ...configOverride };
    const vagasRaw = await this.buscarVagasDoFeed(cfg.feedUrl);
    const perfil = await carregarPerfilCandidato();
    const db = await getDb();

    const enviosUltimas24h = await this.contarEnviosUltimas24h();
    const enviosHoraAtual = await this.contarEnviosHoraAtual();
    const limiteHorarioRestante = Math.max(0, (cfg.hourlyLimit || 30) - enviosHoraAtual);
    const limiteDiarioRestante = Math.max(0, cfg.dailyLimit - enviosUltimas24h);

    // Reconciliação defensiva de status 'PROCESSING' órfãos (crash recovery)
    await this.reconciliarProcessosOrfaos();

    // 1. Carregar histórico existente de job_ids e emails
    const candidaturasSalvas = await db.all<
      Array<{
        job_id: string;
        contact_email: string;
        status: string;
        sent_at: string | null;
        updated_at: string | null;
      }>
    >("SELECT job_id, contact_email, status, sent_at, updated_at FROM curriculo_automacao_candidaturas");

    const jobIdsSent = new Set<string>();
    const jobIdsActiveProcessing = new Set<string>();
    const jobIdsHistory = new Map<string, string>();
    const emailsRecentementeEnviados = new Set<string>();

    const agora = Date.now();
    const windowMs = cfg.windowHours * 60 * 60 * 1000;
    const dezMinMs = 10 * 60 * 1000;

    for (const c of candidaturasSalvas) {
      jobIdsHistory.set(c.job_id, c.status);
      if (c.status === "SENT") {
        jobIdsSent.add(c.job_id);
        if (c.sent_at) {
          const rawDate = c.sent_at.includes("T") ? c.sent_at : c.sent_at.replace(" ", "T") + "Z";
          const sentTime = new Date(rawDate).getTime();
          if (agora - sentTime < windowMs) {
            emailsRecentementeEnviados.add(c.contact_email.toLowerCase());
          }
        }
      } else if (c.status === "PROCESSING") {
        const rawDate = c.updated_at ? (c.updated_at.includes("T") ? c.updated_at : c.updated_at.replace(" ", "T") + "Z") : null;
        const updatedTime = rawDate ? new Date(rawDate).getTime() : 0;
        if (agora - updatedTime < dezMinMs) {
          jobIdsActiveProcessing.add(c.job_id);
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
        const rawDate = eg.created_at.includes("T") ? eg.created_at : eg.created_at.replace(" ", "T") + "Z";
        const sentTime = new Date(rawDate).getTime();
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

      // Em processamento ativo por outra instância/worker concorrente
      if (jobIdsActiveProcessing.has(vaga.id)) {
        vagaNorm.status = "SKIPPED";
        vagaNorm.skipReason = "ALREADY_PROCESSING";
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
      enviosHoraAtual,
      limiteHorarioRestante,
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

      // Proteção atômica do limite diário de segurança (se configurado) antes de iniciar
      if (this.config.dailyLimit && this.config.dailyLimit > 0) {
        const enviosUltimas24h = await this.contarEnviosUltimas24h();
        if (enviosUltimas24h >= this.config.dailyLimit) {
          throw new Error(
            `Limite diário de segurança de ${this.config.dailyLimit} candidaturas já foi atingido nas últimas 24h.`,
          );
        }
      }

      const runUuid = crypto.randomUUID();
      this.currentRunUuid = runUuid;

      const db = await getDb();
      await this.reconciliarProcessosOrfaos();

      const runInsert = await db.run(
        `INSERT INTO curriculo_automacao_runs
         (run_uuid, status, min_score, hourly_limit, daily_limit, min_delay_seconds, max_delay_seconds, window_hours, config_snapshot_json)
         VALUES (?, 'RUNNING', ?, ?, ?, ?, ?, ?, ?)`,
        runUuid,
        this.config.minScore,
        this.config.hourlyLimit || 30,
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
      this.backoffAttempt = 0;
      this.pauseReason = null;
      this.proximaJanelaTimestamp = null;
      await this.contarEnviosHoraAtual();
      this.mensagem = "Iniciando análise de vagas...";
      this.abortController = new AbortController();

      await this.registrarLog(
        "info",
        `[Run #${this.currentRunId}] Iniciando ciclo com snapshot: Meta=${this.config.hourlyLimit}/h (delay ${this.config.minDelaySeconds}s-${this.config.maxDelaySeconds}s, média ~30/h), MinScore=${this.config.minScore}%, LimiteSegurançaDia=${this.config.dailyLimit}`,
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

  public pausar(motivo: string = "MANUAL"): AutomacaoStatus {
    if (this.state === "RUNNING") {
      this.state = "PAUSED";
      this.pauseReason = motivo;
      this.mensagem =
        motivo === "RATE_LIMIT"
          ? "Automação pausada automaticamente por rate limit do Gmail."
          : "Automação pausada pelo usuário";

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
      this.registrarLog("warn", this.mensagem);
    }
    return this.getStatus();
  }

  public retomar(): AutomacaoStatus {
    if (this.state === "PAUSED") {
      this.state = "RUNNING";
      this.pauseReason = null;
      this.backoffAttempt = 0;
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
      this.pauseReason = null;
      this.proximaJanelaTimestamp = null;
      this.backoffAttempt = 0;
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
             updated_at = CURRENT_TIMESTAMP
           WHERE curriculo_automacao_candidaturas.status NOT IN ('SENT', 'PROCESSING')`,
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
    let i = 0;
    while (i < preview.elegiveis.length) {
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
      if (this.isInterrompido()) break;

      // Checagem do limite diário de segurança antes de cada envio
      const enviosUltimas24h = await this.contarEnviosUltimas24h();
      if (this.config.dailyLimit > 0 && enviosUltimas24h >= this.config.dailyLimit) {
        this.state = "COMPLETED";
        this.mensagem = `Limite diário de ${this.config.dailyLimit} envios atingido.`;
        await this.finalizarRun("COMPLETED", this.mensagem);
        await this.registrarLog("warn", this.mensagem);
        break;
      }

      // Checagem do limite horário (HOURLY_SEND_LIMIT) antes de cada envio
      const hourlyLimit = this.config.hourlyLimit || 30;
      let enviosNestaHora = await this.contarEnviosHoraAtual();
      while (enviosNestaHora >= hourlyLimit) {
        if (this.isInterrompido()) break;

        const { getRateLimitStatus } = await import("../shared/email/rateLimit.service.js");
        const statusLimit = await getRateLimitStatus(hourlyLimit);
        const segundosAteProximaHora = Math.max(5, statusLimit.waitSeconds);
        
        this.proximaJanelaTimestamp = Date.now() + segundosAteProximaHora * 1000;
        this.mensagem = `Limite horário atingido (${enviosNestaHora}/${hourlyLimit}). Aguardando próxima janela (${segundosAteProximaHora}s)...`;
        await this.registrarLog(
          "info",
          `Limite horário atingido (${enviosNestaHora}/${hourlyLimit}). Worker aguardando ${segundosAteProximaHora}s liberação da janela.`,
        );

        const continuou = await this.aguardarDelay(segundosAteProximaHora);
        this.proximaJanelaTimestamp = null;
        if (!continuou || this.isInterrompido()) {
          break;
        }

        enviosNestaHora = await this.contarEnviosHoraAtual();
        if (enviosNestaHora < hourlyLimit) {
          this.mensagem = `Nova janela horária iniciada (${enviosNestaHora}/${hourlyLimit}). Retomando envios automaticamente.`;
          await this.registrarLog("info", this.mensagem);
        }
      }

      if (this.isInterrompido()) break;

      const vaga = preview.elegiveis[i];
      this.vagaAtual = {
        jobId: vaga.jobId,
        title: vaga.title,
        company: vaga.company,
        email: vaga.contactEmail,
        score: vaga.score,
      };

      this.mensagem = `Processando: ${vaga.title} na empresa ${vaga.company}`;

      // A. Reserva atômica de slot no banco (valida simultaneamente cota horária e diária)
      const slotResultado = await this.reservarSlotEnvioAtomico(
        vaga,
        this.currentRunId,
        hourlyLimit,
        this.config.dailyLimit,
      );

      if (!slotResultado.reservado) {
        if (slotResultado.motivo === "HOURLY_LIMIT") {
          const { getRateLimitStatus } = await import("../shared/email/rateLimit.service.js");
          const statusLimit = await getRateLimitStatus(hourlyLimit);
          const segundosAteProximaHora = Math.max(5, statusLimit.waitSeconds);

          this.proximaJanelaTimestamp = Date.now() + segundosAteProximaHora * 1000;
          this.mensagem = `Limite horário atingido na reserva atômica (${hourlyLimit}/h). Aguardando próxima janela (${segundosAteProximaHora}s)...`;
          await this.registrarLog("warn", this.mensagem);
          const continuou = await this.aguardarDelay(segundosAteProximaHora);
          this.proximaJanelaTimestamp = null;
          if (!continuou || this.isInterrompido()) break;
          continue; // Tenta a mesma vaga na nova janela horária
        } else if (slotResultado.motivo === "DAILY_LIMIT") {
          this.state = "COMPLETED";
          this.mensagem = `Limite diário de ${this.config.dailyLimit} envios atingido (reserva atômica de slot esgotada).`;
          await this.finalizarRun("COMPLETED", this.mensagem);
          await this.registrarLog("warn", this.mensagem);
          break;
        } else if (slotResultado.motivo === "CONCURRENCY_CONFLICT") {
          this.puladas++;
          this.processadas++;
          this.aguardando = Math.max(0, preview.elegiveis.length - this.processadas);
          await this.registrarLog(
            "warn",
            `[Concorrência] Vaga "${vaga.title}" (${vaga.company}) ignorada: já enviada ou em processamento ativo por outra instância.`,
            vaga.jobId,
          );
          i++;
          continue;
        } else {
          this.falhas++;
          this.processadas++;
          this.aguardando = Math.max(0, preview.elegiveis.length - this.processadas);
          i++;
          continue;
        }
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
            try { await fs.promises.unlink(pdfPath); } catch {}
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
          automacaoJobId: vaga.jobId,
        });

        // Limpeza do arquivo PDF temporário
        try {
          await fs.promises.unlink(pdfPath);
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
        this.processadas++;
        this.aguardando = Math.max(0, preview.elegiveis.length - this.processadas);
        this.backoffAttempt = 0; // Resetar backoff ao ter sucesso
        this.ultimoDisparoEm = new Date().toISOString();
        await this.contarEnviosHoraAtual();

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
          if (!continuou || this.isInterrompido()) {
            break;
          }
        }

        // Sucesso: avança para a próxima vaga
        i++;
      } catch (err: any) {
        if (pdfPath) {
          try {
            await fs.promises.unlink(pdfPath);
          } catch {}
        }

        const errMsg = err?.message || String(err);
        const ehRateLimit = isGmailRateLimitOuErroTemporario(err);

        // Atualizar imediatamente para FAILED para liberar o status de PROCESSING.
        // Isso garante que a retentativa ou a reconciliação não se confundam.
        await db.run(
          `UPDATE curriculo_automacao_candidaturas
           SET status = 'FAILED',
               error_message = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE job_id = ?`,
          errMsg,
          vaga.jobId,
        );

        if (ehRateLimit) {
          this.backoffAttempt++;
          const maxAttempts = this.config.maxBackoffAttempts || 3;

          if (this.backoffAttempt > maxAttempts) {
            // Excedeu as tentativas de backoff: pausar o worker com RATE_LIMIT
            this.pausar("RATE_LIMIT");
            this.mensagem = `Worker pausado automaticamente: limite de backoff (${maxAttempts} tentativas) excedido por rate limit do Gmail.`;
            await this.registrarLog(
              "error",
              `Limite máximo de backoff (${maxAttempts} tentativas) excedido no envio para ${vaga.contactEmail}. Worker pausado automaticamente com pauseReason='RATE_LIMIT'.`,
              vaga.jobId,
              { erro: errMsg, backoffAttempt: this.backoffAttempt },
            );
            // Mantém no mesmo índice i para retentar a vaga quando o worker for retomado
            continue;
          }

          // Backoff progressivo: 1ª tentativa: 600s (10min), 2ª: 1200s (20min), 3ª: 2400s (40min)
          const backoffDelays = [600, 1200, 2400];
          const delaySegundos = backoffDelays[this.backoffAttempt - 1] || (600 * Math.pow(2, this.backoffAttempt - 1));

          this.mensagem = `Rate limit do Gmail detectado. Aplicando backoff de ${delaySegundos}s (${Math.round(delaySegundos / 60)}min) - tentativa ${this.backoffAttempt}/${maxAttempts}...`;
          await this.registrarLog(
            "warn",
            `[Gmail Rate Limit] Erro temporário no envio para ${vaga.contactEmail} (${errMsg}). Aplicando backoff de ${delaySegundos}s (${Math.round(delaySegundos / 60)}min) - tentativa ${this.backoffAttempt}/${maxAttempts}.`,
            vaga.jobId,
            { erro: errMsg, backoffAttempt: this.backoffAttempt, delaySegundos },
          );

          const continuou = await this.aguardarDelay(delaySegundos);
          if (!continuou || this.isInterrompido()) {
            break;
          }

          // Retenta a MESMA vaga (não incrementa i)
          continue;
        } else {
          // Erro permanente (550, etc.) - marcar FAILED e seguir para a próxima vaga sem backoff infinito
          this.falhas++;
          this.processadas++;
          this.aguardando = Math.max(0, preview.elegiveis.length - this.processadas);
          this.backoffAttempt = 0; // Resetar para a próxima vaga

          if (this.currentRunId) {
            await db.run(
              "UPDATE curriculo_automacao_runs SET total_falhas = ? WHERE id = ?",
              this.falhas,
              this.currentRunId,
            );
          }

          await this.registrarLog(
            "error",
            `❌ Falha permanente ao enviar candidatura para ${vaga.title} (${vaga.contactEmail}): ${errMsg}`,
            vaga.jobId,
          );

          // Segue para a próxima vaga
          i++;
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
