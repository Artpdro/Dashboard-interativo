import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { asyncHandler } from '../utils/errorHandler';
import Papa from 'papaparse';

export const AuditLogController = {
  list: asyncHandler(async (req: any, res: Response) => {
    const { page = 1, limit = 50, entity, userId, action } = req.query;
    const where: any = {};
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ success: true, data: logs, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
  }),

  export: asyncHandler(async (req: any, res: Response) => {
    const { entity, userId, action } = req.query;
    const where: any = {};
    if (entity) where.entity = entity;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    const logs = await prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
    const csvData = logs.map((log) => ({ Data: new Date(log.createdAt).toLocaleString('pt-BR'), Usuário: log.user?.name || 'Sistema', Email: log.user?.email || '', Ação: log.action, Entidade: log.entity, 'ID Entidade': log.entityId || '', Empresa: log.company?.name || '', Detalhes: log.details ? JSON.stringify(log.details) : '', IP: log.ipAddress || '' }));
    const csv = Papa.unparse(csvData, { delimiter: ';', newline: '\r\n' });
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="auditoria_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(bom + csv);
  }),
};
