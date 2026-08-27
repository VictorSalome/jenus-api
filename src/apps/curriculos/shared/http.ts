import axios from "axios";

/**
 * Instância HTTP compartilhada para chamadas externas
 * Configurada com timeouts, retries e headers padrão
 */
const http = axios.create({
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "User-Agent": "CurriculosBot/1.0",
  },
});

// Interceptor: retry em erros de rede
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error.config;
    if (!config || config.__retries >= 2) return Promise.reject(error);

    config.__retries = (config.__retries || 0) + 1;
    const delay = config.__retries * 1000;

    await new Promise((r) => setTimeout(r, delay));
    return http(config);
  },
);

export interface HttpResponse<T = any> {
  ok: boolean;
  data?: T;
  status: number;
  error?: string;
}

/**
 * GET com tratamento de erro padronizado
 */
export const httpGet = async <T = any>(url: string, params: Record<string, any> = {}): Promise<HttpResponse<T>> => {
  try {
    const res = await http.get(url, { params });
    return { ok: true, data: res.data, status: res.status };
  } catch (err: any) {
    const msg =
      err.response?.data?.message || err.message || "Erro na requisição";
    const status = err.response?.status || 0;
    return { ok: false, error: msg, status };
  }
};

/**
 * POST com tratamento de erro padronizado
 */
export const httpPost = async <T = any>(url: string, body: Record<string, any> = {}, headers: Record<string, string> = {}): Promise<HttpResponse<T>> => {
  try {
    const res = await http.post(url, body, { headers });
    return { ok: true, data: res.data, status: res.status };
  } catch (err: any) {
    const msg =
      err.response?.data?.message || err.message || "Erro na requisição";
    const status = err.response?.status || 0;
    return { ok: false, error: msg, status };
  }
};

export default http;