import type { AppModule } from "../../shared/http/app-registry.js";
import systemRouter from "./system.routes.js";

const systemModule: AppModule = {
  name: "system",
  prefix: "/api/system",
  router: systemRouter,
  protected: true,
};

export default systemModule;
