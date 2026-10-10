/**
 * Validação e normalização de dados de empresa — usada pelo cadastro, pela edição e pela importação,
 * garantindo as mesmas regras (CNPJ só com dígitos, e-mails válidos, valores em Decimal) nos três.
 */
import { Decimal } from '@prisma/client/runtime/library';
import { parseDocument } from './document';
import { isValidEmail, splitEmails, uniqueEmails } from './emailSender';
import { parseMoney } from './money';

export const COMPANY_TEXT_FIELDS = [
  'companyName',
  'phone',
  'landline',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'zipCode',
  'state',
] as const;

export const COMPANY_MONEY_FIELDS = ['overdueAmount', 'paidAmount', 'dueAmount'] as const;

export const MONEY_LABELS: Record<string, string> = {
  overdueAmount: 'Valor vencido',
  paidAmount: 'Valor pago',
  dueAmount: 'Valor a vencer',
};

export interface SanitizedCompany {
  data: Record<string, unknown>;
  errors: string[];
}

const asTrimmedString = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Converte o corpo recebido em dados seguros para o Prisma.
 *  - Só aceita campos conhecidos (ignora id, groups, emailLogs… que o frontend possa reenviar).
 *  - Campo ausente (undefined) => não é alterado.
 *  - Texto vazio => null (limpa o campo).
 */
export function sanitizeCompanyInput(body: any, options: { requireName: boolean }): SanitizedCompany {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  const src = body && typeof body === 'object' ? body : {};

  if (src.name !== undefined || options.requireName) {
    const name = asTrimmedString(src.name);
    if (!name) errors.push('Nome é obrigatório');
    else data.name = name;
  }

  for (const field of COMPANY_TEXT_FIELDS) {
    if (src[field] === undefined) continue;
    const value = asTrimmedString(src[field]);
    data[field] = value === '' ? null : value;
  }
  if (typeof data.state === 'string' && data.state.length === 2) data.state = data.state.toUpperCase();

  if (src.email !== undefined) {
    const email = asTrimmedString(src.email);
    if (email === '') data.email = null;
    else if (!isValidEmail(email)) errors.push(`E-mail inválido: ${email}`);
    else data.email = email;
  }

  if (src.additionalEmails !== undefined) {
    const list = splitEmails(asTrimmedString(src.additionalEmails));
    const invalid = list.filter((e) => !isValidEmail(e));
    if (invalid.length) errors.push(`E-mail adicional inválido: ${invalid.join(', ')}`);
    else data.additionalEmails = list.length ? uniqueEmails(list).join(', ') : null;
  }

  if (src.document !== undefined) {
    const parsed = parseDocument(src.document);
    if (!parsed.ok) errors.push(parsed.message);
    else data.document = parsed.value;
  }

  for (const field of COMPANY_MONEY_FIELDS) {
    if (src[field] === undefined) continue;
    const parsed = parseMoney(src[field]);
    if (!parsed.ok) errors.push(`${MONEY_LABELS[field]} inválido: ${asTrimmedString(src[field])}`);
    else data[field] = parsed.value ?? new Decimal(0);
  }

  return { data, errors };
}
