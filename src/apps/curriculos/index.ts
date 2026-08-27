import curriculosApp, { pdfPreviewRouter } from "./server.js";
import type { AppModule } from "../../shared/http/app-registry.js";

const curriculosModule: AppModule = {
  name: "curriculos",
  prefix: "/api/curriculo",
  router: curriculosApp,
  publicRouter: pdfPreviewRouter,
};

export default curriculosModule;
