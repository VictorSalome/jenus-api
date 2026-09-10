import { Router } from "express";
import multer from "multer";

import * as accounts from "../controllers/accounts.controller.js";
import * as importTx from "../controllers/import.controller.js";
import * as cards from "../controllers/cards.controller.js";
import * as categories from "../controllers/categories.controller.js";
import * as merchants from "../controllers/merchants.controller.js";
import * as transactions from "../controllers/transactions.controller.js";
import * as installments from "../controllers/installments.controller.js";
import * as invoices from "../controllers/invoices.controller.js";
import * as debts from "../controllers/debts.controller.js";
import * as notificationEvents from "../controllers/notification-events.controller.js";
import { shortcutWebhook } from "../controllers/webhook.controller.js";
import { sendTestPush } from "../controllers/push-test.controller.js";
import { dashboard } from "../controllers/dashboard.controller.js";
import { asyncHandler } from "../shared/errors.js";
import { requireAuth, optionalAuth } from "../../../shared/auth/auth.middleware.js";

const router = Router();
const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

/**
 * @swagger
 * /api/financas/webhook/shortcut:
 *   post:
 *     summary: Webhook público para receber compras via Atalhos do iOS (Apple Shortcuts) / Siri.
 *     description: Aceita texto bruto de SMS/notificação bancária ou objeto estruturado. Autentica via header X-Webhook-Key ou Bearer token.
 *     tags:
 *       - Finanças
 *     parameters:
 *       - in: header
 *         name: X-Webhook-Key
 *         schema:
 *           type: string
 *         description: Chave de API configurada no servidor (API_KEYS)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, example: "Compra de R$ 85,90 no Posto Ipiranga aprovada no Nubank" }
 *               appLabel: { type: string, example: "Nubank" }
 *     responses:
 *       201:
 *         description: Transação processada e salva com sucesso.
 *       401:
 *         description: Chave de webhook inválida ou ausente.
 */
router.post("/webhook/shortcut", optionalAuth, asyncHandler(shortcutWebhook));

// Demais rotas exigem autenticação JWT
router.use(requireAuth);

/**
 * @swagger
 * /api/financas/push/test:
 *   post:
 *     summary: Dispara uma notificação de compra e registra o evento financeiro (Requer JWT).
 *     description: Simula a detecção de uma notificação bancária (Nubank, etc.), salva o evento no banco e despacha a notificação push para o usuário autenticado.
 *     security:
 *       - oauth2Password: []
 *       - bearerAuth: []
 *     tags:
 *       - Finanças
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, example: "Nubank" }
 *               body: { type: string, example: "Compra de R$ 120,00 no Supermercado Pão de Açúcar aprovada" }
 *               amount: { type: number, example: 120.00 }
 *               merchant: { type: string, example: "Supermercado Pão de Açúcar" }
 *               screen: { type: string, example: "detected" }
 *               token: { type: string, description: "Opcional: token específico para testar entrega direta." }
 *     responses:
 *       200:
 *         description: Evento financeiro salvo e push enviado.
 *       401:
 *         description: Não autorizado.
 */
router.post("/push/test", asyncHandler(sendTestPush));

router.get("/dashboard", asyncHandler(dashboard));

router.get("/accounts", asyncHandler(accounts.list));
router.post("/accounts", asyncHandler(accounts.create));
router.put("/accounts/:id", asyncHandler(accounts.update));
router.delete("/accounts/:id", asyncHandler(accounts.remove));

router.get("/cards", asyncHandler(cards.list));
router.post("/cards", asyncHandler(cards.create));
router.put("/cards/:id", asyncHandler(cards.update));
router.delete("/cards/:id", asyncHandler(cards.remove));

router.get("/categories", asyncHandler(categories.list));
router.post("/categories", asyncHandler(categories.create));
router.put("/categories/:id", asyncHandler(categories.update));
router.delete("/categories/:id", asyncHandler(categories.remove));

router.get("/merchants", asyncHandler(merchants.list));
router.post("/merchants", asyncHandler(merchants.create));
router.put("/merchants/:id", asyncHandler(merchants.update));
router.delete("/merchants/:id", asyncHandler(merchants.remove));

router.get("/transactions", asyncHandler(transactions.list));
router.post("/transactions", asyncHandler(transactions.create));
router.put("/transactions/:id", asyncHandler(transactions.update));
router.delete("/transactions/:id", asyncHandler(transactions.remove));

router.get("/transactions/import/template", asyncHandler(importTx.downloadTemplate));
router.post(
  "/transactions/import",
  uploadXlsx.single("file"),
  asyncHandler(importTx.importTransactions),
);

router.get("/installments", asyncHandler(installments.list));
router.get("/installments/future", asyncHandler(installments.future));
router.post("/installments/:id/pay", asyncHandler(installments.pay));
router.post("/installments/:id/cancel", asyncHandler(installments.cancel));

router.get("/invoices", asyncHandler(invoices.list));

router.get("/debts/occurrences", asyncHandler(debts.listOccurrences));
router.post("/debts/occurrences/:id/pay", asyncHandler(debts.addPayment));
router.delete("/debts/payments/:paymentId", asyncHandler(debts.removePayment));
router.post("/debts/check-reminders", asyncHandler(debts.checkReminders));
router.get("/debts/suggestions", asyncHandler(debts.listSuggestions));
router.get("/debts", asyncHandler(debts.listDebts));
router.get("/debts/:id", asyncHandler(debts.getDebt));
router.post("/debts", asyncHandler(debts.createDebt));
router.put("/debts/:id", asyncHandler(debts.updateDebt));
router.delete("/debts/:id", asyncHandler(debts.removeDebt));

router.get("/notification-events", asyncHandler(notificationEvents.list));
router.post("/notification-events", asyncHandler(notificationEvents.create));
router.post("/notification-events/:id/import", asyncHandler(notificationEvents.importEvent));
router.post("/notification-events/:id/ignore", asyncHandler(notificationEvents.ignore));

export default router;
