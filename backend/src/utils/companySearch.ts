/**
 * Busca de empresas no PostgreSQL.
 *
 *  - Tolerante a maiúsculas/minúsculas, acentos e espaços extras (usa apenas funções
 *    nativas do PostgreSQL: translate/lower/regexp_replace — não exige extensões).
 *  - CNPJ/CPF: compara somente os dígitos, então "12.345.678/0001-90" e "12345678000190"
 *    encontram a mesma empresa (mesmo para registros antigos gravados com pontuação).
 *  - Retorna só IDs + total, paginado; o chamador carrega os dados completos por ID.
 */
import { sqltag as sql, join, raw, Sql } from '@prisma/client/runtime/library';
import { prisma } from './db';
import { onlyDigits } from './document';

const FROM_CHARS = 'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const TO_CHARS = 'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN';

const FOLD_MAP: Record<string, string> = {};
for (let i = 0; i < FROM_CHARS.length; i++) FOLD_MAP[FROM_CHARS[i]] = TO_CHARS[i];

/** Mesma normalização que o SQL aplica nas colunas: sem acento, minúsculo, espaços colapsados. */
export function foldText(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  let out = '';
  for (const ch of s) out += FOLD_MAP[ch] ?? ch;
  return out.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface CompanySearchFilters {
  search?: string;
  name?: string;
  companyName?: string;
  document?: string;
  email?: string;
  phone?: string;
  city?: string;
  neighborhood?: string;
  state?: string;
  groupId?: string;
  minOverdueAmount?: number | string;
  maxOverdueAmount?: number | string;
  minPaidAmount?: number | string;
  maxPaidAmount?: number | string;
  minDueAmount?: number | string;
  maxDueAmount?: number | string;
}

export interface CompanySearchOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

// Colunas fixas (nunca vêm do usuário), por isso podem ser interpoladas como SQL bruto.
const foldColumn = (column: string): Sql =>
  raw(
    `btrim(regexp_replace(lower(translate(coalesce(${column}, ''), '${FROM_CHARS}', '${TO_CHARS}')), '[[:space:]]+', ' ', 'g'))`
  );

const digitsColumn = (column: string): Sql => raw(`regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g')`);

const textContains = (column: string, term: string): Sql => sql`strpos(${foldColumn(column)}, ${foldText(term)}) > 0`;

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());

const toNumber = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function hasAnyFilter(filters: CompanySearchFilters): boolean {
  return (['search', 'name', 'companyName', 'document', 'email', 'phone', 'city', 'neighborhood', 'state', 'groupId'] as const).some(
    (k) => clean(filters[k]) !== ''
  );
}

