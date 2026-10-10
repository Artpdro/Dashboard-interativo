"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailCampaignController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
const logger_1 = require("../utils/logger");
const library_1 = require("@prisma/client/runtime/library");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const emailSender_1 = require("../utils/emailSender");
const companySearch_1 = require("../utils/companySearch");
const campaignQueue = new Map();
// Envios individuais recentes (chave -> horário), para barrar duplo clique / reenvio acidental.
const SINGLE_SEND_WINDOW_MS = 30000;
const recentSingleSends = new Map();
const pruneRecentSingleSends = () => {
    const limit = Date.now() - SINGLE_SEND_WINDOW_MS;
    for (const [key, at] of recentSingleSends)
        if (at < limit)
            recentSingleSends.delete(key);
};
const replaceVariables = (text, company) => {
    if (!text)
        return '';
    return text
        .replace(/{{nome}}/gi, company.name || '')
        .replace(/{{empresa}}/gi, company.companyName || company.name || '')
        .replace(/{{email}}/gi, company.email || '')
        .replace(/{{cidade}}/gi, company.city || '')
        .replace(/{{estado}}/gi, company.state || '')
        .replace(/{{valor_vencido}}/gi, company.overdueAmount?.toString() || '0')
        .replace(/{{valor_pago}}/gi, company.paidAmount?.toString() || '0')
        .replace(/{{valor_a_vencer}}/gi, company.dueAmount?.toString() || '0')
        .replace(/{{rua}}/gi, company.street || '')
        .replace(/{{numero}}/gi, company.number || '')
        .replace(/{{bairro}}/gi, company.neighborhood || '')
        .replace(/{{cep}}/gi, company.zipCode || '')
        .replace(/{{telefone}}/gi, company.phone || '')
        .replace(/{{documento}}/gi, company.document || '');
};
const buildEmailBody = (body, signature) => {
    let html = body;
    if (!html.trim().startsWith('<')) {
        html = html.replace(/\n/g, '<br/>');
    }
    if (signature) {
        const sigHtml = signature.trim().startsWith('<')
            ? signature
            : signature.replace(/\n/g, '<br/>');
        html += `<br/><br/><hr style="border:0;border-top:1px solid #ddd;margin:20px 0;"/>${sigHtml}`;
    }
    return html;
};
const getAttachmentsForMail = (attachments) => {
    return attachments.map((att) => ({
        filename: att.originalName,
        path: att.path,
    }));
};
const sendEmail = async (transporter, from, logId, to, subject, html, campaignId, attachments = []) => {
    try {
        const mailOptions = { from, to, subject, html };
        if (attachments.length > 0) {
            mailOptions.attachments = getAttachmentsForMail(attachments);
        }
        // Só conta como enviado quando o servidor SMTP aceita a mensagem.
        await (0, emailSender_1.deliverMail)(transporter, mailOptions);
        await db_1.prisma.emailLog.update({
            where: { id: logId },
            data: { status: 'SENT', sentAt: new Date() },
        });
        await db_1.prisma.emailCampaign.update({
            where: { id: campaignId },
            data: {
                sentCount: { increment: 1 },
                pendingCount: { decrement: 1 },
            },
        });
        return { success: true };
    }
    catch (error) {
        await db_1.prisma.emailLog.update({
            where: { id: logId },
            data: { status: 'FAILED', errorMessage: error.message },
        });
        await db_1.prisma.emailCampaign.update({
            where: { id: campaignId },
            data: {
                errorCount: { increment: 1 },
                pendingCount: { decrement: 1 },
            },
        });
        return { success: false, error: error.message };
    }
};
const processCampaign = async (campaignId) => {
    const campaign = await db_1.prisma.emailCampaign.findUnique({
        where: { id: campaignId },
        include: { smtpConfig: true, attachments: true },
    });
    if (!campaign || campaign.status !== 'SENDING')
        return;
    const smtpConfig = campaign.smtpConfig;
    if (!smtpConfig || !smtpConfig.isActive) {
        await db_1.prisma.emailCampaign.update({
            where: { id: campaignId },
            data: { status: 'PAUSED' },
        });
        return;
    }
    const transporter = (0, emailSender_1.buildTransport)(smtpConfig, { pool: true });
    const from = (0, emailSender_1.buildFrom)(smtpConfig);
    const pendingLogs = await db_1.prisma.emailLog.findMany({
        where: { campaignId, status: 'PENDING' },
        include: { company: true },
        take: 50,
    });
    if (pendingLogs.length === 0) {
        await db_1.prisma.emailCampaign.update({
            where: { id: campaignId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });
        campaignQueue.delete(campaignId);
        return;
    }
    for (const log of pendingLogs) {
        if (campaignQueue.get(campaignId)?.cancelled) {
            await db_1.prisma.emailCampaign.update({
                where: { id: campaignId },
                data: { status: 'CANCELLED' },
            });
            campaignQueue.delete(campaignId);
            return;
        }
        const personalizedBody = replaceVariables(campaign.body, log.company);
        const personalizedSubject = replaceVariables(campaign.subject, log.company);
        const fullBody = buildEmailBody(personalizedBody, campaign.signature);
        await sendEmail(transporter, from, log.id, log.recipient, personalizedSubject, fullBody, campaignId, campaign.attachments);
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    setTimeout(() => processCampaign(campaignId), 1000);
};
// Sanitiza campos de relação: string vazia -> undefined
const sanitizeId = (val) => {
    if (val === '' || val === null || val === undefined)
        return undefined;
    return String(val);
};
exports.EmailCampaignController = {
    list: (0, errorHandler_1.asyncHandler)(async (_req, res) => {
        const campaigns = await db_1.prisma.emailCampaign.findMany({
            include: {
                template: { select: { name: true } },
                group: { select: { name: true } },
                sender: { select: { name: true } },
                smtpConfig: { select: { name: true } },
                _count: { select: { emailLogs: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: campaigns });
    }),
    getById: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const campaign = await db_1.prisma.emailCampaign.findUnique({
            where: { id },
            include: {
                template: true,
                group: true,
                sender: { select: { name: true, email: true } },
                smtpConfig: { select: { name: true, host: true, port: true } },
                attachments: true,
                emailLogs: {
                    include: {
                        company: { select: { name: true, email: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        if (!campaign) {
            throw new errorHandler_1.AppError('Campanha não encontrada', 404, 'NOT_FOUND');
        }
        res.json({ success: true, data: campaign });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { name, subject, body, signature, templateId, groupId, companyIds, smtpConfigId, useFilters, filters, } = req.body;
        const cleanTemplateId = sanitizeId(templateId);
        const cleanGroupId = sanitizeId(groupId);
        const cleanSmtpConfigId = sanitizeId(smtpConfigId);
        // SMTP escolhido (se ativo) -> padrão ativo -> qualquer ativo. Na criação pode ficar vazio; no envio é exigido.
        let smtpConfig = null;
        try {
            smtpConfig = await (0, emailSender_1.resolveSmtpConfig)(cleanSmtpConfigId);
        }
        catch {
            smtpConfig = null;
        }
        let recipientCompanies = [];
        if (companyIds && companyIds.length > 0) {
            const uniqueIds = Array.from(new Set(companyIds));
            recipientCompanies = await db_1.prisma.company.findMany({
                where: { id: { in: uniqueIds }, email: { not: null } },
            });
        }
        else if (cleanGroupId) {
            const groupCompanies = await db_1.prisma.companyGroup.findMany({
                where: { groupId: cleanGroupId },
                include: { company: true },
            });
            recipientCompanies = groupCompanies.map((gc) => gc.company).filter((c) => c.email);
        }
        else if (useFilters && filters) {
            const ids = await (0, companySearch_1.findAllCompanyIds)({
                search: filters.search,
                name: filters.name,
                document: filters.document,
                city: filters.city,
                neighborhood: filters.neighborhood,
                state: filters.state,
            }, 20000);
            recipientCompanies = ids.length
                ? await db_1.prisma.company.findMany({ where: { id: { in: ids }, email: { not: null } } })
                : [];
        }
        // Mantém só e-mails válidos e remove destinatários repetidos (mesmo e-mail em empresas diferentes).
        const seenEmails = new Set();
        let skippedInvalid = 0;
        let skippedDuplicate = 0;
        recipientCompanies = recipientCompanies.filter((company) => {
            const email = String(company.email || '').trim();
            if (!(0, emailSender_1.isValidEmail)(email)) {
                skippedInvalid++;
                return false;
            }
            const key = email.toLowerCase();
            if (seenEmails.has(key)) {
                skippedDuplicate++;
                return false;
            }
            seenEmails.add(key);
            return true;
        });
        if (recipientCompanies.length === 0) {
            throw new errorHandler_1.AppError('Nenhuma empresa com e-mail encontrada', 400, 'NO_RECIPIENTS');
        }
        const recentCampaign = await db_1.prisma.emailCampaign.findFirst({
            where: {
                name,
                createdAt: {
                    gte: new Date(Date.now() - 60000),
                },
            },
        });
        if (recentCampaign) {
            throw new errorHandler_1.AppError('Campanha com mesmo nome criada recentemente', 400, 'DUPLICATE_CAMPAIGN');
        }
        const campaign = await db_1.prisma.emailCampaign.create({
            data: {
                name,
                subject,
                body,
                signature,
                templateId: cleanTemplateId,
                groupId: cleanGroupId,
                status: 'DRAFT',
                totalCount: recipientCompanies.length,
                sentCount: 0,
                errorCount: 0,
                pendingCount: recipientCompanies.length,
                sentBy: req.user.id,
                smtpConfigId: smtpConfig?.id,
            },
        });
        const emailLogsData = recipientCompanies.map((company) => ({
            campaignId: campaign.id,
            companyId: company.id,
            recipient: company.email,
            subject: replaceVariables(subject, company),
            body: replaceVariables(body, company),
            status: 'PENDING',
        }));
        await db_1.prisma.emailLog.createMany({
            data: emailLogsData,
        });
        await (0, audit_1.logAudit)({
            action: 'CREATE',
            entity: 'EMAIL_CAMPAIGN',
            entityId: campaign.id,
            userId: req.user.id,
            details: {
                name,
                recipientCount: recipientCompanies.length,
            },
            req,
        });
        res.status(201).json({
            success: true,
            data: campaign,
            message: `Campanha criada com ${recipientCompanies.length} destinatários` +
                (skippedInvalid || skippedDuplicate
                    ? ` (${skippedDuplicate} repetidos e ${skippedInvalid} com e-mail inválido foram ignorados)`
                    : ''),
        });
    }),
    send: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const campaign = await db_1.prisma.emailCampaign.findUnique({
            where: { id },
            include: { smtpConfig: true },
        });
        if (!campaign) {
            throw new errorHandler_1.AppError('Campanha não encontrada', 404, 'NOT_FOUND');
        }
        if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
            throw new errorHandler_1.AppError('Campanha já iniciada', 400, 'ALREADY_STARTED');
        }
        // SMTP da campanha (se ativo) -> padrão ativo -> qualquer ativo; erro claro quando não há nenhum.
        const smtpConfig = await (0, emailSender_1.resolveSmtpConfig)(campaign.smtpConfigId);
        // Associa o SMTP e inicia a campanha.
        await db_1.prisma.emailCampaign.update({
            where: { id },
            data: {
                smtpConfigId: smtpConfig.id,
                status: 'SENDING',
                startedAt: new Date(),
            },
        });
        campaignQueue.set(id, { cancelled: false });
        setTimeout(() => processCampaign(id), 100);
        await (0, audit_1.logAudit)({
            action: 'START_CAMPAIGN',
            entity: 'EMAIL_CAMPAIGN',
            entityId: id,
            userId: req.user.id,
            req,
        });
        res.json({
            success: true,
            message: 'Campanha iniciada. Envio em segundo plano.',
        });
    }),
    pause: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        await db_1.prisma.emailCampaign.update({
            where: { id },
            data: { status: 'PAUSED' },
        });
        if (campaignQueue.has(id)) {
            campaignQueue.get(id).cancelled = true;
        }
        await (0, audit_1.logAudit)({
            action: 'PAUSE_CAMPAIGN',
            entity: 'EMAIL_CAMPAIGN',
            entityId: id,
            userId: req.user.id,
            req,
        });
        res.json({
            success: true,
            message: 'Campanha pausada',
        });
    }),
    cancel: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        await db_1.prisma.emailCampaign.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });
        if (campaignQueue.has(id)) {
            campaignQueue.get(id).cancelled = true;
        }
        await (0, audit_1.logAudit)({
            action: 'CANCEL_CAMPAIGN',
            entity: 'EMAIL_CAMPAIGN',
            entityId: id,
            userId: req.user.id,
            req,
        });
        res.json({
            success: true,
            message: 'Campanha cancelada',
        });
    }),
    delete: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const campaign = await db_1.prisma.emailCampaign.findUnique({
            where: { id },
            include: { attachments: true },
        });
        if (campaign) {
            for (const att of campaign.attachments) {
                try {
                    fs_1.default.unlinkSync(att.path);
                }
                catch { }
            }
        }
        await db_1.prisma.emailCampaign.delete({
            where: { id },
        });
        await (0, audit_1.logAudit)({
            action: 'DELETE',
            entity: 'EMAIL_CAMPAIGN',
            entityId: id,
            userId: req.user.id,
            req,
        });
        res.json({
            success: true,
            message: 'Campanha excluída',
        });
    }),
    preview: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { templateId, companyId, subject, body, signature, } = req.body;
        let templateSubject = subject;
        let templateBody = body;
        let templateSignature = signature;
        if (templateId) {
            const template = await db_1.prisma.emailTemplate.findUnique({
                where: { id: templateId },
            });
            if (template) {
                templateSubject = template.subject;
                templateBody = template.body;
                templateSignature = template.signature || '';
            }
        }
        const company = companyId
            ? await db_1.prisma.company.findUnique({
                where: { id: companyId },
            })
            : {
                name: 'Empresa Exemplo',
                companyName: 'Empresa Exemplo LTDA',
                email: 'exemplo@email.com',
                city: 'São Paulo',
                state: 'SP',
                overdueAmount: new library_1.Decimal(1500.00),
                paidAmount: new library_1.Decimal(5000.00),
                dueAmount: new library_1.Decimal(2500.00),
                street: 'Rua Exemplo',
                number: '123',
                neighborhood: 'Centro',
                zipCode: '01000-000',
                phone: '(11) 99999-9999',
                document: '00.000.000/0001-00',
            };
        const previewSubject = replaceVariables(templateSubject, company);
        const previewBody = replaceVariables(templateBody, company);
        const fullBody = buildEmailBody(previewBody, templateSignature);
        res.json({
            success: true,
            data: {
                subject: previewSubject,
                body: fullBody,
                company,
            },
        });
    }),
    sendSingle: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { companyId, subject, body, signature, templateId, smtpConfigId } = req.body;
        if (!companyId) {
            throw new errorHandler_1.AppError('Selecione a empresa destinatária.', 400, 'VALIDATION_ERROR');
        }
        const company = await db_1.prisma.company.findUnique({ where: { id: String(companyId) } });
        if (!company) {
            throw new errorHandler_1.AppError('Empresa não encontrada.', 404, 'NOT_FOUND');
        }
        const recipient = (company.email || '').trim();
        if (!recipient) {
            throw new errorHandler_1.AppError('Esta empresa não tem e-mail cadastrado.', 400, 'NO_EMAIL');
        }
        if (!(0, emailSender_1.isValidEmail)(recipient)) {
            throw new errorHandler_1.AppError(`O e-mail cadastrado (${recipient}) é inválido. Corrija o cadastro da empresa.`, 400, 'INVALID_EMAIL');
        }
        let emailSubject = typeof subject === 'string' ? subject : '';
        let emailBody = typeof body === 'string' ? body : '';
        let emailSignature = typeof signature === 'string' ? signature : null;
        if (templateId) {
            const template = await db_1.prisma.emailTemplate.findUnique({ where: { id: String(templateId) } });
            if (template) {
                emailSubject = template.subject;
                emailBody = template.body;
                emailSignature = template.signature || '';
            }
        }
        if (!emailSubject.trim() || !emailBody.trim()) {
            throw new errorHandler_1.AppError('Preencha o assunto e a mensagem do e-mail.', 400, 'VALIDATION_ERROR');
        }
        // Mesma configuração SMTP salva usada pelas campanhas (escolhida -> padrão -> qualquer ativa).
        const smtpConfig = await (0, emailSender_1.resolveSmtpConfig)(sanitizeId(smtpConfigId));
        // Evita envio repetido por clique duplo/reenvio acidental.
        const sendKey = crypto_1.default
            .createHash('sha1')
            .update(`${req.user.id}|${company.id}|${emailSubject}|${emailBody}`)
            .digest('hex');
        pruneRecentSingleSends();
        if (recentSingleSends.has(sendKey)) {
            throw new errorHandler_1.AppError('Este e-mail já foi enviado para esta empresa há instantes. Aguarde antes de enviar novamente.', 409, 'DUPLICATE_SEND');
        }
        recentSingleSends.set(sendKey, Date.now());
        const personalizedSubject = replaceVariables(emailSubject, company);
        const personalizedBody = replaceVariables(emailBody, company);
        const fullBody = buildEmailBody(personalizedBody, emailSignature);
        // Registra a tentativa ANTES de enviar: sucesso ou falha ficam no histórico.
        const campaign = await db_1.prisma.emailCampaign.create({
            data: {
                name: `E-mail individual - ${company.name}`,
                subject: personalizedSubject,
                body: personalizedBody,
                signature: emailSignature,
                status: 'SENDING',
                totalCount: 1,
                pendingCount: 1,
                sentBy: req.user.id,
                smtpConfigId: smtpConfig.id,
                startedAt: new Date(),
            },
        });
        const emailLog = await db_1.prisma.emailLog.create({
            data: {
                campaignId: campaign.id,
                companyId: company.id,
                recipient,
                subject: personalizedSubject,
                body: personalizedBody,
                status: 'PENDING',
            },
        });
        const transporter = (0, emailSender_1.buildTransport)(smtpConfig);
        try {
            const delivery = await (0, emailSender_1.deliverMail)(transporter, {
                from: (0, emailSender_1.buildFrom)(smtpConfig),
                to: recipient,
                subject: personalizedSubject,
                html: fullBody,
            });
            await db_1.prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: 'SENT', sentAt: new Date() } });
            await db_1.prisma.emailCampaign.update({
                where: { id: campaign.id },
                data: { status: 'COMPLETED', sentCount: 1, pendingCount: 0, completedAt: new Date() },
            });
            await (0, audit_1.logAudit)({
                action: 'SEND_SINGLE_EMAIL',
                entity: 'EMAIL',
                entityId: company.id,
                userId: req.user.id,
                companyId: company.id,
                details: { to: recipient, subject: personalizedSubject, messageId: delivery.messageId },
                req,
            });
            logger_1.logger.info(`E-mail individual enviado para ${recipient} (campanha ${campaign.id})`);
            res.json({
                success: true,
                message: `E-mail enviado com sucesso para ${recipient}`,
                data: { recipient, messageId: delivery.messageId, campaignId: campaign.id },
            });
        }
        catch (error) {
            recentSingleSends.delete(sendKey); // permite tentar de novo depois de corrigir o problema
            await db_1.prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: 'FAILED', errorMessage: error.message } });
            await db_1.prisma.emailCampaign.update({
                where: { id: campaign.id },
                data: { status: 'COMPLETED', errorCount: 1, pendingCount: 0, completedAt: new Date() },
            });
            await (0, audit_1.logAudit)({
                action: 'SEND_SINGLE_EMAIL_FAILED',
                entity: 'EMAIL',
                entityId: company.id,
                userId: req.user.id,
                companyId: company.id,
                details: { to: recipient, subject: personalizedSubject, error: error.message },
                req,
            });
            logger_1.logger.warn(`Falha no envio individual para ${recipient}: ${error.message}`);
            throw new errorHandler_1.AppError(`Não foi possível enviar o e-mail: ${error.message}`, 502, 'SEND_FAILED');
        }
        finally {
            transporter.close();
        }
    }),
    getHistory: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { page = 1, limit = 20 } = req.query;
        const [logs, total] = await Promise.all([
            db_1.prisma.emailLog.findMany({
                include: {
                    company: { select: { name: true, email: true } },
                    campaign: { select: { name: true, subject: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (Number(page) - 1) * Number(limit),
                take: Number(limit),
            }),
            db_1.prisma.emailLog.count(),
        ]);
        res.json({
            success: true,
            data: logs,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    }),
    uploadAttachment: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { campaignId } = req.params;
        if (!req.file) {
            throw new errorHandler_1.AppError('Nenhum arquivo enviado', 400, 'NO_FILE');
        }
        const uploadDir = path_1.default.join(process.cwd(), 'uploads', 'campaigns', campaignId);
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        const filename = `${Date.now()}-${req.file.originalname}`;
        const filePath = path_1.default.join(uploadDir, filename);
        fs_1.default.writeFileSync(filePath, req.file.buffer);
        const attachment = await db_1.prisma.campaignAttachment.create({
            data: {
                campaignId,
                filename,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                path: filePath,
            },
        });
        res.json({
            success: true,
            data: attachment,
            message: 'Anexo adicionado',
        });
    }),
    deleteAttachment: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { attachmentId } = req.params;
        const attachment = await db_1.prisma.campaignAttachment.findUnique({
            where: { id: attachmentId },
        });
        if (!attachment) {
            throw new errorHandler_1.AppError('Anexo não encontrado', 404, 'NOT_FOUND');
        }
        try {
            fs_1.default.unlinkSync(attachment.path);
        }
        catch { }
        await db_1.prisma.campaignAttachment.delete({
            where: { id: attachmentId },
        });
        res.json({
            success: true,
            message: 'Anexo removido',
        });
    }),
};
//# sourceMappingURL=emailCampaignController.js.map