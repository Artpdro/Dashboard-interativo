"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const papaparse_1 = __importDefault(require("papaparse"));
exports.AuditLogController = {
    list: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { page = 1, limit = 50, entity, userId, action } = req.query;
        const where = {};
        if (entity)
            where.entity = entity;
        if (userId)
            where.userId = userId;
        if (action)
            where.action = action;
        const [logs, total] = await Promise.all([
            db_1.prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip: (Number(page) - 1) * Number(limit), take: Number(limit) }),
            db_1.prisma.auditLog.count({ where }),
        ]);
        res.json({ success: true, data: logs, pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) } });
    }),
    export: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { entity, userId, action } = req.query;
        const where = {};
        if (entity)
            where.entity = entity;
        if (userId)
            where.userId = userId;
        if (action)
            where.action = action;
        const logs = await db_1.prisma.auditLog.findMany({ where, include: { user: { select: { name: true, email: true } }, company: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
        const csvData = logs.map((log) => ({ Data: new Date(log.createdAt).toLocaleString('pt-BR'), Usuário: log.user?.name || 'Sistema', Email: log.user?.email || '', Ação: log.action, Entidade: log.entity, 'ID Entidade': log.entityId || '', Empresa: log.company?.name || '', Detalhes: log.details ? JSON.stringify(log.details) : '', IP: log.ipAddress || '' }));
        const csv = papaparse_1.default.unparse(csvData, { delimiter: ';', newline: '\r\n' });
        const bom = '\uFEFF';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="auditoria_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(bom + csv);
    }),
};
//# sourceMappingURL=auditLogController.js.map