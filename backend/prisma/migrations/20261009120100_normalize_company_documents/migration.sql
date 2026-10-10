-- Padroniza CPF/CNPJ gravando somente os dígitos (ex.: "12.345.678/0001-90" -> "12345678000190").
-- Segurança dos dados:
--   * não apaga nenhuma empresa nem altera relações (grupos, campanhas, histórico usam o id);
--   * se duas empresas tiverem o mesmo documento em formatos diferentes, só UMA é padronizada
--     (a que já está só com dígitos, senão a mais antiga) para nunca violar a restrição de unicidade;
--     a outra permanece como está para você revisar manualmente.

-- 1) Documentos que contêm apenas pontuação/espaços (sem nenhum dígito) viram NULL.
UPDATE "companies"
SET "document" = NULL
WHERE "document" IS NOT NULL
  AND regexp_replace("document", '[^0-9]', '', 'g') = '';

-- 2) Remove a máscara dos demais, evitando colisões.
WITH ranked AS (
  SELECT
    "id",
    regexp_replace("document", '[^0-9]', '', 'g') AS digits,
    row_number() OVER (
      PARTITION BY regexp_replace("document", '[^0-9]', '', 'g')
      ORDER BY ("document" = regexp_replace("document", '[^0-9]', '', 'g')) DESC, "created_at" ASC, "id" ASC
    ) AS rn
  FROM "companies"
  WHERE "document" IS NOT NULL
)
UPDATE "companies" AS c
SET "document" = r.digits
FROM ranked AS r
WHERE c."id" = r."id"
  AND r.rn = 1
  AND c."document" <> r.digits;
