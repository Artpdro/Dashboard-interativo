import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import { logger } from '../utils/logger';
import { encryptSecret } from '../utils/secrets';
import { buildFrom, buildTransport, deliverMail, describeSmtpError, isValidEmail } from '../utils/emailSender';

/**
 * Visão pública de uma configuração: NUNCA inclui a senha (nem criptografada).
 * `hasPassword` indica apenas se já existe uma senha salva.
 */
function publicView(config: any) {
  const { password, createdBy, ...rest } = config;
  return { ...rest, hasPassword: Boolean(password) };
}

const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

interface SmtpInput {
  name?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  from?: string;
  fromName?: string | null;
  secure?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());
const bool = (v: unknown): boolean => v === true || v === 'true';

/** Valida e normaliza o corpo recebido. `partial` (edição) só valida os campos enviados. */
function validateInput(body: any, partial: boolean): { data: SmtpInput; errors: string[] } {
  const data: SmtpInput = {};
  const errors: string[] = [];
  const has = (k: string) => body[k] !== undefined;

  if (!partial || has('name')) {
    const name = str(body.name);
    if (!name) errors.push('Nome da configuração é obrigatório');
    else data.name = name;
  }
  if (!partial || has('host')) {
    const host = str(body.host);
    if (!host) errors.push('Servidor SMTP é obrigatório');
    else if (!HOST_RE.test(host)) errors.push('Servidor SMTP inválido (informe apenas o endereço, ex.: smtp.exemplo.com.br)');
    else data.host = host;
  }
  if (!partial || has('port')) {
    const port = Number(body.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('Porta inválida (use um número entre 1 e 65535)');
    else data.port = port;
  }
  if (!partial || has('user')) {
    const user = str(body.user);
    if (!user) errors.push('Usuário de autenticação é obrigatório');
    else data.user = user;
  }
  if (!partial || has('from')) {
    const from = str(body.from);
    if (!isValidEmail(from)) errors.push('E-mail do remetente inválido');
    else data.from = from;
  }
  if (has('fromName')) data.fromName = str(body.fromName) || null;
  if (has('secure')) data.secure = bool(body.secure);
  if (has('isDefault')) data.isDefault = bool(body.isDefault);
  if (has('isActive')) data.isActive = bool(body.isActive);

  // Senha: obrigatória ao criar; ao editar, vazio = manter a senha atual.
  const password = typeof body.password === 'string' ? body.password : '';
  if (!partial && !password.trim()) errors.push('Senha é obrigatória');
  else if (password.trim()) data.password = password;

  return { data, errors };
}

export const SmtpConfigController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const configs = await prisma.smtpConfig.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: configs.map(publicView) });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const config = await prisma.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) throw new AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
    res.json({ success: true, data: publicView(config) });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const { data, errors } = validateInput(req.body, false);
    if (errors.length) throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');

    const existingCount = await prisma.smtpConfig.count();
    // A primeira configuração vira a padrão automaticamente (o envio individual precisa de uma).
    const makeDefault = data.isDefault === true || existingCount === 0;

    const config = await prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.smtpConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.smtpConfig.create({
        data: {
          name: data.name!,
          host: data.host!,
          port: data.port!,
          user: data.user!,
          password: encryptSecret(data.password!),
          from: data.from!,
          fromName: data.fromName ?? null,
          secure: data.secure ?? false,
          isDefault: makeDefault,
          isActive: data.isActive ?? true,
          createdBy: req.user.id,
        },
      });
    });

    await logAudit({ action: 'CREATE', entity: 'SMTP_CONFIG', entityId: config.id, userId: req.user.id, details: { name: data.name, host: data.host, user: data.user }, req });
    res.status(201).json({ success: true, data: publicView(config), message: 'Configuração SMTP criada com sucesso' });
  }),

  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const existing = await prisma.smtpConfig.findUnique({ where: { id } });
    if (!existing) throw new AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');

    const { data, errors } = validateInput(req.body, true);
    if (errors.length) throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');

    const { password, ...rest } = data;
    const config = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.smtpConfig.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
      return tx.smtpConfig.update({
        where: { id },
        // Sem senha no corpo => mantém a senha já salva.
        data: { ...rest, ...(password ? { password: encryptSecret(password) } : {}) },
      });
    });

    await logAudit({ action: 'UPDATE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, details: { ...rest, passwordChanged: Boolean(password) }, req });
    res.json({ success: true, data: publicView(config), message: 'Configuração SMTP atualizada com sucesso' });
  }),

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    try {
      await prisma.smtpConfig.delete({ where: { id } });
    } catch (error: any) {
      if (error?.code === 'P2003') {
        throw new AppError(
          'Esta configuração está vinculada a campanhas já criadas e não pode ser excluída. Desative-a em vez disso.',
          409,
          'SMTP_IN_USE'
        );
      }
      if (error?.code === 'P2025') throw new AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
      throw error;
    }
    await logAudit({ action: 'DELETE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Configuração SMTP excluída com sucesso' });
  }),

  /** Testa uma configuração já salva (opcionalmente enviando uma mensagem de teste para `to`). */
  test: asyncHandler(async (req: any, res: Response) => {
    const config = await prisma.smtpConfig.findUnique({ where: { id: req.params.id } });
    if (!config) throw new AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
    const message = await runSmtpTest(config, req.body?.to);
    res.json({ success: true, message });
  }),

  /**
   * Testa os dados digitados no formulário ANTES de salvar.
   * Se `id` for enviado e a senha vier vazia, usa a senha já salva dessa configuração.
   */
  testDraft: asyncHandler(async (req: any, res: Response) => {
    const { data, errors } = validateInput({ ...req.body, name: req.body?.name || 'teste' }, false);
    let password = data.password;

    if (!password && req.body?.id) {
      const saved = await prisma.smtpConfig.findUnique({ where: { id: String(req.body.id) } });
      if (saved) {
        password = saved.password;
        const idx = errors.indexOf('Senha é obrigatória');
        if (idx >= 0) errors.splice(idx, 1);
      }
    }
    if (errors.length) throw new AppError(errors.join('; '), 400, 'VALIDATION_ERROR');

    const message = await runSmtpTest(
      { host: data.host!, port: data.port!, secure: data.secure ?? false, user: data.user!, password: password!, from: data.from!, fromName: data.fromName ?? null },
      req.body?.to
    );
    res.json({ success: true, message });
  }),
};

async function runSmtpTest(
  cfg: { host: string; port: number; secure: boolean; user: string; password: string; from: string; fromName: string | null },
  to?: unknown
): Promise<string> {
  const recipient = str(to);
  if (recipient && !isValidEmail(recipient)) throw new AppError('E-mail de destino do teste inválido', 400, 'VALIDATION_ERROR');

  const transporter = buildTransport(cfg);
  try {
    await transporter.verify();
    if (!recipient) return 'Conexão e autenticação SMTP verificadas com sucesso.';

    await deliverMail(transporter, {
      from: buildFrom(cfg),
      to: recipient,
      subject: 'Teste de configuração SMTP - CRM',
      text: 'Este é um e-mail de teste enviado pelo CRM para confirmar a configuração SMTP.',
    });
    return `Conexão verificada e e-mail de teste aceito pelo servidor para ${recipient}.`;
  } catch (error: any) {
    logger.warn(`Falha no teste SMTP (${cfg.host}:${cfg.port}, usuário ${cfg.user}): ${error?.code || ''}`);
    throw new AppError(`Falha no teste SMTP: ${describeSmtpError(error)}`, 400, 'SMTP_ERROR');
  } finally {
    transporter.close();
  }
}
