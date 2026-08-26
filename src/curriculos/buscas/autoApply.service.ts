import { logInfo, logError } from "../utils/logger.js";
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
  stats: { gerados: number; enviados: number; semEmail: number; erroEnvio: number };
  resumo: {
    total: number;
    compatveis: number;
    gerados: number;
    enviados: number;
    semEmail: number;
    erros: number;
    erroEnvio: number;
    tempoTotal: string;
  };
}

export const executarPipeline = async ({
  query = "",
  tags = [],
  minScore = 60,
  limit = 10,
  autoSend = true,
}: {
  query?: string;
  tags?: string[];
  minScore?: number;
  limit?: number;
  autoSend?: boolean;
} = {}): Promise<PipelineResult> => {
  const startTime = Date.now();
  const resultados: PipelineResult = {
    buscas: [],
    applied: [],
    skipped: [],
    erros: [],
    stats: { gerados: 0, enviados: 0, semEmail: 0, erroEnvio: 0 },
    resumo: {} as any,
  };

  logInfo("Iniciando pipeline auto-apply", {
    tags: tags.join(","),
    minScore,
    autoSend,
  });

  // 1. Buscar vagas
  const { buscarVagas } = await import("./feed.service.js");
  const vagas = await buscarVagas({ query, tags, limit: Math.min(limit, 20) });
  logInfo(`Vagas brutas: ${vagas.length}`);

  // 2. Processar cada vaga
  for (const vaga of vagas) {
    try {
      const { calcularCompatibilidade } = await import("./match.service.js");
      const match = calcularCompatibilidade(vaga);
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

      // 4. Gerar currículo
      let nomeArquivo: string | null = null;
      try {
        const { personalizarCurriculo } = await import("../analisar/curriculoPersonalizador.service.js");
        const { gerarPdfCurriculo } = await import("../pdf/pdfGenerator.service.js");
        
        const curriculo = await personalizarCurriculo(dadosVaga);
        const pdfPath = await gerarPdfCurriculo(curriculo, dadosVaga);
        if (pdfPath) {
          nomeArquivo = path.basename(pdfPath);
          resultados.stats.gerados++;
        }
      } catch (err: any) {
        logError(`Erro ao gerar PDF para "${vaga.title}": ${err.message}`);
      }

      if (!nomeArquivo) {
        resultados.applied.push({
          title: vaga.title,
          company: vaga.company,
          score: match.score,
          email: emailFinal,
          status: "erro_pdf",
        });
        continue;
      }

      // 5. ENVIAR EMAIL (só chega aqui se tem email + PDF)
      try {
        // Carregar dados do candidato do banco
        const { getDb } = await import("../../core/database.js");
        const db = await getDb();
        const skillsRows = await db.all('SELECT category, tech FROM profile_skills');
        const skills: Record<string, string[]> = {
          programming: [],
          frameworks: [],
          databases: [],
          methodologies: [],
          testing: [],
          devops: [],
          aiAutomation: []
        };
        const categoryMap: Record<string, string> = {
          'programming': 'programming',
          'frameworks': 'frameworks',
          'databases': 'databases',
          'methodologies': 'methodologies',
          'testing': 'testing',
          'devops': 'devops',
          'aiAutomation': 'aiAutomation'
        };
        for (const row of skillsRows) {
          const cat = categoryMap[row.category] || row.category;
          if (skills[cat]) {
            skills[cat].push(row.tech);
          }
        }
        
        const candidatoData = {
          personalInfo: {
            name: "Victor Salomão",
            email: "vsalome41@gmail.com",
            phone: "+55 11 99999-9999",
            linkedin: "https://linkedin.com/in/victorsalome",
            github: "https://github.com/victorsalome",
            portfolio: "https://victorsalome.dev",
            title: "Desenvolvedor Full Stack | React, TypeScript, Node.js | .NET, SQL"
          }
        };
        
        // Construir dadosVaga completo
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
        
        const { enviarCurriculo } = await import("../email/email.service.js");
        await enviarCurriculo(
          emailFinal,
          pdfPath,
          dadosVagaCompleto,
          candidatoData.personalInfo
        );
        resultados.stats.enviados++;
        logInfo(`✅ ENVIADO: ${vaga.title} → ${emailFinal}`);
        resultados.applied.push({
          title: vaga.title,
          company: vaga.company,
          score: match.score,
          email: emailFinal,
          arquivo: nomeArquivo,
          status: "enviado",
        });
      } catch (err: any) {
        resultados.stats.erroEnvio++;
        logError(`❌ Erro envio "${vaga.title}": ${err.message}`);
        resultados.applied.push({
          title: vaga.title,
          company: vaga.company,
          score: match.score,
          email: emailFinal,
          arquivo: nomeArquivo,
          status: "erro_envio",
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

import { logWarn } from "../utils/logger.js";
import path from "path";

export { getStats } from "../monitor/stats.service.js";