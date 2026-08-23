const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions/StringSession");
const sqlite3 = require("sqlite3").verbose();
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const DB_PATH = "./data/promo-monitor.db";

async function auth() {
  console.log("\n==========================================");
  console.log("🚀 Promo Monitor - Autenticação Telegram");
  console.log("==========================================\n");

  // Ler config do banco
  const db = new sqlite3.Database(DB_PATH);
  const config = await new Promise((resolve, reject) => {
    db.get(
      "SELECT api_id, api_hash, phone FROM telegram_config WHERE id = 1",
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      },
    );
  });

  if (!config || !config.api_id || !config.api_hash) {
    console.log("❌ ERRO: Configure API_ID e API_HASH primeiro no dashboard!");
    console.log("   Acesse: http://136.248.109.21:3001 → Aba Telegram\n");
    db.close();
    process.exit(1);
  }

  if (!config.phone) {
    console.log("❌ ERRO: Configure o número de telefone primeiro!");
    console.log("   Formato: +5511987319331\n");
    db.close();
    process.exit(1);
  }

  console.log("📱 Telefone:", config.phone);
  console.log("🔑 API ID:", config.api_id);
  console.log("");

  const session = new StringSession("");
  const client = new TelegramClient(
    session,
    parseInt(config.api_id),
    config.api_hash,
    { connectionRetries: 3 },
  );

  try {
    console.log("⏳ Conectando ao Telegram...");
    await client.connect();
    console.log("✅ Conectado!\n");

    console.log("⏳ Enviando código SMS...");
    const { phoneCodeHash } = await client.sendCode(
      { apiId: parseInt(config.api_id), apiHash: config.api_hash },
      config.phone,
    );
    console.log("✅ Código SMS enviado!\n");

    // Perguntar código
    const code = await new Promise((resolve) => {
      rl.question("📩 Digite o código SMS recebido no celular: ", (answer) => {
        resolve(answer.trim());
      });
    });

    console.log("\n⏳ Verificando código...");

    await client.invoke(
      new (require("telegram").Api.auth.SignIn)({
        phoneNumber: config.phone,
        phoneCodeHash: phoneCodeHash,
        phoneCode: code,
      }),
    );

    console.log("✅ Autenticação bem-sucedida!\n");

    const sessionString = session.save();

    // Salvar no banco
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE telegram_config SET session_string = ?, is_connected = 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
        [sessionString],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        },
      );
    });

    console.log("✅ Sessão salva no banco!\n");
    console.log("==========================================");
    console.log("🎉 AUTENTICAÇÃO COMPLETA!");
    console.log("==========================================");
    console.log("\n✅ Agora você pode:");
    console.log("   1. Iniciar o Monitor no dashboard");
    console.log("   2. Receber promoções automaticamente no WhatsApp");
    console.log("\n🌐 Acesse: http://136.248.109.21:3001\n");

    await client.disconnect();
    db.close();
    rl.close();
  } catch (err) {
    console.error("\n❌ Erro:", err.message || err);

    if (err.message?.includes("PHONE_CODE_INVALID")) {
      console.log("\n⚠️  Código inválido!");
      console.log("   Aguarde alguns minutos e tente novamente.");
    } else if (err.message?.includes("FloodWait")) {
      console.log("\n⚠️  Muitas tentativas!");
      console.log("   Aguarde o tempo indicado antes de tentar novamente.");
    }

    db.close();
    rl.close();
    process.exit(1);
  }
}

auth();
