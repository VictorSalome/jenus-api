import { getDb } from "../../../core/database.js";
import { logInfo } from "../shared/utils/logger.js";

export interface SourceField {
  key: string;
  label: string;
  envFallback?: string;
}

export interface SourceDefinition {
  id: string;
  name: string;
  requiresCredentials: boolean;
  fields: SourceField[];
  /** Página onde o usuário consegue as credenciais (login/cadastro na plataforma). */
  obtainUrl: string | null;
}

/**
 * Fontes de vagas conhecidas pelo sistema. Sources sem credenciais (a
 * maioria) só podem ser ligadas/desligadas; a Adzuna é a única que hoje
 * exige uma conta (grátis) na plataforma para funcionar.
 */
export const SOURCES_REGISTRY: SourceDefinition[] = [
  { id: "jobicy", name: "Jobicy", requiresCredentials: false, fields: [], obtainUrl: null },
  { id: "arbeitnow", name: "Arbeitnow", requiresCredentials: false, fields: [], obtainUrl: null },
  { id: "remotive", name: "Remotive", requiresCredentials: false, fields: [], obtainUrl: null },
  { id: "remoteok", name: "RemoteOK", requiresCredentials: false, fields: [], obtainUrl: null },
  { id: "themuse", name: "The Muse", requiresCredentials: false, fields: [], obtainUrl: null },
  {
    id: "adzuna",
    name: "Adzuna",
    requiresCredentials: true,
    fields: [
      { key: "appId", label: "App ID", envFallback: "ADZUNA_APP_ID" },
      { key: "appKey", label: "App Key", envFallback: "ADZUNA_APP_KEY" },
    ],
    obtainUrl: "https://developer.adzuna.com/",
  },
];

interface StoredSettings {
  enabled: boolean;
  credentials: Record<string, string>;
}

const DEFAULT_SETTINGS: StoredSettings = { enabled: true, credentials: {} };

const carregarLinha = async (source: string): Promise<StoredSettings> => {
  const db = await getDb();
  const row = await db.get(
    "SELECT enabled, credentials_json FROM curriculo_source_settings WHERE source = ?",
    source,
  );
  if (!row) return { ...DEFAULT_SETTINGS };

  return {
    enabled: !!row.enabled,
    credentials: row.credentials_json ? JSON.parse(row.credentials_json) : {},
  };
};

/**
 * Valor efetivo de uma credencial: o que foi salvo pelo app tem prioridade;
 * se não houver, cai para a variável de ambiente (compatibilidade com quem
 * configurou via .env antes dessa tela existir).
 */
export const getEffectiveCredentials = async (sourceId: string): Promise<Record<string, string>> => {
  const definicao = SOURCES_REGISTRY.find((s) => s.id === sourceId);
  if (!definicao || definicao.fields.length === 0) return {};

  const settings = await carregarLinha(sourceId);
  const efetivas: Record<string, string> = {};

  definicao.fields.forEach((field) => {
    const salva = settings.credentials[field.key];
    const doAmbiente = field.envFallback ? process.env[field.envFallback] : undefined;
    if (salva) efetivas[field.key] = salva;
    else if (doAmbiente) efetivas[field.key] = doAmbiente;
  });

  return efetivas;
};

export const isSourceEnabled = async (sourceId: string): Promise<boolean> => {
  const settings = await carregarLinha(sourceId);
  return settings.enabled;
};

const mascarar = (valor: string): string => {
  if (valor.length <= 4) return "*".repeat(valor.length);
  return `${"*".repeat(valor.length - 4)}${valor.slice(-4)}`;
};

/**
 * Lista todas as fontes com status pronto para exibição no app: se estão
 * ligadas, se têm credenciais configuradas (sem nunca expor o valor cheio).
 */
export const listarFontesComStatus = async () => {
  const resultado = [];

  for (const definicao of SOURCES_REGISTRY) {
    const settings = await carregarLinha(definicao.id);
    const efetivas = await getEffectiveCredentials(definicao.id);

    resultado.push({
      id: definicao.id,
      name: definicao.name,
      requiresCredentials: definicao.requiresCredentials,
      obtainUrl: definicao.obtainUrl,
      enabled: settings.enabled,
      configured: definicao.requiresCredentials
        ? definicao.fields.every((f) => !!efetivas[f.key])
        : true,
      fields: definicao.fields.map((f) => ({
        key: f.key,
        label: f.label,
        hasValue: !!efetivas[f.key],
        masked: efetivas[f.key] ? mascarar(efetivas[f.key]) : null,
      })),
    });
  }

  return resultado;
};

export const salvarConfiguracaoFonte = async (
  sourceId: string,
  { enabled, credentials }: { enabled?: boolean; credentials?: Record<string, string> },
): Promise<void> => {
  const definicao = SOURCES_REGISTRY.find((s) => s.id === sourceId);
  if (!definicao) throw new Error(`Fonte desconhecida: ${sourceId}`);

  const atual = await carregarLinha(sourceId);
  const novoEnabled = enabled === undefined ? atual.enabled : enabled;

  const camposValidos = new Set(definicao.fields.map((f) => f.key));
  const novasCredenciais = { ...atual.credentials };
  if (credentials) {
    Object.entries(credentials).forEach(([key, value]) => {
      if (!camposValidos.has(key)) return;
      if (value === "" || value === null || value === undefined) {
        delete novasCredenciais[key];
      } else {
        novasCredenciais[key] = value;
      }
    });
  }

  const db = await getDb();
  await db.run(
    `INSERT INTO curriculo_source_settings (source, enabled, credentials_json, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(source) DO UPDATE SET
       enabled = excluded.enabled,
       credentials_json = excluded.credentials_json,
       updated_at = CURRENT_TIMESTAMP`,
    sourceId,
    novoEnabled ? 1 : 0,
    JSON.stringify(novasCredenciais),
  );

  logInfo("Configuração de fonte de vagas atualizada", { source: sourceId, enabled: novoEnabled });
};
