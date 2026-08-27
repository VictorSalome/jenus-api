import { Request, Response } from "express";
import { execSync } from "child_process";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const DEPLOY_TOKEN =
  process.env.DEPLOY_TOKEN || "deploy-token-change-in-production";

function run(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: "inherit" });
    return true;
  } catch (err) {
    console.error(`[Deploy] Comando falhou: ${cmd}`);
    return false;
  }
}

export const uploadDeploy = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const token = req.headers["x-deploy-token"];
    if (token !== DEPLOY_TOKEN) {
      res.status(403).json({ error: "Invalid token" });
      return;
    }

    if (!(req as any).file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const filepath = "/tmp/deploy.tar.gz";
    const fileBuffer = (req as any).file.buffer;
    const readableStream = Readable.from([fileBuffer]);
    await pipeline(readableStream, createWriteStream(filepath));

    res.json({ message: "Deploy package uploaded" });
  } catch (err) {
    console.error("Deploy upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

export const triggerDeploy = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const token = req.headers["x-deploy-token"];
    if (token !== DEPLOY_TOKEN) {
      res.status(403).json({ error: "Invalid token" });
      return;
    }

    res.json({ message: "Deploy triggered" });

    console.log("🚀 Iniciando deploy...");

    // 1. Extrair package
    run("cd ~/enviaPromo && tar -xzf /tmp/deploy.tar.gz");

    // 2. Copiar dist (aplicacao compilada)
    run("cd ~/enviaPromo && rm -rf dist && cp -r deploy/dist dist");

    // 3. Instalar dependencias de producao
    run(
      "cd ~/enviaPromo && (pnpm install --prod --frozen-lockfile 2>/dev/null || npm install --production)",
    );

    // 4. Restart SEMPRE no final, mesmo se passos anteriores falharam
    run("pm2 restart promo-monitor && pm2 save");

    console.log("✅ Deploy concluido!");
  } catch (err) {
    console.error("Deploy trigger error:", err);
    res.status(500).json({ error: "Trigger failed" });
  }
};
