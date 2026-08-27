import { logInfo, logError } from "../shared/utils/logger.js";
import { httpGet } from "../shared/http.js";
import config from "../config/index.js";

/**
 * Pipeline: busca → match → gera currículo → envia email (se tiver email)
 */
export interface PipelineResult {
  buscas: Array<{ title: string; score: number }>;
  applied: Array<any>;
  skipped: Array<any>;
  erros: Array<{ title: string; error: string }>;
  stats: { pendentes: number; semEmail: number };
  resumo: {
    total: number;
    compatveis: number;
    pendentes: number;
    semEmail: number;
    erros: number;
    tempoTotal: string;
  };
}

/**
 * Pipeline de descoberta: busca vagas, calcula compatibilidade, extrai
 * email do recrutador, gera currículo adequado à vaga e deixa PRONTO
 * PARA REVISÃO em `curriculo_pending_applications` — nunca envia email
 * sozinho. O envio de fato só acontece quando alguém aprova cada
 * candidatura via `pendingApplications.service.ts::aprovarEEnviar`.
 */
export const executarPipeline = async ({
  query = "",
  tags = [],
  minScore = 60,
  limit = 10,
}: {
  query?: string;
  tags?: string[];
  minScore?: number;
  limit?: number;
} = {}): Promise<PipelineResult> => {
  const startTime = Date.now();
  const resultados: PipelineResult = {
    buscas: [],
    applied: [],
    skipped: [],
    erros: [],
    stats: { pendentes: 0, semEmail: 0 },
    resumo: {} as any,
  };

  logInfo("Iniciando pipeline de descoberta de vagas", {
    tags: tags.join(","),
    minScore,
  });

  // 1. Buscar vagas
  const { buscarVagas } = await import("./feed.service.js");
  const vagas = await buscarVagas({ query, tags, limit: Math.min(limit, 20) });
  logInfo(`Vagas brutas: ${vagas.length}`);

  // 2. Processar cada vaga
  for (const vaga of vagas) {
    try {
      const { calcularCompatibilidade } = await import("./match.service.js");
      const match = await calcularCompatibilidade(vaga);
      resultados.buscas.push({
        title: vaga.title,
        score: match.score,
      });

      if (match.score < minScore) {
        resultados.skipped.push({
          title: vaga.title,
          score: match.score,
        });
        continue;
      }

      // 3. Extrair dados da vaga
      const { extrairDadosVaga } = await import("../analisar/vagaExtractor.service.js");
      const textoVaga = `${vaga.title}\n${vaga.company}\n${vaga.description || ""}`;
      const dadosVaga = await extrairDadosVaga(textoVaga);

      // Email: prioridade → vaga._emails (LinkedIn) → extrairDadosVaga → regex no description
      const emailFinal =
        (vaga as any)._emails?.[0] ||
        dadosVaga.emailContato ||
        extrairEmailDoTexto(vaga.description || "");

      // SEM EMAIL = pula. Foco é enviar para quem tem email.
      if (!emailFinal) {
        resultados.stats.semEmail++;
        resultados.skipped.push({
          title: vaga.title,
          score: match.score,
          reason: "sem email",
        });
        logWarn(`⏭️ Pulando (sem email): ${vaga.title} @ ${vaga.company}`);
        continue;
      }

      logInfo(
        `📧 Vaga com email: ${vaga.title} | Score: ${match.score}% | Email: ${emailFinal}`,
      );

      // 4. Deixar pronto para revisão (o currículo/PDF só é gerado de fato
      // na aprovação, em pendingApplications.service.ts::aprovarEEnviar —
      // evita gastar trabalho gerando PDF de vaga que pode ser rejeitada).
      try {
        const dadosVagaCompleto = {
          titulo: vaga.title,
          empresa: vaga.company,
          descricao: vaga.description || '',
          stackTecnologica: dadosVaga.stackTecnologica || [],
          responsabilidades: dadosVaga.responsabilidades || [],
          requisitosObrigatorios: dadosVaga.requisitosObrigatorios || [],
          diferenciaisDesejaveis: dadosVaga.diferenciaisDesejaveis || [],
          emailContato: emailFinal,
          nivel: dadosVaga.nivel || 'pleno',
          modalidade: dadosVaga.modalidade || 'remoto',
          localizacao: dadosVaga.localizacao || '',
          salario: dadosVaga.salario || '',
        };

        const { salvarPendente } = await import("./pendingApplications.service.js");
        const pendingId = await salvarPendente({
          vagaSource: (vaga as any).source || "",
          vagaTitle: vaga.title,
          vagaCompany: vaga.company,
          vagaUrl: vaga.url || "",
          score: match.score,
          emailDestino: emailFinal,
          dadosVagaCompleto,
        });

        resultados.stats.pendentes++;
        logInfo(`📋 Aguardando revisão: ${vaga.title} → ${emailFinal} (pendingId=${pendingId})`);
        resultados.applied.push({
          title: vaga.title,
          company: vaga.company,
          score: match.score,
          email: emailFinal,
          pendingId,
          status: "aguardando_revisao",
        });
      } catch (err: any) {
        logError(`Erro ao salvar candidatura pendente "${vaga.title}": ${err.message}`);
        resultados.applied.push({
          title: vaga.title,
          company: vaga.company,
          score: match.score,
          email: emailFinal,
          status: "erro_pendencia",
          erro: err.message,
        });
      }
    } catch (err: any) {
      logError(`Erro ao processar "${vaga.title}": ${err.message}`);
      resultados.erros.push({ title: vaga.title, error: err.message });
    }
  }

  const totalTime = Date.now() - startTime;
  resultados.resumo = {
    total: vagas.length,
    compatveis: resultados.applied.length,
    ...resultados.stats,
    erros: resultados.erros.length,
    tempoTotal: `${totalTime}ms`,
  };

  logInfo("Pipeline concluído", resultados.resumo);
  return resultados;
};

/**
 * Extrai email de texto livre (descrição da vaga, LinkedIn post, etc.)
 * Ignora emails de plataformas (linkedin, sentry, etc.)
 */
function extrairEmailDoTexto(texto: string): string | null {
  if (!texto) return null;
  const ignoreDomains = [
    "linkedin.com",
    "sentry.io",
    "example.com",
    "email.com",
    "domain.com",
    "company.com",
    "test.com",
    "placeholder.com",
  ];
  const emails = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (!emails) return null;
  const valido = emails.find(
    (e) => !ignoreDomains.some((d) => e.toLowerCase().endsWith(d)),
  );
  return valido || null;
}

import { logWarn } from "../shared/utils/logger.js";

export { getStats } from "../monitor/stats.service.js";