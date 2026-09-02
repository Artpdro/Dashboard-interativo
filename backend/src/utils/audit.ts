import { prisma } from './db';
import { Request } from 'express';

interface AuditData {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  companyId?: string;
  details?: any;
  req?: Request;
}

export async function logAudit(data: AuditData) {
  try {
    await prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        companyId: data.companyId,
        details: data.details || {},
        ipAddress: data.req?.ip || null,
      },
    });
  } catch (error) {
    console.error('Erro ao registrar audit log:', error);
  }
}