export function buildWhere(filters: CompanySearchFilters): Sql {
  const conds: Sql[] = [];

  const search = clean(filters.search);
  if (search) {
    const parts: Sql[] = ['name', 'company_name', 'email', 'city', 'neighborhood', 'state'].map((c) => textContains(c, search));
    const digits = onlyDigits(search);
    if (digits.length >= 3) parts.push(sql`strpos(${digitsColumn('document')}, ${digits}) > 0`);
    conds.push(sql`(${join(parts, ' OR ')})`);
  }

  const simple: Array<[keyof CompanySearchFilters, string]> = [
    ['name', 'name'],
    ['companyName', 'company_name'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['city', 'city'],
    ['neighborhood', 'neighborhood'],
    ['state', 'state'],
  ];
  for (const [key, column] of simple) {
    const term = clean(filters[key]);
    if (term) conds.push(textContains(column, term));
  }

  const documentTerm = clean(filters.document);
  if (documentTerm) {
    const digits = onlyDigits(documentTerm);
    // Termo sem nenhum dígito nunca casa com um documento.
    conds.push(digits ? sql`strpos(${digitsColumn('document')}, ${digits}) > 0` : sql`FALSE`);
  }

  const groupId = clean(filters.groupId);
  if (groupId) {
    conds.push(sql`EXISTS (SELECT 1 FROM company_groups cg WHERE cg.company_id = companies.id AND cg.group_id = ${groupId})`);
  }

  const ranges: Array<[string, unknown, unknown]> = [
    ['overdue_amount', filters.minOverdueAmount, filters.maxOverdueAmount],
    ['paid_amount', filters.minPaidAmount, filters.maxPaidAmount],
    ['due_amount', filters.minDueAmount, filters.maxDueAmount],
  ];
  for (const [column, min, max] of ranges) {
    const lo = toNumber(min);
    const hi = toNumber(max);
    if (lo !== undefined) conds.push(sql`${raw(column)} >= ${lo}`);
    if (hi !== undefined) conds.push(sql`${raw(column)} <= ${hi}`);
  }

  return conds.length ? join(conds, ' AND ') : sql`TRUE`;
}

const SORT_COLUMNS: Record<string, { column: string; fold?: boolean }> = {
  createdAt: { column: 'created_at' },
  updatedAt: { column: 'updated_at' },
  name: { column: 'name', fold: true },
  companyName: { column: 'company_name', fold: true },
  email: { column: 'email' },
  city: { column: 'city', fold: true },
  neighborhood: { column: 'neighborhood', fold: true },
  state: { column: 'state' },
  document: { column: 'document' },
  overdueAmount: { column: 'overdue_amount' },
  paidAmount: { column: 'paid_amount' },
  dueAmount: { column: 'due_amount' },
};

function buildOrderBy(sortBy?: string, sortOrder?: string): Sql {
  const spec = SORT_COLUMNS[sortBy || ''] || SORT_COLUMNS.createdAt;
  const direction = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const expr = spec.fold ? foldColumn(spec.column) : raw(spec.column);
  return sql`ORDER BY ${expr} ${raw(direction)} NULLS LAST, id ASC`;
}

export async function searchCompanyIds(
  filters: CompanySearchFilters,
  options: CompanySearchOptions = {}
): Promise<{ ids: string[]; total: number }> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 20));
  const where = buildWhere(filters);

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>(
      sql`SELECT id FROM companies WHERE ${where} ${buildOrderBy(options.sortBy, options.sortOrder)} LIMIT ${limit} OFFSET ${(page - 1) * limit}`
    ),
    prisma.$queryRaw<Array<{ total: number }>>(sql`SELECT count(*)::int AS total FROM companies WHERE ${where}`),
  ]);

  return { ids: rows.map((r) => r.id), total: Number(totalRows[0]?.total ?? 0) };
}

/** Todos os IDs que atendem aos filtros (usado em exportação e "adicionar por filtro"). */
export async function findAllCompanyIds(filters: CompanySearchFilters, max = 50000): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    sql`SELECT id FROM companies WHERE ${buildWhere(filters)} ORDER BY id ASC LIMIT ${max}`
  );
  return rows.map((r) => r.id);
}

/** Empresa que já usa este documento (comparando só os dígitos, mesmo em registros antigos com máscara). */
export async function findCompanyByDocument(digits: string, excludeId?: string): Promise<{ id: string; name: string } | null> {
  if (!digits) return null;
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string }>>(
    sql`SELECT id, name FROM companies
        WHERE document IS NOT NULL AND ${digitsColumn('document')} = ${digits}
        ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
        LIMIT 1`
  );
  return rows[0] ?? null;
}

/** Mapa documento(dígitos) -> empresa existente, para detectar duplicidades em lote. */
export async function findCompaniesByDocuments(digitsList: string[]): Promise<Map<string, { id: string; name: string }>> {
  const result = new Map<string, { id: string; name: string }>();
  const unique = Array.from(new Set(digitsList.filter(Boolean)));
  const CHUNK = 5000;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await prisma.$queryRaw<Array<{ id: string; name: string; digits: string }>>(
      sql`SELECT id, name, ${digitsColumn('document')} AS digits FROM companies
          WHERE document IS NOT NULL AND ${digitsColumn('document')} IN (${join(chunk)})`
    );
    for (const r of rows) if (!result.has(r.digits)) result.set(r.digits, { id: r.id, name: r.name });
  }
  return result;
}
