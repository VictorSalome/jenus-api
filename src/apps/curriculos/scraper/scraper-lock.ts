import fs from "fs";
import path from "path";
import os from "os";

export const DEFAULT_SCRAPER_LOCK_FILE = path.join(
  os.tmpdir(),
  "jenus-linkedin-scraper.lock",
);

export interface ResultadoLock {
  adquirido: boolean;
  pidExistente?: number;
  motivo?: "LOCK_ATIVO" | "ERRO";
  caminhoLock: string;
  liberar: () => void;
}

/**
 * Verifica se um processo com o PID fornecido está ativo no sistema operacional.
 * No Node/POSIX, process.kill(pid, 0) não envia sinal, apenas testa se o processo existe.
 */
export function isProcessoAtivo(pid: number): boolean {
  if (!pid || typeof pid !== "number" || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    if (err.code === "ESRCH") {
      // Processo inexistente (já encerrou)
      return false;
    }
    if (err.code === "EPERM") {
      // Processo existe mas usuário atual não tem permissão para sinalizá-lo
      return true;
    }
    return false;
  }
}

/**
 * Adquire lock exclusivo de processo para o Scraper do LinkedIn.
 * - Impede que múltiplas instâncias rodem simultaneamente.
 * - Trata locks órfãos (processo anterior que morreu sem remover o lock).
 * - Registra listeners para SIGINT, SIGTERM e exit para liberar o lock de forma limpa.
 */
export function adquirirLockScraper(
  caminhoLock: string = DEFAULT_SCRAPER_LOCK_FILE,
): ResultadoLock {
  const liberar = () => {
    try {
      if (fs.existsSync(caminhoLock)) {
        const raw = fs.readFileSync(caminhoLock, "utf-8");
        const data = JSON.parse(raw);
        if (data.pid === process.pid) {
          fs.unlinkSync(caminhoLock);
        }
      }
    } catch {}
  };

  // 1. Checar se já existe arquivo de lock
  if (fs.existsSync(caminhoLock)) {
    try {
      const raw = fs.readFileSync(caminhoLock, "utf-8").trim();
      const data = JSON.parse(raw);
      const pidExistente = data?.pid;

      if (pidExistente && isProcessoAtivo(pidExistente)) {
        return {
          adquirido: false,
          pidExistente,
          motivo: "LOCK_ATIVO",
          caminhoLock,
          liberar: () => {},
        };
      }

      // Lock órfão (processo não está mais ativo): remover com segurança
      try {
        fs.unlinkSync(caminhoLock);
      } catch {}
    } catch {
      // Arquivo corrompido ou ilegível: remover lock órfão
      try {
        fs.unlinkSync(caminhoLock);
      } catch {}
    }
  }

  // 2. Criar lock atomicamente usando flag 'wx' (O_CREAT | O_EXCL)
  try {
    const lockPayload = JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString(),
      hostname: os.hostname(),
    });
    fs.writeFileSync(caminhoLock, lockPayload, { flag: "wx" });
  } catch (err: any) {
    if (err.code === "EEXIST") {
      // Outro processo criou no exato milissegundo de corrida
      try {
        const raw = fs.readFileSync(caminhoLock, "utf-8").trim();
        const data = JSON.parse(raw);
        const pidExistente = data?.pid;
        if (pidExistente && isProcessoAtivo(pidExistente)) {
          return {
            adquirido: false,
            pidExistente,
            motivo: "LOCK_ATIVO",
            caminhoLock,
            liberar: () => {},
          };
        }
      } catch {}
    }
    return {
      adquirido: false,
      motivo: "ERRO",
      caminhoLock,
      liberar: () => {},
    };
  }

  // 3. Registrar hooks para remoção limpa
  const cleanupSignals = () => {
    liberar();
  };

  process.once("exit", cleanupSignals);
  process.once("SIGINT", () => {
    liberar();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    liberar();
    process.exit(143);
  });

  return {
    adquirido: true,
    caminhoLock,
    liberar,
  };
}
