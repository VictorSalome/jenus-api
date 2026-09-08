import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { getDb, initDb } from "../../../core/database.js";
import {
  listarPorStatus,
  atualizarStatus,
  obterEstatisticas,
} from "../repositories/empresa.repository.js";
import { StatusLead, type EmpresaLead } from "../types.js";

export const executarAprovacaoManual = async () => {
  const db = await initDb();
  const rl = readline.createInterface({ input, output });

  try {
    const pendentes = await listarPorStatus(StatusLead.PENDENTE);
    const stats = await obterEstatisticas();

    console.log("\n==========================================");
    console.log("       PAINEL DE APROVAÇÃO DE LEADS       ");
    console.log("==========================================");
    console.log(
      `Status atual: ${stats.PENDENTE} Pendentes | ${stats.APROVADA} Aprovadas | ${stats.REJEITADA} Rejeitadas | ${stats.ENVIADA} Enviadas`,
    );

    if (pendentes.length === 0) {
      console.log("\nNenhum lead pendente de aprovação no momento.");
      return;
    }

    console.log(`\nIniciando revisão de ${pendentes.length} leads pendentes.`);
    console.log("Comandos: [s] Aprovar | [n] Rejeitar | [p] Pular | [sair] Sair\n");

    let aprovados = 0;
    let rejeitados = 0;
    let pulados = 0;

    for (let i = 0; i < pendentes.length; i++) {
      const lead: EmpresaLead = pendentes[i];
      const fotosCount = (lead.fotos || []).length;
      const local = [lead.bairro, lead.cidade].filter(Boolean).join(", ") || "Sem localização";

      console.log("------------------------------------------");
      console.log(`[${i + 1}/${pendentes.length}] ${lead.nome}`);
      console.log(`Segmento   : ${lead.segmento || "Não informado"}`);
      console.log(`Local      : ${local}`);
      console.log(`E-mail     : ${lead.email || "(sem e-mail)"}`);
      console.log(`WhatsApp   : ${lead.whatsapp || "(sem whatsapp)"}`);
      console.log(`Telefone   : ${lead.telefone || "(sem telefone)"}`);
      console.log(`Avaliação  : ⭐ ${lead.avaliacao ?? "?"} (${lead.total_avaliacoes ?? 0} avaliações)`);
      console.log(`Fotos (${fotosCount}): ${(lead.fotos || []).slice(0, 2).join(", ") || "(sem fotos)"}`);
      console.log(`Slug demo  : /demo/${lead.slug}`);

      let decidido = false;

      while (!decidido) {
        const resposta = (
          await rl.question("Aprovar lead? (s/n/p/sair): ")
        )
          .trim()
          .toLowerCase();

        if (resposta === "sair") {
          console.log("\nEncerrando sessão de aprovação...");
          console.log(
            `Resumo da sessão: ${aprovados} aprovados, ${rejeitados} rejeitados, ${pulados} pulados.`,
          );
          return;
        }

        if (resposta === "s" || resposta === "sim") {
          await atualizarStatus(lead.id, StatusLead.APROVADA);
          aprovados++;
          decidido = true;
          console.log(`✅ Lead "${lead.nome}" APROVADO!`);
        } else if (resposta === "n" || resposta === "nao" || resposta === "não") {
          const motivo = (
            await rl.question("Motivo da rejeição (opcional, ENTER para 'REPROVADO_MANUAL'): ")
          ).trim();
          await atualizarStatus(
            lead.id,
            StatusLead.REJEITADA,
            motivo || "REPROVADO_MANUAL",
          );
          rejeitados++;
          decidido = true;
          console.log(`❌ Lead "${lead.nome}" REJEITADO!`);
        } else if (resposta === "p" || resposta === "pular") {
          pulados++;
          decidido = true;
          console.log(`⏭️  Lead "${lead.nome}" mantido como PENDENTE.`);
        } else {
          console.log("Opção inválida. Digite 's' para aprovar, 'n' para rejeitar, 'p' para pular ou 'sair'.");
        }
      }
    }

    console.log("\n==========================================");
    console.log("       REVISÃO CONCLUÍDA COM SUCESSO      ");
    console.log("==========================================");
    console.log(`Aprovados: ${aprovados} | Rejeitados: ${rejeitados} | Pulados: ${pulados}`);
  } finally {
    rl.close();
    try {
      await db.close();
    } catch {}
  }
};

(async () => {
  try {
    await executarAprovacaoManual();
    process.exit(0);
  } catch (err) {
    console.error("Erro na CLI de aprovação:", err);
    process.exit(1);
  }
})();
