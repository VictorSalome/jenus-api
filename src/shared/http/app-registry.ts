import type { Express, RequestHandler } from "express";
import { requireAuth } from "../auth/auth.middleware.js";

/**
 * Contrato que toda aplicação plugável do backend deve exportar a partir
 * do seu `index.ts`. `router` pode ser um `express.Router()` (agregador de
 * rotas simples) ou um `express.Application` completo com pipeline de
 * middlewares próprio (como o app de curriculos hoje) — ambos são aceitos
 * por `app.use(prefix, router)`.
 */
export interface AppModule {
  name: string;
  prefix: string;
  router: RequestHandler;
  /** Rotas públicas, montadas ANTES do requireAuth (ex.: preview de PDF). */
  publicRouter?: RequestHandler;
  /**
   * Se `false`, `registerApp` NÃO aplica `requireAuth` no ponto de montagem
   * — o app decide auth rota a rota internamente (é o caso do promo hoje,
   * que tem endpoints públicos como `/deploy/*`). Default: `true`.
   */
  protected?: boolean;
}

/**
 * Monta uma aplicação no app Express raiz sob seu prefixo. Por padrão
 * aplica requireAuth a tudo exceto o publicRouter; apps com
 * `protected: false` cuidam de auth internamente, rota a rota.
 */
export const registerApp = (app: Express, mod: AppModule): void => {
  if (mod.publicRouter) {
    app.use(mod.prefix, mod.publicRouter);
  }
  if (mod.protected === false) {
    app.use(mod.prefix, mod.router);
  } else {
    app.use(mod.prefix, requireAuth, mod.router);
  }
};
