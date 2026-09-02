import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import nodemailer from 'nodemailer';

export const SmtpConfigController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const configs = await prisma.smtpConfig.findMany({
      select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: configs });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const config = await prisma.smtpConfig.findUnique({ where: { id }, select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true, createdAt: true } });
    if (!config) throw new AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
    res.json({ success: true, data: config });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const { name, host, port, user, password, from, secure, isDefault } = req.body;
    if (isDefault) await prisma.smtpConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const config = await prisma.smtpConfig.create({
      data: { name, host, port: Number(port), user, password, from, secure: secure || false, isDefault: isDefault || false, createdBy: req.user.id },
      select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true },
    });
    await logAudit({ action: 'CREATE', entity: 'SMTP_CONFIG', entityId: config.id, userId: req.user.id, details: { name, host }, req });
    res.status(201).json({ success: true, data: config, message: 'Configuração SMTP criada com sucesso' });
  }),

  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const { name, host, port, user, password, from, secure, isDefault, isActive } = req.body;
    if (isDefault) await prisma.smtpConfig.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    const config = await prisma.smtpConfig.update({
      where: { id },
      data: { name, host, port: Number(port), user, password, from, secure, isDefault, isActive },
      select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true },
    });
    await logAudit({ action: 'UPDATE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, details: { name, host }, req });
    res.json({ success: true, data: config, message: 'Configuração SMTP atualizada com sucesso' });
  }),

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    await prisma.smtpConfig.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Configuração SMTP excluída com sucesso' });
  }),

  test: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const config = await prisma.smtpConfig.findUnique({ where: { id } });
    if (!config) throw new AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
    const transporter = nodemailer.createTransport({
      host: config.host, port: config.port, secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
    try {
      await transporter.verify();
      res.json({ success: true, message: 'Conexão SMTP verificada com sucesso' });
    } catch (error: any) {
      throw new AppError(`Falha na conexão SMTP: ${error.message}`, 400, 'SMTP_ERROR');
    }
  }),
};
