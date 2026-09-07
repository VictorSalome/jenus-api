import { Router } from "express";
import { getDb } from "../../../core/database.js";
import { asyncHandler } from "../shared/middleware/errorHandler.js";

const router = Router();

const DIAS_SEMANA = [
  { index: 1, dia: "Seg", diaCompleto: "Segunda-feira" },
  { index: 2, dia: "Ter", diaCompleto: "Terça-feira" },
  { index: 3, dia: "Qua", diaCompleto: "Quarta-feira" },
  { index: 4, dia: "Qui", diaCompleto: "Quinta-feira" },
  { index: 5, dia: "Sex", diaCompleto: "Sexta-feira" },
  { index: 6, dia: "Sáb", diaCompleto: "Sábado" },
  { index: 0, dia: "Dom", diaCompleto: "Domingo" },
];

router.get(
  "/analytics",
  asyncHandler(async (_req, res) => {
    const db = await getDb();

    // 1. Métricas Globais de Envios
    const totalRow = await db.get(
      "SELECT COUNT(*) as total FROM curriculo_envios WHERE status = 'SENT'"
    );
    const totalEnviados = totalRow?.total ?? 0;

    const hojeRow = await db.get(
      "SELECT COUNT(*) as total FROM curriculo_envios WHERE status = 'SENT' AND date(created_at) = date('now', 'localtime')"
    );
    const enviadosHoje = hojeRow?.total ?? 0;

    const semanaRow = await db.get(
      "SELECT COUNT(*) as total FROM curriculo_envios WHERE status = 'SENT' AND date(created_at) >= date('now', 'localtime', '-7 days')"
    );
    const enviadosSemana = semanaRow?.total ?? 0;

    const mesRow = await db.get(
      "SELECT COUNT(*) as total FROM curriculo_envios WHERE status = 'SENT' AND date(created_at) >= date('now', 'localtime', '-30 days')"
    );
    const enviadosMes = mesRow?.total ?? 0;

    // 2. Respostas Recebidas (respostas detectadas via Gmail thread)
    const respostasRow = await db.get(
      "SELECT COUNT(*) as total FROM curriculo_envios WHERE status = 'SENT' AND gmail_thread_id IS NOT NULL AND gmail_thread_id != ''"
    );
    const totalRespostas = respostasRow?.total ?? 0;
    const taxaRetorno =
      totalEnviados > 0
        ? Number(((totalRespostas / totalEnviados) * 100).toFixed(1))
        : 0;

    // 3. Score Médio de Compatibilidade
    const scoreRow = await db.get(
      "SELECT AVG(score) as avg_score FROM curriculo_envios WHERE score > 0"
    );
    const scoreMedio = scoreRow?.avg_score ? Math.round(scoreRow.avg_score) : 0;

    // 4. Envios por Dia da Semana (Seg a Dom nos últimos 30 dias)
    const enviosDiasRows = await db.all(`
      SELECT 
        strftime('%w', created_at) as day_index,
        COUNT(*) as total
      FROM curriculo_envios
      WHERE status = 'SENT' AND date(created_at) >= date('now', 'localtime', '-30 days')
      GROUP BY day_index
    `);

    const dayMap = new Map<number, number>();
    for (const row of enviosDiasRows) {
      dayMap.set(Number(row.day_index), row.total);
    }

    const enviosPorDiaSemana = DIAS_SEMANA.map((d) => ({
      dia: d.dia,
      diaCompleto: d.diaCompleto,
      total: dayMap.get(d.index) || 0,
    }));

    // Dia mais ativo
    let diaMaisAtivoNome = "Nenhum ainda";
    let maxEnvios = 0;
    for (const d of enviosPorDiaSemana) {
      if (d.total > maxEnvios) {
        maxEnvios = d.total;
        diaMaisAtivoNome = `${d.diaCompleto} (${d.total} envios)`;
      }
    }

    // 5. Histórico dos Últimos 7 dias (para mini-gráfico)
    const ultimos7DiasRows = await db.all(`
      SELECT 
        date(created_at) as data,
        COUNT(*) as total
      FROM curriculo_envios
      WHERE status = 'SENT' AND date(created_at) >= date('now', 'localtime', '-6 days')
      GROUP BY date(created_at)
      ORDER BY data ASC
    `);

    // 6. Top Tecnologias das Vagas Aplicadas
    const vagasRows = await db.all(
      "SELECT skills_json FROM curriculo_vagas ORDER BY id DESC LIMIT 50"
    );
    const snapshotsRows = await db.all(
      "SELECT curriculo_snapshot FROM curriculo_envios WHERE curriculo_snapshot IS NOT NULL LIMIT 50"
    );

    const techFrequency: Record<string, number> = {};
    for (const row of vagasRows) {
      if (!row.skills_json) continue;
      try {
        const skills: string[] = JSON.parse(row.skills_json);
        if (Array.isArray(skills)) {
          for (const s of skills) {
            const clean = s.trim();
            if (clean) techFrequency[clean] = (techFrequency[clean] || 0) + 1;
          }
        }
      } catch {}
    }

    for (const row of snapshotsRows) {
      if (!row.curriculo_snapshot) continue;
      try {
        const snap = JSON.parse(row.curriculo_snapshot);
        const techs = snap.matchingSkills || snap.technologies || [];
        if (Array.isArray(techs)) {
          for (const t of techs) {
            const clean = String(t).trim();
            if (clean) techFrequency[clean] = (techFrequency[clean] || 0) + 1;
          }
        }
      } catch {}
    }

    const techEntries = Object.entries(techFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const maxTechCount = techEntries[0]?.[1] || 1;
    const topTecnologias = techEntries.map(([nome, total]) => ({
      nome,
      total,
      porcentagem: Math.round((total / maxTechCount) * 100),
    }));

    res.json({
      success: true,
      analytics: {
        kpis: {
          totalEnviados,
          enviadosHoje,
          enviadosSemana,
          enviadosMes,
          totalRespostas,
          taxaRetorno,
          diaMaisAtivo: diaMaisAtivoNome,
          scoreMedio,
        },
        enviosPorDiaSemana,
        historicoUltimos7Dias: ultimos7DiasRows,
        topTecnologias,
        statusFunil: {
          enviados: totalEnviados,
          respostas: totalRespostas,
          taxaConversao: taxaRetorno,
        },
      },
    });
  })
);

export default router;
