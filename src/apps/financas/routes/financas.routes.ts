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
import { sendTestPush, simulatePurchaseNotification } from "../controllers/push-test.controller.js";
import { dashboard } from "../controllers/dashboard.controller.js";
import { asyncHandler } from "../shared/errors.js";
import { requireAuth, optionalAuth } from "../../../shared/auth/auth.middleware.js";

import { validateBody } from "../../../shared/middleware/validate-body.js";
import { validateQuery } from "../../../shared/middleware/validate-query.js";
import { validateParams } from "../../../shared/middleware/validate-params.js";
import {
  IdParamSchema,
  PaginationQuerySchema,
  AccountSchema,
  CardSchema,
  CategorySchema,
  MerchantSchema,
  TransactionSchema,
  InstallmentActionSchema,
  NotificationEventImportSchema,
  NotificationEventRawSchema,
  BatchIdsSchema,
  DebtSchema
} from "../../../shared/schemas/index.js";

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

/**
 * @swagger
 * /api/financas/push/simulate:
 *   post:
 *     summary: Simula compra bancária (Nubank, Itaú, etc.), grava em fin_notification_events e despacha push FCM.
 *     description: Aceita autenticação via Bearer token JWT ou header X-Webhook-Key / X-API-Key. Suporta presets de bancos ou dados personalizados.
 *     tags:
 *       - Finanças
 *     parameters:
 *       - in: header
 *         name: X-Webhook-Key
 *         schema:
 *           type: string
 *         description: Chave de API configurada no servidor (API_KEYS)
 *       - in: header
 *         name: X-API-Key
 *         schema:
 *           type: string
 *         description: Alternativa para chave de API
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bank: { type: string, enum: [nubank, itau, bradesco, inter, c6, mercadopago], default: nubank, example: "nubank" }
 *               amount: { type: number, example: 120.50 }
 *               merchant: { type: string, example: "Supermercado Pão de Açúcar" }
 *               installments: { type: number, example: 1 }
 *               title: { type: string, description: "Opcional: título personalizado da notificação" }
 *               text: { type: string, description: "Opcional: texto bruto da notificação/SMS para parser personalizado" }
 *               screen: { type: string, default: "detected", example: "detected" }
 *               token: { type: string, description: "Opcional: token FCM de destino (se omitido, envia para o último dispositivo ativo do usuário)" }
 *     responses:
 *       200:
 *         description: Evento financeiro registrado e notificação despachada.
 *       401:
 *         description: Não autorizado (Bearer token ou API Key ausente/inválida).
 */
router.post("/push/simulate", optionalAuth, asyncHandler(simulatePurchaseNotification));
router.post("/push/test", optionalAuth, asyncHandler(simulatePurchaseNotification));

// Demais rotas exigem autenticação JWT
router.use(requireAuth);

router.get("/dashboard", asyncHandler(dashboard));

router.get("/accounts", validateQuery(PaginationQuerySchema), asyncHandler(accounts.list));
router.get("/accounts/:id", validateParams(IdParamSchema), asyncHandler(accounts.getOne));
router.post("/accounts", validateBody(AccountSchema), asyncHandler(accounts.create));
router.put("/accounts/:id", validateParams(IdParamSchema), validateBody(AccountSchema), asyncHandler(accounts.update));
router.delete("/accounts/:id", validateParams(IdParamSchema), asyncHandler(accounts.remove));

router.get("/cards", validateQuery(PaginationQuerySchema), asyncHandler(cards.list));
router.get("/cards/:id", validateParams(IdParamSchema), asyncHandler(cards.getOne));
router.post("/cards", validateBody(CardSchema), asyncHandler(cards.create));
router.put("/cards/:id", validateParams(IdParamSchema), validateBody(CardSchema), asyncHandler(cards.update));
router.delete("/cards/:id", validateParams(IdParamSchema), asyncHandler(cards.remove));

