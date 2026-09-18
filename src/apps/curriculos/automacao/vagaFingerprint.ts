import crypto from "crypto";

const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "yahoo.com.br",
  "bol.com.br",
  "uol.com.br",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "zoho.com",
]);

const GENERIC_COMPANIES = new Set([
  "confidencial",
  "empresa confidencial",
  "nao especificado",
  "nao informado",
  "indisponivel",
  "rh",
  "recrutamento",
  "consultoria",
  "ti",
  "tecnologia",
  "anonimo",
]);

/**
 * Remove acentos e normaliza string para minúsculo
 */
export function normalizarTexto(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Normaliza e-mail para formato canônico
 */
export function normalizarEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/**
 * Normaliza o nome da empresa ou infere pelo domínio corporativo do e-mail
 */
export function normalizarEmpresa(empresa: string, email: string): string {
  const empNorm = normalizarTexto(empresa)
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(
      /\b(ltda|sa|s\/a|s\.a|eireli|me|epb|consultoria|servicos|tecnologia|sistemas|solutions|solucoes|brasil|do brasil|group|grupo|inc|corp|llc)\b/g,
      "",
    )
    .trim();

  const isGeneric = !empNorm || GENERIC_COMPANIES.has(empNorm);

  if (isGeneric && email && email.includes("@")) {
    const domain = email.split("@")[1]?.trim().toLowerCase() || "";
    if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
      // Ex: sarah@glc.digital -> glc.digital, juliana@actdigital.com -> actdigital.com
      return domain.replace(/\.[a-z.]+$/, "").replace(/[^a-z0-9]/g, "");
    }
  }

  return empNorm || "confidencial";
}

/**
 * Normaliza o cargo da vaga, removendo ruídos de contratação/localização
 * e extraindo as tecnologias principais e a senioridade para formar a chave canônica.
 */
