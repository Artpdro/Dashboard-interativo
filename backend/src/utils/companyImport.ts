/**
 * Importação de empresas (.xls, .xlsx, .csv):
 *   1) preview  -> colunas encontradas + mapeamento sugerido
 *   2) analyze  -> validação linha a linha, duplicidades (por CNPJ/CPF normalizado), resumo
 *   3) execute  -> gravação em UMA transação (tudo ou nada); duplicados: ignorar ou atualizar
 */
import { prisma } from './db';
import { AppError } from './errorHandler';
import { ParsedSheet } from './spreadsheet';
import { sanitizeCompanyInput } from './companyData';
import { findCompaniesByDocuments } from './companySearch';
import { splitEmails, uniqueEmails } from './emailSender';
import { formatDocument } from './document';

export type ImportFieldKey =
  | 'name'
  | 'companyName'
  | 'document'
  | 'email'
  | 'additionalEmails'
  | 'phone'
  | 'landline'
  | 'street'
  | 'number'
  | 'complement'
  | 'neighborhood'
  | 'city'
  | 'zipCode'
  | 'state'
  | 'overdueAmount'
  | 'paidAmount'
  | 'dueAmount';

export interface ImportField {
  key: ImportFieldKey;
  label: string;
  required?: boolean;
  /** Nomes de cabeçalho conhecidos, já normalizados (sem acento/pontuação, minúsculos). */
  synonyms: string[];
}

export const IMPORT_FIELDS: ImportField[] = [
  { key: 'name', label: 'Nome empresarial', required: true, synonyms: ['nome', 'name', 'razao social', 'nome empresarial', 'razao', 'nome da empresa'] },
  { key: 'document', label: 'CNPJ / CPF', synonyms: ['cpf ou cnpj', 'cpf cnpj', 'cnpj cpf', 'cnpj', 'cpf', 'documento', 'document', 'cnpj ou cpf'] },
  { key: 'companyName', label: 'Empresa / Nome fantasia', synonyms: ['empresa', 'company', 'nome fantasia', 'fantasia'] },
  { key: 'email', label: 'E-mail', synonyms: ['email', 'e mail', 'correio eletronico', 'email principal', 'e mail principal'] },
  { key: 'additionalEmails', label: 'E-mails adicionais', synonyms: ['emails adicionais', 'e mails adicionais', 'additional emails', 'email secundario', 'email 2', 'outros emails'] },
  { key: 'phone', label: 'Celular', synonyms: ['celular', 'cel', 'phone', 'telefone celular', 'whatsapp', 'movel'] },
  { key: 'landline', label: 'Telefone fixo', synonyms: ['fone', 'telefone', 'telefone fixo', 'fixo', 'landline', 'tel'] },
  { key: 'street', label: 'Endereço / Rua', synonyms: ['rua', 'street', 'logradouro', 'endereco'] },
  { key: 'number', label: 'Número', synonyms: ['numero', 'number', 'n', 'no', 'num', 'nr'] },
  { key: 'complement', label: 'Complemento', synonyms: ['complemento', 'complement'] },
  { key: 'neighborhood', label: 'Bairro', synonyms: ['bairro', 'neighborhood', 'distrito'] },
  { key: 'city', label: 'Cidade', synonyms: ['cidade', 'city', 'municipio', 'localidade'] },
  { key: 'zipCode', label: 'CEP', synonyms: ['cep', 'zip', 'zip code', 'codigo postal'] },
  { key: 'state', label: 'Estado (UF)', synonyms: ['estado', 'state', 'uf'] },
  { key: 'overdueAmount', label: 'Valor vencido', synonyms: ['valor vencido', 'overdue', 'vencido'] },
  { key: 'paidAmount', label: 'Valor pago', synonyms: ['valor pago', 'paid', 'pago'] },
  { key: 'dueAmount', label: 'Valor a vencer', synonyms: ['valor a vencer', 'due', 'a vencer'] },
];

export type ImportMapping = Record<ImportFieldKey, string>;

export const normalizeHeader = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const emptyMapping = (): ImportMapping =>
  Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, ''])) as ImportMapping;

/** Sugere a coluna de cada campo pelos nomes de cabeçalho conhecidos. */
export function suggestMapping(headers: string[]): ImportMapping {
  const mapping = emptyMapping();
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();

  // 1ª passada: igualdade exata com um nome conhecido.
  for (const field of IMPORT_FIELDS) {
    const idx = normalized.findIndex((h, i) => !used.has(i) && field.synonyms.includes(h));
    if (idx >= 0) {
      mapping[field.key] = headers[idx];
      used.add(idx);
    }
  }
  // 2ª passada: o cabeçalho contém, como palavra inteira, um nome conhecido (ex.: "Razão Social da Empresa").
  for (const field of IMPORT_FIELDS) {
    if (mapping[field.key]) continue;
    const idx = normalized.findIndex(
      (h, i) => !used.has(i) && field.synonyms.some((s) => s.length >= 4 && new RegExp(`(^| )${s}( |$)`).test(h))
    );
    if (idx >= 0) {
      mapping[field.key] = headers[idx];
      used.add(idx);
    }
  }
  return mapping;
}

