"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmtpConfigController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
const logger_1 = require("../utils/logger");
const secrets_1 = require("../utils/secrets");
const emailSender_1 = require("../utils/emailSender");
/**
 * Visão pública de uma configuração: NUNCA inclui a senha (nem criptografada).
 * `hasPassword` indica apenas se já existe uma senha salva.
 */
function publicView(config) {
    const { password, createdBy, ...rest } = config;
    return { ...rest, hasPassword: Boolean(password) };
}
const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
const str = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim());
const bool = (v) => v === true || v === 'true';
/** Valida e normaliza o corpo recebido. `partial` (edição) só valida os campos enviados. */
function validateInput(body, partial) {
    const data = {};
    const errors = [];
    const has = (k) => body[k] !== undefined;
    if (!partial || has('name')) {
        const name = str(body.name);
        if (!name)
            errors.push('Nome da configuração é obrigatório');
        else
            data.name = name;
    }
    if (!partial || has('host')) {
        const host = str(body.host);
        if (!host)
            errors.push('Servidor SMTP é obrigatório');
        else if (!HOST_RE.test(host))
            errors.push('Servidor SMTP inválido (informe apenas o endereço, ex.: smtp.exemplo.com.br)');
        else
            data.host = host;
    }
    if (!partial || has('port')) {
        const port = Number(body.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
            errors.push('Porta inválida (use um número entre 1 e 65535)');
        else
            data.port = port;
    }
    if (!partial || has('user')) {
        const user = str(body.user);
        if (!user)
            errors.push('Usuário de autenticação é obrigatório');
        else
            data.user = user;
    }
    if (!partial || has('from')) {
        const from = str(body.from);
        if (!(0, emailSender_1.isValidEmail)(from))
            errors.push('E-mail do remetente inválido');
        else
            data.from = from;
    }
    if (has('fromName'))
        data.fromName = str(body.fromName) || null;
    if (has('secure'))
        data.secure = bool(body.secure);
    if (has('isDefault'))
        data.isDefault = bool(body.isDefault);
    if (has('isActive'))
        data.isActive = bool(body.isActive);
    // Senha: obrigatória ao criar; ao editar, vazio = manter a senha atual.
    const password = typeof body.password === 'string' ? body.password : '';
    if (!partial && !password.trim())
        errors.push('Senha é obrigatória');
    else if (password.trim())
        data.password = password;
    return { data, errors };
}
exports.SmtpConfigController = {
    list: (0, errorHandler_1.asyncHandler)(async (_req, res) => {
        const configs = await db_1.prisma.smtpConfig.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ success: true, data: configs.map(publicView) });
    }),
    getById: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const config = await db_1.prisma.smtpConfig.findUnique({ where: { id: req.params.id } });
        if (!config)
            throw new errorHandler_1.AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
        res.json({ success: true, data: publicView(config) });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { data, errors } = validateInput(req.body, false);
        if (errors.length)
            throw new errorHandler_1.AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
        const existingCount = await db_1.prisma.smtpConfig.count();
        // A primeira configuração vira a padrão automaticamente (o envio individual precisa de uma).
        const makeDefault = data.isDefault === true || existingCount === 0;
        const config = await db_1.prisma.$transaction(async (tx) => {
            if (makeDefault)
                await tx.smtpConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
            return tx.smtpConfig.create({
                data: {
                    name: data.name,
                    host: data.host,
                    port: data.port,
                    user: data.user,
                    password: (0, secrets_1.encryptSecret)(data.password),
                    from: data.from,
                    fromName: data.fromName ?? null,
                    secure: data.secure ?? false,
                    isDefault: makeDefault,
                    isActive: data.isActive ?? true,
                    createdBy: req.user.id,
                },
            });
        });
        await (0, audit_1.logAudit)({ action: 'CREATE', entity: 'SMTP_CONFIG', entityId: config.id, userId: req.user.id, details: { name: data.name, host: data.host, user: data.user }, req });
        res.status(201).json({ success: true, data: publicView(config), message: 'Configuração SMTP criada com sucesso' });
    }),
    update: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const existing = await db_1.prisma.smtpConfig.findUnique({ where: { id } });
        if (!existing)
            throw new errorHandler_1.AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
        const { data, errors } = validateInput(req.body, true);
        if (errors.length)
            throw new errorHandler_1.AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
        const { password, ...rest } = data;
        const config = await db_1.prisma.$transaction(async (tx) => {
            if (data.isDefault)
                await tx.smtpConfig.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
            return tx.smtpConfig.update({
                where: { id },
                // Sem senha no corpo => mantém a senha já salva.
                data: { ...rest, ...(password ? { password: (0, secrets_1.encryptSecret)(password) } : {}) },
            });
        });
        await (0, audit_1.logAudit)({ action: 'UPDATE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, details: { ...rest, passwordChanged: Boolean(password) }, req });
        res.json({ success: true, data: publicView(config), message: 'Configuração SMTP atualizada com sucesso' });
    }),
    delete: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        try {
            await db_1.prisma.smtpConfig.delete({ where: { id } });
        }
        catch (error) {
            if (error?.code === 'P2003') {
                throw new errorHandler_1.AppError('Esta configuração está vinculada a campanhas já criadas e não pode ser excluída. Desative-a em vez disso.', 409, 'SMTP_IN_USE');
            }
            if (error?.code === 'P2025')
                throw new errorHandler_1.AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
            throw error;
        }
        await (0, audit_1.logAudit)({ action: 'DELETE', entity: 'SMTP_CONFIG', entityId: id, userId: req.user.id, req });
        res.json({ success: true, message: 'Configuração SMTP excluída com sucesso' });
    }),
    /** Testa uma configuração já salva (opcionalmente enviando uma mensagem de teste para `to`). */
    test: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const config = await db_1.prisma.smtpConfig.findUnique({ where: { id: req.params.id } });
        if (!config)
            throw new errorHandler_1.AppError('Configuração SMTP não encontrada', 404, 'NOT_FOUND');
        const message = await runSmtpTest(config, req.body?.to);
        res.json({ success: true, message });
    }),
    /**
     * Testa os dados digitados no formulário ANTES de salvar.
     * Se `id` for enviado e a senha vier vazia, usa a senha já salva dessa configuração.
     */
    testDraft: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { data, errors } = validateInput({ ...req.body, name: req.body?.name || 'teste' }, false);
        let password = data.password;
        if (!password && req.body?.id) {
            const saved = await db_1.prisma.smtpConfig.findUnique({ where: { id: String(req.body.id) } });
            if (saved) {
                password = saved.password;
                const idx = errors.indexOf('Senha é obrigatória');
                if (idx >= 0)
                    errors.splice(idx, 1);
            }
        }
        if (errors.length)
            throw new errorHandler_1.AppError(errors.join('; '), 400, 'VALIDATION_ERROR');
        const message = await runSmtpTest({ host: data.host, port: data.port, secure: data.secure ?? false, user: data.user, password: password, from: data.from, fromName: data.fromName ?? null }, req.body?.to);
        res.json({ success: true, message });
    }),
};
async function runSmtpTest(cfg, to) {
    const recipient = str(to);
    if (recipient && !(0, emailSender_1.isValidEmail)(recipient))
        throw new errorHandler_1.AppError('E-mail de destino do teste inválido', 400, 'VALIDATION_ERROR');
    const transporter = (0, emailSender_1.buildTransport)(cfg);
    try {
        await transporter.verify();
        if (!recipient)
            return 'Conexão e autenticação SMTP verificadas com sucesso.';
        await (0, emailSender_1.deliverMail)(transporter, {
            from: (0, emailSender_1.buildFrom)(cfg),
            to: recipient,
            subject: 'Teste de configuração SMTP - CRM',
            text: 'Este é um e-mail de teste enviado pelo CRM para confirmar a configuração SMTP.',
        });
        return `Conexão verificada e e-mail de teste aceito pelo servidor para ${recipient}.`;
    }
    catch (error) {
        logger_1.logger.warn(`Falha no teste SMTP (${cfg.host}:${cfg.port}, usuário ${cfg.user}): ${error?.code || ''}`);
        throw new errorHandler_1.AppError(`Falha no teste SMTP: ${(0, emailSender_1.describeSmtpError)(error)}`, 400, 'SMTP_ERROR');
    }
    finally {
        transporter.close();
    }
}
//# sourceMappingURL=smtpConfigController.js.map