export function extrairChaveCanonicaCargo(titulo: string): string {
  let t = normalizarTexto(titulo);

  // 1. Remove conteúdos entre parênteses e colchetes (ex: "(PJ)", "[100% Remoto]", "(Node / TS)")
  // Mas antes, vamos extrair o texto de dentro para checar se continha techs cruciais
  const parentesesMatches = t.match(/\(([^)]+)\)|\[([^\]]+)\]/g) || [];
  const parentesesText = parentesesMatches.join(" ");

  // Remove parênteses e colchetes do texto principal
  t = t.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");

  // Remove ruídos clássicos de anúncios de emprego
  t = t.replace(
    /\b(vaga de|oportunidade de|oportunidade|banco de talentos|vaga|programa de|afafirmativa|exclusiva para|pcd|mulheres|50\+|urgente|imediato)\b/g,
    " ",
  );
  t = t.replace(
    /\b(remoto|100% remoto|totalmente remoto|home office|hibrido|presencial|sp|rj|bh|brasil|clt|pj|cooperado|temporario|efetivo)\b/g,
    " ",
  );

  const textoCompleto = `${t} ${parentesesText}`;

  // 2. Extrair Senioridade
  let senioridade = "pl"; // Padrão
  if (/\b(senior|sr|sr\.|especialista|specialist|principal|staff|lead|tech lead|lider)\b/.test(textoCompleto)) {
    senioridade = "sr";
  } else if (/\b(junior|jr|jr\.|trainee|iniciante)\b/.test(textoCompleto)) {
    senioridade = "jr";
  } else if (/\b(estagio|estagiario|estagiaria|intern)\b/.test(textoCompleto)) {
    senioridade = "intern";
  } else if (/\b(pleno|pl|pl\.)\b/.test(textoCompleto)) {
    senioridade = "pl";
  }

  // 3. Extrair Categoria / Papel Principal
  let papel = "dev";
  if (/\b(qa|qualidade|tester|testes|sdet)\b/.test(textoCompleto)) {
    papel = "qa";
  } else if (/\b(devops|sre|infraestrutura|infra|cloud)\b/.test(textoCompleto)) {
    papel = "devops";
  } else if (/\b(arquiteto|architect)\b/.test(textoCompleto)) {
    papel = "arquiteto";
  } else if (/\b(dados|data|cientista de dados|data scientist|data engineer|bi|dba)\b/.test(textoCompleto)) {
    papel = "dados";
  } else if (/\b(ux|ui|product designer|designer)\b/.test(textoCompleto)) {
    papel = "design";
  } else if (/\b(analista de sistemas|consultor|consultora|business analyst|analista funcional|analista)\b/.test(textoCompleto)) {
    papel = "analista";
  } else if (/\b(scrum|agilista|product owner|po|product manager|pm)\b/.test(textoCompleto)) {
    papel = "produto";
  }

  // 4. Extrair Techs Chave
  const techsIdentificadas = new Set<string>();

  const mapTechs: Array<{ regex: RegExp; key: string }> = [
    { regex: /\b(react native|react-native)\b/, key: "react_native" },
    { regex: /\b(react|reactjs|react\.js)\b/, key: "react" },
    { regex: /\b(next|nextjs|next\.js)\b/, key: "next" },
    { regex: /\b(vue|vuejs|vue\.js)\b/, key: "vue" },
    { regex: /\b(angular|angularjs)\b/, key: "angular" },
    { regex: /\b(node|nodejs|node\.js)\b/, key: "node" },
    { regex: /\b(typescript|ts)\b/, key: "typescript" },
    { regex: /\b(javascript|js)\b/, key: "javascript" },
    { regex: /\b(python|django|fastapi|flask)\b/, key: "python" },
    { regex: /\b(java|spring|spring boot)\b/, key: "java" },
    { regex: /\b(c#|csharp|c-sharp|\.net|dotnet|asp\.net)\b/, key: "dotnet" },
    { regex: /\b(php|laravel|symfony)\b/, key: "php" },
    { regex: /\b(golang|go)\b/, key: "go" },
    { regex: /\b(ruby|rails|ruby on rails)\b/, key: "ruby" },
    { regex: /\b(flutter)\b/, key: "flutter" },
    { regex: /\b(ios|swift)\b/, key: "ios" },
    { regex: /\b(android|kotlin)\b/, key: "android" },
    { regex: /\b(fullstack|full stack|full-stack)\b/, key: "fullstack" },
    { regex: /\b(backend|back-end|back end)\b/, key: "backend" },
    { regex: /\b(frontend|front-end|front end)\b/, key: "frontend" },
    { regex: /\b(mobile)\b/, key: "mobile" },
    { regex: /\b(salesforce)\b/, key: "salesforce" },
    { regex: /\b(sap)\b/, key: "sap" },
    { regex: /\b(totvs|protheus)\b/, key: "totvs" },
    { regex: /\b(mv)\b/, key: "mv" },
    { regex: /\b(ia|ai|inteligencia artificial|machine learning|llm)\b/, key: "ia" },
  ];

  for (const { regex, key } of mapTechs) {
    if (regex.test(textoCompleto)) {
      techsIdentificadas.add(key);
    }
  }

  // Se não identificou nenhuma tecnologia, usar os termos limpos relevantes do título
  if (techsIdentificadas.size === 0) {
    const tokens = t
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((tok) => tok.length > 2 && !["para", "com", "sem", "que", "por", "dos", "das", "uma", "uns"].includes(tok))
      .slice(0, 3);
    tokens.forEach((tok) => techsIdentificadas.add(tok));
  }

  const sortedTechs = Array.from(techsIdentificadas).sort().join("_");
  return `${papel}_${senioridade}_${sortedTechs || "geral"}`;
}

/**
 * Gera um Fingerprint Criptográfico Canônico para a oportunidade.
 * 
 * Garante que:
 * 1. O mesmo anúncio republicado com IDs ou slugs diferentes seja detectado como duplicata.
 * 2. Variações estéticas de título (ex: com ou sem "(PJ)", com ou sem "(Remoto)") gerem a mesma chave.
 * 3. Oportunidades REALMENTE diferentes do mesmo recrutador (ex: Java vs React vs .NET) tenham fingerprints distintos.
 */
export function gerarFingerprintVaga(
  email: string,
  empresa: string,
  titulo: string,
  _sourceUrl?: string,
): string {
  const emailNorm = normalizarEmail(email);
  const empresaNorm = normalizarEmpresa(empresa, emailNorm);
  const cargoCanonico = extrairChaveCanonicaCargo(titulo);

  const rawKey = `${emailNorm}|${empresaNorm}|${cargoCanonico}`;
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}
