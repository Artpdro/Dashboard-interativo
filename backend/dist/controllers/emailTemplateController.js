"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTemplateController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
exports.EmailTemplateController = {
    list: (0, errorHandler_1.asyncHandler)(async (_req, res) => {
        const templates = await db_1.prisma.emailTemplate.findMany({ where: { isActive: true }, orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: templates });
    }),
    getById: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const template = await db_1.prisma.emailTemplate.findUnique({ where: { id } });
        if (!template)
            throw new errorHandler_1.AppError('Template não encontrado', 404, 'NOT_FOUND');
        res.json({ success: true, data: template });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { name, subject, body, signature, variables } = req.body;
        const template = await db_1.prisma.emailTemplate.create({ data: { name, subject, body, signature, variables: variables || [] } });
        await (0, audit_1.logAudit)({ action: 'CREATE', entity: 'EMAIL_TEMPLATE', entityId: template.id, userId: req.user.id, details: { name, subject }, req });
        res.status(201).json({ success: true, data: template, message: 'Template criado com sucesso' });
    }),
    update: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const { name, subject, body, signature, variables, isActive } = req.body;
        const template = await db_1.prisma.emailTemplate.update({ where: { id }, data: { name, subject, body, signature, variables, isActive } });
        await (0, audit_1.logAudit)({ action: 'UPDATE', entity: 'EMAIL_TEMPLATE', entityId: id, userId: req.user.id, details: { name, subject }, req });
        res.json({ success: true, data: template, message: 'Template atualizado com sucesso' });
    }),
    delete: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        await db_1.prisma.emailTemplate.delete({ where: { id } });
        await (0, audit_1.logAudit)({ action: 'DELETE', entity: 'EMAIL_TEMPLATE', entityId: id, userId: req.user.id, req });
        res.json({ success: true, message: 'Template excluído com sucesso' });
    }),
    duplicate: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const original = await db_1.prisma.emailTemplate.findUnique({ where: { id } });
        if (!original)
            throw new errorHandler_1.AppError('Template não encontrado', 404, 'NOT_FOUND');
        const template = await db_1.prisma.emailTemplate.create({
            data: {
                name: `${original.name} (Cópia)`,
                subject: original.subject,
                body: original.body,
                signature: original.signature,
                variables: original.variables ?? [],
            },
        });
        await (0, audit_1.logAudit)({ action: 'DUPLICATE', entity: 'EMAIL_TEMPLATE', entityId: template.id, userId: req.user.id, details: { originalId: id }, req });
        res.status(201).json({ success: true, data: template, message: 'Template duplicado com sucesso' });
    }),
};
//# sourceMappingURL=emailTemplateController.js.map