/** Valida o mapeamento recebido do cliente contra os cabeçalhos reais do arquivo. */
export function resolveMapping(input: unknown, headers: string[]): ImportMapping {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch {
      throw new AppError('Mapeamento de colunas inválido.', 400, 'INVALID_MAPPING');
    }
  }
  if (parsed === undefined || parsed === null || parsed === '') return suggestMapping(headers);
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new AppError('Mapeamento de colunas inválido.', 400, 'INVALID_MAPPING');

  const source = parsed as Record<string, unknown>;
  const mapping = emptyMapping();
  const usedHeaders = new Set<string>();
  for (const field of IMPORT_FIELDS) {
    const header = source[field.key];
    if (typeof header !== 'string' || header === '') continue;
    if (!headers.includes(header)) {
      throw new AppError(`A coluna "${header}" não existe no arquivo.`, 400, 'INVALID_MAPPING');
    }
    if (usedHeaders.has(header)) {
      throw new AppError(`A coluna "${header}" foi associada a mais de um campo.`, 400, 'INVALID_MAPPING');
    }
    usedHeaders.add(header);
    mapping[field.key] = header;
  }
  if (!mapping.name && !mapping.companyName) {
    throw new AppError('Associe ao menos uma coluna ao campo "Nome empresarial" (ou "Empresa / Nome fantasia").', 400, 'MAPPING_REQUIRED');
  }
  return mapping;
}

export interface MappedRow {
  rowNumber: number;
  data: Record<string, unknown> | null;
  errors: string[];
  documentDigits: string | null;
}

export function mapRows(sheet: ParsedSheet, mapping: ImportMapping): MappedRow[] {
  const index = new Map(sheet.headers.map((h, i) => [h, i]));

  return sheet.rows.map((row, i) => {
    const cell = (key: ImportFieldKey): string => {
      const header = mapping[key];
      if (!header) return '';
      const idx = index.get(header);
      return idx === undefined ? '' : (row[idx] ?? '').trim();
    };

    const raw: Record<string, unknown> = {};
    raw.name = cell('name') || cell('companyName');

    const passthrough: ImportFieldKey[] = [
      'companyName', 'document', 'phone', 'landline', 'street', 'number', 'complement',
      'neighborhood', 'city', 'state', 'overdueAmount', 'paidAmount', 'dueAmount',
    ];
    for (const key of passthrough) {
      const v = cell(key);
      if (v) raw[key] = v;
    }

    // CEP lido como número perde o zero à esquerda (7 dígitos => 8).
    const zip = cell('zipCode');
    if (zip) raw.zipCode = /^\d{7}$/.test(zip) ? zip.padStart(8, '0') : zip;

    // Célula de e-mail com vários endereços: o primeiro é o principal, os demais vão para os adicionais.
    const emails = splitEmails(cell('email'));
    const extras = splitEmails(cell('additionalEmails'));
    if (emails.length) raw.email = emails[0];
    const additional = uniqueEmails([...emails.slice(1), ...extras]);
    if (additional.length) raw.additionalEmails = additional.join(', ');

    const { data, errors } = sanitizeCompanyInput(raw, { requireName: true });
    const documentDigits = typeof data.document === 'string' ? data.document : null;
    return { rowNumber: sheet.rowNumbers[i], data: errors.length ? null : data, errors, documentDigits };
  });
}

export type RowStatus = 'new' | 'duplicate_in_database' | 'duplicate_in_file' | 'invalid';

export interface AnalyzedRow extends MappedRow {
  status: RowStatus;
  existing?: { id: string; name: string };
}

export interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  newCount: number;
  duplicatesInDatabase: number;
  duplicatesInFile: number;
  withoutDocument: number;
}

export interface ImportAnalysis {
  rows: AnalyzedRow[];
  summary: ImportSummary;
}

