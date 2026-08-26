import fs from "fs";
import path from "path";

const STATS_FILE = "./data/curriculo-stats.json";

/**
 * Estatísticas do sistema de currículos
 */
let stats = {
  totalVagas: 0,
  enviados: 0,
  erros: 0,
  tempoMedio: "0ms",
  ultimoEnvio: null,
  autoApplyExecutions: 0
};

// Carregar estatísticas do arquivo
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, "utf-8");
      stats = { ...stats, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error("Erro carregando stats:", err);
  }
}

// Salvar estatísticas
function saveStats() {
  try {
    const dir = path.dirname(STATS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error("Erro salvando stats:", err);
  }
}

// Incrementar contador
function increment(key, value = 1) {
  stats[key] = (stats[key] || 0) + value;
  saveStats();
}

// Obter estatísticas (para API)
export function getStats() {
  loadStats();
  return { ...stats };
}

// Registrar envio bem-sucedido
export function registrarEnvio(tempoMs) {
  stats.enviados += 1;
  stats.ultimoEnvio = new Date().toISOString();
  
  // Calcular média móvel simples
  if (tempoMs) {
    stats.tempoMedio = `${Math.round((stats.tempoMedio === "0ms" ? tempoMs : parseInt(stats.tempoMedio) + tempoMs) / 2)}ms`;
  }
  
  saveStats();
}

// Registrar erro
export function registrarErro(mensagem) {
  stats.erros += 1;
  saveStats();
}

// Registrar vaga encontrada
export function registrarVaga() {
  stats.totalVagas += 1;
  saveStats();
}

// Resetar estatísticas
export function resetarStats() {
  stats = {
    totalVagas: 0,
    enviados: 0,
    erros: 0,
    tempoMedio: "0ms",
    ultimoEnvio: null,
    autoApplyExecutions: 0
  };
  saveStats();
}

// Carregar ao iniciar
loadStats();