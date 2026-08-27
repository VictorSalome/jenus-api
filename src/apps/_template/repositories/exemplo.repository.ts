import { getDb } from "../../../core/database.js";

/**
 * Camada de acesso a dados desta app — SQL cru aqui, nunca em
 * controllers/services. Sempre use o nome de tabela prefixado
 * (`template_exemplo`, não `exemplo`).
 *
 * TODO: renomeie o arquivo/tabela e ajuste os campos reais.
 */

export const findAll = async () => {
  const db = await getDb();
  return db.all("SELECT * FROM template_exemplo ORDER BY created_at DESC");
};

export const create = async (nome: string) => {
  const db = await getDb();
  const result = await db.run(
    "INSERT INTO template_exemplo (nome) VALUES (?)",
    nome,
  );
  return result.lastID;
};