router.get("/categories", validateQuery(PaginationQuerySchema), asyncHandler(categories.list));
router.get("/categories/:id", validateParams(IdParamSchema), asyncHandler(categories.getOne));
router.post("/categories", validateBody(CategorySchema), asyncHandler(categories.create));
router.put("/categories/:id", validateParams(IdParamSchema), validateBody(CategorySchema), asyncHandler(categories.update));
router.delete("/categories/:id", validateParams(IdParamSchema), asyncHandler(categories.remove));

router.get("/merchants", validateQuery(PaginationQuerySchema), asyncHandler(merchants.list));
router.post("/merchants", validateBody(MerchantSchema), asyncHandler(merchants.create));
router.put("/merchants/:id", validateParams(IdParamSchema), validateBody(MerchantSchema), asyncHandler(merchants.update));
router.delete("/merchants/:id", validateParams(IdParamSchema), asyncHandler(merchants.remove));

router.get("/transactions", validateQuery(PaginationQuerySchema), asyncHandler(transactions.list));
router.get("/transactions/import/template", asyncHandler(importTx.downloadTemplate));
router.get("/transactions/:id", validateParams(IdParamSchema), asyncHandler(transactions.getOne));
router.post("/transactions", validateBody(TransactionSchema), asyncHandler(transactions.create));
router.put("/transactions/:id", validateParams(IdParamSchema), validateBody(TransactionSchema), asyncHandler(transactions.update));
router.delete("/transactions/:id", validateParams(IdParamSchema), asyncHandler(transactions.remove));
router.post(
  "/transactions/import",
  uploadXlsx.single("file"),
  asyncHandler(importTx.importTransactions),
);

router.get("/installments", validateQuery(PaginationQuerySchema), asyncHandler(installments.list));
router.get("/installments/future", validateQuery(PaginationQuerySchema), asyncHandler(installments.future));
router.post("/installments/:id/pay", validateParams(IdParamSchema), validateBody(InstallmentActionSchema), asyncHandler(installments.pay));
router.post("/installments/:id/cancel", validateParams(IdParamSchema), asyncHandler(installments.cancel));

router.get("/invoices", validateQuery(PaginationQuerySchema), asyncHandler(invoices.list));

router.get("/debts/occurrences", validateQuery(PaginationQuerySchema), asyncHandler(debts.listOccurrences));
router.post("/debts/occurrences/:id/pay", validateParams(IdParamSchema), asyncHandler(debts.addPayment));
router.delete("/debts/payments/:paymentId", asyncHandler(debts.removePayment));
router.post("/debts/check-reminders", asyncHandler(debts.checkReminders));
router.get("/debts/suggestions", asyncHandler(debts.listSuggestions));
router.get("/debts", validateQuery(PaginationQuerySchema), asyncHandler(debts.listDebts));
router.get("/debts/:id", validateParams(IdParamSchema), asyncHandler(debts.getDebt));
router.post("/debts", validateBody(DebtSchema), asyncHandler(debts.createDebt));
router.put("/debts/:id", validateParams(IdParamSchema), validateBody(DebtSchema), asyncHandler(debts.updateDebt));
router.delete("/debts/:id", validateParams(IdParamSchema), asyncHandler(debts.removeDebt));

router.get("/notification-events", validateQuery(PaginationQuerySchema), asyncHandler(notificationEvents.list));
router.post("/notification-events", validateBody(NotificationEventRawSchema), asyncHandler(notificationEvents.create));
router.post("/notification-events/batch-delete", validateBody(BatchIdsSchema), asyncHandler(notificationEvents.batchRemove));
router.post("/notification-events/batch-import", validateBody(BatchIdsSchema), asyncHandler(notificationEvents.batchImport));
router.post("/notification-events/batch-ignore", validateBody(BatchIdsSchema), asyncHandler(notificationEvents.batchIgnore));
router.post("/notification-events/:id/import", validateParams(IdParamSchema), validateBody(NotificationEventImportSchema), asyncHandler(notificationEvents.importEvent));
router.post("/notification-events/:id/ignore", validateParams(IdParamSchema), asyncHandler(notificationEvents.ignore));
router.delete("/notification-events/:id", validateParams(IdParamSchema), asyncHandler(notificationEvents.remove));

export default router;
