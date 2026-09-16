/**
 * Utilitários para parsing e validação temporal de publicações do LinkedIn.
 * Garante que apenas publicações dentro da janela configurada (ex: 24h) sejam aceitas.
 */

export interface InfoDataPublicacao {
  dataEstimada: Date;
  dentroDaJanela: boolean;
  idadeEmHoras: number;
  textoOriginal: string;
}

/**
 * Avalia a data de publicação a partir de atributo datetime (se houver) ou texto relativo ("1h", "2d", etc.)
 *
 * @param textoRelativo Texto relativo exibido no LinkedIn (ex: "3 h", "5 min", "1 d", "2 d")
 * @param datetimeAttr Atributo datetime de tag <time> (se disponível)
 * @param maxHoras Janela máxima permitida em horas (default: 24h)
 */
export function avaliarIdadePublicacao(
  textoRelativo = "",
  datetimeAttr = "",
  maxHoras = 24,
): InfoDataPublicacao {
  const agora = Date.now();

  // 1. Se houver atributo datetime ISO válido na tag <time>
  if (datetimeAttr && datetimeAttr.trim()) {
    const dt = new Date(datetimeAttr.trim());
    if (!isNaN(dt.getTime())) {
      const idadeMs = Math.max(0, agora - dt.getTime());
      const idadeEmHoras = Math.round((idadeMs / (1000 * 60 * 60)) * 10) / 10;
      return {
        dataEstimada: dt,
        dentroDaJanela: idadeEmHoras <= maxHoras,
        idadeEmHoras,
        textoOriginal: datetimeAttr,
      };
    }
  }

  // 2. Parser semântico de texto relativo (pt-BR e en-US)
  // Remove diacríticos para evitar ambiguidades com fronteiras de palavra (\b)
  const limpo = (textoRelativo || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  // ── A. Unidades Maiores (Avaliadas Primeiro para Evitar Colisão de Prefixo) ──

  // Anos (definitivamente > 24h)
  const matchAno = limpo.match(/(\d+)\s*(?:ano[s]?|y|year[s]?)\b/i);
  if (matchAno && matchAno[1]) {
    const anos = parseInt(matchAno[1], 10);
    const idadeHoras = anos * 365 * 24;
    return {
      dataEstimada: new Date(agora - anos * 365 * 24 * 60 * 60 * 1000),
      dentroDaJanela: false,
      idadeEmHoras: idadeHoras,
      textoOriginal: textoRelativo,
    };
  }

  // Meses (definitivamente > 24h)
  const matchMes = limpo.match(/(\d+)\s*(?:mes(?:es)?|mo|month[s]?)\b/i);
  if (matchMes && matchMes[1]) {
    const mes = parseInt(matchMes[1], 10);
    const idadeHoras = mes * 30 * 24;
    return {
      dataEstimada: new Date(agora - mes * 30 * 24 * 60 * 60 * 1000),
      dentroDaJanela: false,
      idadeEmHoras: idadeHoras,
      textoOriginal: textoRelativo,
    };
  }

  // Semanas (definitivamente > 24h)
  const matchSem = limpo.match(/(\d+)\s*(?:sem|semana[s]?|w|week[s]?)\b/i);
  if (matchSem && matchSem[1]) {
    const sem = parseInt(matchSem[1], 10);
    const idadeHoras = sem * 7 * 24;
    return {
      dataEstimada: new Date(agora - sem * 7 * 24 * 60 * 60 * 1000),
      dentroDaJanela: false,
      idadeEmHoras: idadeHoras,
      textoOriginal: textoRelativo,
    };
  }

  // Ontem
  if (/\b(?:ontem|yesterday)\b/i.test(limpo)) {
    return {
      dataEstimada: new Date(agora - 24 * 60 * 60 * 1000),
      dentroDaJanela: maxHoras >= 24,
      idadeEmHoras: 24,
      textoOriginal: textoRelativo,
    };
  }

  // Dias
  const matchDias = limpo.match(/(\d+)\s*(?:d|dia[s]?)\b/i);
  if (matchDias && matchDias[1]) {
    const dias = parseInt(matchDias[1], 10);
    const idadeHoras = dias * 24;
    return {
      dataEstimada: new Date(agora - dias * 24 * 60 * 60 * 1000),
      dentroDaJanela: dias <= 1 && idadeHoras <= maxHoras,
      idadeEmHoras: idadeHoras,
      textoOriginal: textoRelativo,
    };
  }

  // ── B. Unidades Menores (Horas, Minutos, Segundos) ──

  // Horas
  const matchHoras = limpo.match(/(\d+)\s*(?:h|hora[s]?)\b/i);
  if (matchHoras && matchHoras[1]) {
    const horas = parseInt(matchHoras[1], 10);
    return {
      dataEstimada: new Date(agora - horas * 60 * 60 * 1000),
      dentroDaJanela: horas <= maxHoras,
      idadeEmHoras: horas,
      textoOriginal: textoRelativo,
    };
  }

  // Minutos / Segundos / Agora
  if (
    /\b(?:agora|just\s+now|poucos\s+segundos|moments\s+ago)\b/i.test(limpo) ||
    /(\d+)\s*(?:s|seg|segundos?)\b/i.test(limpo)
  ) {
    return {
      dataEstimada: new Date(agora),
      dentroDaJanela: true,
      idadeEmHoras: 0.1,
      textoOriginal: textoRelativo,
    };
  }

  const matchMin = limpo.match(/(\d+)\s*(?:m|min|minutos?)\b/i);
  if (matchMin && matchMin[1]) {
    const mins = parseInt(matchMin[1], 10);
    const idadeHoras = Math.round((mins / 60) * 10) / 10;
    return {
      dataEstimada: new Date(agora - mins * 60 * 1000),
      dentroDaJanela: idadeHoras <= maxHoras,
      idadeEmHoras: idadeHoras,
      textoOriginal: textoRelativo,
    };
  }

  // Se não foi possível identificar texto de data (ex: formato desconhecido)
  return {
    dataEstimada: new Date(agora),
    dentroDaJanela: true, // Conservador: não descarta se não tiver evidência de ser antigo
    idadeEmHoras: 0,
    textoOriginal: textoRelativo,
  };
}
