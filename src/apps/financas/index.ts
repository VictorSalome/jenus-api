import type { AppModule } from "../../shared/http/app-registry.js";
import financasRouter from "./routes/financas.routes.js";

const financasModule: AppModule = {
  name: "financas",
  prefix: "/api/financas",
  router: financasRouter,
  protected: true,
};

export default financasModule;