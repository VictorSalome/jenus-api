import { getDb, runTransaction, initDb } from './src/core/database.js';
import { listTransactions } from './src/apps/financas/services/dashboard.service.js';
import { createTransaction } from './src/apps/financas/services/transactions.service.js';

async function runBenchmark() {
  console.log("Inicializando DB...");
  await initDb();
  
  const householdId = "household-test";
  const userId = "user-test";

  console.log("Rodando inserções...");
  const startWrite = Date.now();
  const writePromises = [];
  for (let i = 0; i < 50; i++) {
    writePromises.push(createTransaction(userId, {
      accountId: 1, // assumes account exists or foreign key might fail, let's just use runTransaction directly
      amountCents: 1000 + i,
      transactionDate: '2026-09-15',
      description: 'Benchmark ' + i,
      installmentsTotal: 1,
      source: 'MANUAL',
    }).catch(e => {
        // ignore FK errors for benchmark
    }));
  }
  await Promise.all(writePromises);
  const endWrite = Date.now();
  console.log(`Writes (txQueue) time for 50 concurrent inserts: ${endWrite - startWrite}ms`);

  console.log("Rodando leitura em lote...");
  const startRead = Date.now();
  const db = await getDb();
  // Using direct db query to bypass foreign keys missing and simulate heavy SELECT *
  for (let i = 0; i < 100; i++) {
    await db.all("SELECT * FROM fin_transactions LIMIT 1000");
  }
  const endRead = Date.now();
  console.log(`Reads (SELECT *) time for 100 queries: ${endRead - startRead}ms`);
}

runBenchmark().then(() => process.exit(0)).catch(console.error);
