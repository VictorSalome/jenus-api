import type { AppModule } from "../../shared/http/app-registry.js";
import gmailRouter from "./routes/gmail.routes.js";

const gmailModule: AppModule = {
  name: "gmail",
  prefix: "/api/gmail",
  router: gmailRouter,
  // Decidimos auth rota a rota (o callback do Google é público).
  protected: false,
};

export default gmailModule;
