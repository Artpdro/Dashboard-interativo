"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmtpConfigController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
const nodemailer_1 = __importDefault(require("nodemailer"));
exports.SmtpConfigController = {
    list: (0, errorHandler_1.asyncHandler)(async (_req, res) => {
        const configs = await db_1.prisma.smtpConfig.findMany({
            select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: configs });
    }),
    getById: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const config = await db_1.prisma.smtpConfig.findUnique({ where: { id }, select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true, createdAt: true } });
        if (!config)
            throw new errorHandler_1.AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
        res.json({ success: true, data: config });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { name, host, port, user, password, from, secure, isDefault } = req.body;
        if (isDefault)
            await db_1.prisma.smtpConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const config = await db_1.prisma.smtpConfig.create({
            data: { name, host, port: Number(port), user, password, from, secure: secure || false, isDefault: isDefault || false, createdBy: req.user.id },
            select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true },
        });
        await (0, audit_1.logAudit)({ action: 'CREATE', entity: 'SMTP_CONFIG', entityId: config.id, userId: req.user.id, details: { name, host }, req });
        res.status(201).json({ success: true, data: config, message: 'Configuração SMTP criada com sucesso' });
    }),
    update: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const { name, host, port, user, password, from, secure, isDefault, isActive } = req.body;
        if (isDefault)
            await db_1.prisma.smtpConfig.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
        const config = await db_1.prisma.smtpConfig.update({
            where: { id },
            data: { name, host, port: Number(port), user, password, from, secure, isDefault, isActive },
            select: { id: true, name: true, host: true, port: true, user: true, from: true, secure: true, isDefault: true, isActive: true },
        });
        await (0, audit_1.logAudit)({ action: 'UPDATE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, details: { name, host }, req });
        res.json({ success: true, data: config, message: 'Configuração SMTP atualizada com sucesso' });
    }),
    delete: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        await db_1.prisma.smtpConfig.delete({ where: { id } });
        await (0, audit_1.logAudit)({ action: 'DELETE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, req });
        res.json({ success: true, message: 'Configuração SMTP excluída com sucesso' });
    }),
    test: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const config = await db_1.prisma.smtpConfig.findUnique({ where: { id } });
        if (!config)
            throw new errorHandler_1.AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
        const transporter = nodemailer_1.default.createTransport({
            host: config.host, port: config.port, secure: config.secure,
            auth: { user: config.user, pass: config.password },
        });
        try {
            await transporter.verify();
            res.json({ success: true, message: 'Conexão SMTP verificada com sucesso' });
        }
        catch (error) {
            throw new errorHandler_1.AppError(`Falha na conexão SMTP: ${error.message}`, 400, 'SMTP_ERROR');
        }
    }),
};
//# sourceMappingURL=smtpConfigController.js.map