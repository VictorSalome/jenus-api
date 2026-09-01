import { Router } from "express";

import * as accounts from "../controllers/accounts.controller.js";
import * as cards from "../controllers/cards.controller.js";
import * as categories from "../controllers/categories.controller.js";
import * as merchants from "../controllers/merchants.controller.js";
import * as transactions from "../controllers/transactions.controller.js";
import * as installments from "../controllers/installments.controller.js";
import * as invoices from "../controllers/invoices.controller.js";
import * as notificationEvents from "../controllers/notification-events.controller.js";
import { dashboard } from "../controllers/dashboard.controller.js";
import { asyncHandler } from "../shared/errors.js";

const router = Router();

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

router.get("/installments", asyncHandler(installments.list));
router.get("/installments/future", asyncHandler(installments.future));
router.post("/installments/:id/pay", asyncHandler(installments.pay));
router.post("/installments/:id/cancel", asyncHandler(installments.cancel));

router.get("/invoices", asyncHandler(invoices.list));

router.get("/notification-events", asyncHandler(notificationEvents.list));
router.post("/notification-events", asyncHandler(notificationEvents.create));
router.post("/notification-events/:id/import", asyncHandler(notificationEvents.importEvent));
router.post("/notification-events/:id/ignore", asyncHandler(notificationEvents.ignore));

export default router;
