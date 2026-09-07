import type { AppModule } from "../../shared/http/app-registry.js";
import financasRouter from "./routes/financas.routes.js";
import publicRouter from "./routes/public.routes.js";

const financasModule: AppModule = {
  name: "financas",
  prefix: "/api/financas",
  publicRouter,
  router: financasRouter,
  protected: true,
};

export default financasModule;