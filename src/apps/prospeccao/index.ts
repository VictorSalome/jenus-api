import type { AppModule } from "../../shared/http/app-registry.js";
import prospeccaoRouter from "./routes/prospeccao.routes.js";
import prospeccaoConfig from "./config.js";
import { iniciarScheduler } from "./services/scheduler.service.js";

if (prospeccaoConfig.PROSPECCAO_AUTO_START) {
  iniciarScheduler();
}

const prospeccaoModule: AppModule = {
  name: "prospeccao",
  prefix: "/api/prospeccao",
  router: prospeccaoRouter,
  protected: false,
};

export default prospeccaoModule;