export async function analyzeImport(sheet: ParsedSheet, mapping: ImportMapping): Promise<ImportAnalysis> {
  const mapped = mapRows(sheet, mapping);
  const existing = await findCompaniesByDocuments(
    mapped.filter((r) => !r.errors.length && r.documentDigits).map((r) => r.documentDigits as string)
  );

  const seen = new Set<string>();
  const summary: ImportSummary = {
    total: mapped.length,
    valid: 0,
    invalid: 0,
    newCount: 0,
    duplicatesInDatabase: 0,
    duplicatesInFile: 0,
    withoutDocument: 0,
  };

  const rows: AnalyzedRow[] = mapped.map((row) => {
    if (row.errors.length) {
      summary.invalid++;
      return { ...row, status: 'invalid' as const };
    }
    summary.valid++;
    const digits = row.documentDigits;
    if (!digits) {
      summary.withoutDocument++;
      summary.newCount++;
      return { ...row, status: 'new' as const };
    }
    if (seen.has(digits)) {
      summary.duplicatesInFile++;
      return { ...row, status: 'duplicate_in_file' as const };
    }
    seen.add(digits);
    const found = existing.get(digits);
    if (found) {
      summary.duplicatesInDatabase++;
      return { ...row, status: 'duplicate_in_database' as const, existing: found };
    }
    summary.newCount++;
    return { ...row, status: 'new' as const };
  });

  return { rows, summary };
}

/** Versão enxuta das linhas para mostrar na prévia/relatório (sem Decimal e sem excesso de dados). */
export function describeRow(row: AnalyzedRow) {
  const d = (row.data || {}) as Record<string, any>;
  return {
    row: row.rowNumber,
    status: row.status,
    errors: row.errors,
    name: d.name ?? '',
    document: row.documentDigits ? formatDocument(row.documentDigits) : '',
    email: d.email ?? '',
    city: d.city ?? '',
    neighborhood: d.neighborhood ?? '',
    existingName: row.existing?.name,
  };
}

export type DuplicateMode = 'skip' | 'update';

export interface ImportResult {
  total: number;
  added: number;
  updated: number;
  ignored: number;
  rejected: number;
  duplicatesInDatabase: number;
  duplicatesInFile: number;
  mode: DuplicateMode;
  errors: Array<{ row: number; message: string }>;
  ignoredRows: Array<{ row: number; document: string; reason: string }>;
}

const CREATE_BATCH = 500;
const MAX_REPORTED = 500;

export async function executeImport(analysis: ImportAnalysis, mode: DuplicateMode): Promise<ImportResult> {
  const toCreate = analysis.rows.filter((r) => r.status === 'new');
  const toUpdate = mode === 'update' ? analysis.rows.filter((r) => r.status === 'duplicate_in_database') : [];

  try {
    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < toCreate.length; i += CREATE_BATCH) {
          await tx.company.createMany({ data: toCreate.slice(i, i + CREATE_BATCH).map((r) => r.data as any) });
        }
        for (const row of toUpdate) {
          // Só os campos preenchidos no arquivo são alterados: célula vazia nunca apaga um dado existente.
          await tx.company.update({ where: { id: row.existing!.id }, data: row.data as any });
        }
      },
      { timeout: 5 * 60 * 1000, maxWait: 15000 }
    );
  } catch (error: any) {
    if (error?.code === 'P2002') {
      throw new AppError(
        'Outro cadastro com o mesmo CNPJ/CPF foi criado enquanto a importação rodava. Nada foi gravado; analise o arquivo e tente novamente.',
        409,
        'IMPORT_CONFLICT'
      );
    }
    throw error;
  }

  const skippedDb = mode === 'skip' ? analysis.rows.filter((r) => r.status === 'duplicate_in_database') : [];
  const skippedFile = analysis.rows.filter((r) => r.status === 'duplicate_in_file');
  const ignoredRows = [
    ...skippedDb.map((r) => ({ row: r.rowNumber, document: formatDocument(r.documentDigits), reason: `Já cadastrada (${r.existing?.name}); mantida sem alterações` })),
    ...skippedFile.map((r) => ({ row: r.rowNumber, document: formatDocument(r.documentDigits), reason: 'CNPJ/CPF repetido no arquivo; considerada a primeira ocorrência' })),
  ].sort((a, b) => a.row - b.row);

  const errors = analysis.rows
    .filter((r) => r.status === 'invalid')
    .flatMap((r) => r.errors.map((message) => ({ row: r.rowNumber, message })));

  return {
    total: analysis.summary.total,
    added: toCreate.length,
    updated: toUpdate.length,
    ignored: skippedDb.length + skippedFile.length,
    rejected: analysis.summary.invalid,
    duplicatesInDatabase: analysis.summary.duplicatesInDatabase,
    duplicatesInFile: analysis.summary.duplicatesInFile,
    mode,
    errors: errors.slice(0, MAX_REPORTED),
    ignoredRows: ignoredRows.slice(0, MAX_REPORTED),
  };
}
