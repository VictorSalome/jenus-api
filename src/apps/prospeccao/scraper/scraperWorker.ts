import { executarScraperMaps, type OpcoesScraperMaps } from "./mapsScraper.js";

process.on("message", async (msg: any) => {
  if (msg.type === "START") {
    try {
      const { termoBusca, opcoes } = msg.payload;

      // Wrap onProgress to send IPC messages
      const wrappedOpcoes: OpcoesScraperMaps = {
        ...opcoes,
        onProgress: (etapa: string, atual: number, total: number) => {
          if (process.send) {
            process.send({
              type: "PROGRESS",
              payload: { etapa, atual, total },
            });
          }
        },
      };

      const resumo = await executarScraperMaps(termoBusca, wrappedOpcoes);

      if (process.send) {
        process.send({ type: "SUCCESS", payload: resumo });
      }
    } catch (error: any) {
      if (process.send) {
        process.send({ type: "ERROR", payload: error.message || String(error) });
      }
    } finally {
      process.exit(0);
    }
  }
});