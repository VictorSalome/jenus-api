function safeSend(msg: any) {
  if (process.connected && process.send) {
    try {
      process.send(msg);
    } catch (e) {
      // Ignorar EPIPE
    }
  }
}

process.on("message", (msg: any) => {
  if (msg.type === "START") {
    const { termoBusca, opcoes } = msg.payload;

    if (termoBusca === "TEST_SUCCESS") {
      safeSend({ type: "PROGRESS", payload: { etapa: "Iniciando", atual: 0, total: 100 } });
      setTimeout(() => {
        safeSend({
          type: "SUCCESS",
          payload: {
            termoBusca: termoBusca,
            totalProcessados: 10,
            aprovadas: 10,
            rejeitadas: 0,
            rejeitadasSemContato: 0,
            rejeitadasPoucasFotos: 0,
            ignoradasComSite: 0,
            empresas: [] // To satisfy the dispatcher
          },
        });
      }, 50);
    } else if (termoBusca === "TEST_ERROR") {
      setTimeout(() => {
        safeSend({ type: "ERROR", payload: "Erro forçado no worker" });
      }, 50);
    } else if (termoBusca === "TEST_TIMEOUT") {
      // Simulate taking too long (test will kill it)
      setTimeout(() => {
        safeSend({ type: "SUCCESS", payload: { total_encontrado: 0, empresas: [] } });
      }, 20000); // 20 seconds
    } else if (termoBusca === "TEST_CRASH") {
      // Simulate sudden crash
      setTimeout(() => {
        process.exit(1);
      }, 50);
    } else if (termoBusca.startsWith("TEST_CONCURRENCY")) {
      setTimeout(() => {
        safeSend({
          type: "SUCCESS",
          payload: { termo_busca: termoBusca, empresas: [] },
        });
      }, 200);
    }
  }
});
