import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';

export const EmailTemplateController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const templates = await prisma.emailTemplate.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: templates });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const template = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError('Template não encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: template });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const { name, subject, body, signature, variables } = req.body;
    const template = await prisma.emailTemplate.create({ data: { name, subject, body, signature, variables: variables || [] } });
    await logAudit({ action: 'CREATE', entity: 'EMAIL_TEMPLATE', entityId: template.id, userId: req.user.id, details: { name, subject }, req });
    res.status(201).json({ success: true, data: template, message: 'Template criado com sucesso' });
  }),

  update: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const { name, subject, body, signature, variables, isActive } = req.body;
    const template = await prisma.emailTemplate.update({ where: { id }, data: { name, subject, body, signature, variables, isActive } });
    await logAudit({ action: 'UPDATE', entity: 'EMAIL_TEMPLATE', entityId: id, userId: req.user.id, details: { name, subject }, req });
    res.json({ success: true, data: template, message: 'Template atualizado com sucesso' });
  }),

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    await prisma.emailTemplate.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entity: 'EMAIL_TEMPLATE', entityId: id, userId: req.user.id, req });
    res.json({ success: true, message: 'Template excluído com sucesso' });
  }),

  duplicate: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;
    const original = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!original) throw new AppError('Template não encontrado', 404, 'NOT_FOUND');
    const template = await prisma.emailTemplate.create({
      data: {
        name: `${original.name} (Cópia)`,
        subject: original.subject,
        body: original.body,
        signature: original.signature,
        variables: original.variables ?? [],
      },
    });
    await logAudit({ action: 'DUPLICATE', entity: 'EMAIL_TEMPLATE', entityId: template.id, userId: req.user.id, details: { originalId: id }, req });
    res.status(201).json({ success: true, data: template, message: 'Template duplicado com sucesso' });
  }),
};
