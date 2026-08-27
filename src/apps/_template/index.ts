import { Router } from "express";
import type { AppModule } from "../../shared/http/app-registry.js";
import exemploRoutes from "./routes/exemplo.routes.js";

// TODO: renomeie o arquivo/módulo para a app real.

const router = Router();
router.use("/exemplo", exemploRoutes);

const templateModule: AppModule = {
  name: "template",
  prefix: "/api/template",
  router,
  // protected: false, // descomente se esta app precisar de rotas públicas
  //                    // (ex.: webhooks) e preferir aplicar requireAuth
  //                    // rota a rota em vez de globalmente.
};

export default templateModule;
