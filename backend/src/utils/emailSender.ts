/**
 * Envio de e-mail compartilhado por campanhas (lote) e envio individual.
 * Os dois caminhos usam a MESMA configuração SMTP salva, o mesmo remetente e a mesma checagem
 * de aceitação do servidor — assim não há divergência entre envio individual e em lote.
 */
import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from './db';
import { AppError } from './errorHandler';
import { decryptSecret } from './secrets';

export interface SmtpConfigRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  fromName: string | null;
  secure: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export const DEFAULT_SENDER_NAME = 'SINDNORTE';

const EMAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

export const isValidEmail = (value: unknown): boolean => typeof value === 'string' && EMAIL_RE.test(value.trim());

/** Separa uma lista de e-mails escrita em um único campo (vírgula, ponto e vírgula ou espaço). */
export const splitEmails = (value: string | null | undefined): string[] =>
  (value || '')
    .split(/[;,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

/** Remove repetidos ignorando maiúsculas/minúsculas, preservando a ordem. */
export function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const key = e.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(e.trim());
    }
  }
  return out;
}

/**
 * SMTP a usar: o escolhido (se ativo) → o padrão ativo → qualquer ativo mais recente.
 * Lança erro claro quando não há nenhum.
 */
export async function resolveSmtpConfig(preferredId?: string | null): Promise<SmtpConfigRecord> {
  if (preferredId) {
    const chosen = await prisma.smtpConfig.findUnique({ where: { id: preferredId } });
    if (chosen && chosen.isActive) return chosen as SmtpConfigRecord;
  }
  const def = await prisma.smtpConfig.findFirst({ where: { isDefault: true, isActive: true } });
  if (def) return def as SmtpConfigRecord;
  const any = await prisma.smtpConfig.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
  if (any) return any as SmtpConfigRecord;
  throw new AppError(
    'Nenhuma configuração SMTP ativa foi encontrada. Cadastre uma em "Configurações SMTP".',
    400,
    'NO_SMTP'
  );
}

export interface TransportOptions {
  pool?: boolean;
}

export function buildTransport(
  cfg: Pick<SmtpConfigRecord, 'host' | 'port' | 'secure' | 'user' | 'password'>,
  options: TransportOptions = {}
): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    // Porta 587 usa STARTTLS: exige a criptografia em vez de aceitar conexão aberta.
    requireTLS: !cfg.secure && cfg.port === 587,
    auth: { user: cfg.user, pass: decryptSecret(cfg.password) },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    ...(options.pool ? { pool: true, maxConnections: 5, rateDelta: 1000, rateLimit: 5 } : {}),
  });
}

/** Remetente: nome + e-mail configurados no SMTP (e não mais um endereço fixo no código). */
export function buildFrom(cfg: Pick<SmtpConfigRecord, 'from' | 'fromName'>): { name: string; address: string } {
  return {
    name: (cfg.fromName || '').trim() || DEFAULT_SENDER_NAME,
    address: (cfg.from || '').trim() || process.env.DEFAULT_FROM_EMAIL || '',
  };
}

/** Traduz erros do Nodemailer/SMTP em mensagens compreensíveis (sem expor credenciais). */
export function describeSmtpError(error: any): string {
  const code: string = error?.code || '';
  const raw: string = String(error?.message || 'Erro desconhecido').split('\n')[0];
  // O Nodemailer costuma devolver ESOCKET com o motivo real na mensagem (ex.: connect ECONNREFUSED).
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH/.test(`${code} ${raw}`)) {
    return 'Não foi possível conectar ao servidor SMTP. Verifique o servidor e a porta.';
  }
  switch (code) {
    case 'EAUTH':
      return 'Falha de autenticação no servidor SMTP: usuário ou senha incorretos (algumas contas exigem "senha de aplicativo").';
    case 'ECONNECTION':
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'EDNS':
      return 'Não foi possível conectar ao servidor SMTP. Verifique o servidor e a porta.';
    case 'ETIMEDOUT':
    case 'ESOCKET':
      return `Tempo esgotado ou conexão interrompida com o servidor SMTP. Verifique servidor, porta e tipo de segurança (${raw}).`;
    case 'EENVELOPE':
      return `O servidor SMTP recusou remetente ou destinatário: ${raw}`;
    default:
      return raw;
  }
}

export interface DeliveryResult {
  accepted: string[];
  rejected: string[];
  messageId?: string;
  response?: string;
}

/**
 * Envia e só devolve sucesso quando o servidor SMTP ACEITOU a mensagem para pelo menos um
 * destinatário. Qualquer outra situação lança erro com mensagem legível.
 */
export async function deliverMail(transporter: Transporter, mail: nodemailer.SendMailOptions): Promise<DeliveryResult> {
  let info: any;
  try {
    info = await transporter.sendMail(mail);
  } catch (error: any) {
    throw new Error(describeSmtpError(error));
  }
  const accepted: string[] = (info.accepted || []).map((a: any) => String(a));
  const rejected: string[] = (info.rejected || []).map((r: any) => String(r));
  if (accepted.length === 0) {
    throw new Error(`O servidor SMTP não aceitou a mensagem${rejected.length ? ` (recusado: ${rejected.join(', ')})` : ''}.`);
  }
  return { accepted, rejected, messageId: info.messageId, response: info.response };
}
