"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailCampaignController = void 0;
const db_1 = require("../utils/db");
const errorHandler_1 = require("../utils/errorHandler");
const audit_1 = require("../utils/audit");
const nodemailer_1 = __importDefault(require("nodemailer"));
const library_1 = require("@prisma/client/runtime/library");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DEFAULT_FROM_EMAIL = 'sindnorteigarassu2019@hotmail.com';
const campaignQueue = new Map();
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
const sendEmail = async (transporter, logId, to, subject, html, campaignId, attachments = []) => {
    try {
        const mailOptions = {
            from: `"SINDNORTE" <${DEFAULT_FROM_EMAIL}>`,
            to,
            subject,
            html,
        };
        if (attachments.length > 0) {
            mailOptions.attachments = getAttachmentsForMail(attachments);
        }
        await transporter.sendMail(mailOptions);
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
    const transporter = nodemailer_1.default.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.password,
        },
        pool: true,
        maxConnections: 5,
        rateDelta: 1000,
        rateLimit: 5,
    });
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
        await sendEmail(transporter, log.id, log.recipient, personalizedSubject, fullBody, campaignId, campaign.attachments);
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    setTimeout(() => processCampaign(campaignId), 1000);
};
// Sanitiza campos de relaÃ§Ã£o: string vazia -> undefined
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
            throw new errorHandler_1.AppError('Campanha nÃ£o encontrada', 404, 'NOT_FOUND');
        }
        res.json({ success: true, data: campaign });
    }),
    create: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { name, subject, body, signature, templateId, groupId, companyIds, smtpConfigId, useFilters, filters, } = req.body;
        const cleanTemplateId = sanitizeId(templateId);
        const cleanGroupId = sanitizeId(groupId);
        const cleanSmtpConfigId = sanitizeId(smtpConfigId);
        // Procura o SMTP informado ou utiliza a configuraÃ§Ã£o padrÃ£o ativa.
        let smtpConfig = cleanSmtpConfigId
            ? await db_1.prisma.smtpConfig.findUnique({
                where: { id: cleanSmtpConfigId },
            })
            : null;
        // Se o SMTP nÃ£o foi informado ou estÃ¡ inativo, procura o padrÃ£o ativo.
        if (!smtpConfig || !smtpConfig.isActive) {
            smtpConfig = await db_1.prisma.smtpConfig.findFirst({
                where: {
                    isDefault: true,
                    isActive: true,
                },
            });
            // Se nÃ£o houver um padrÃ£o ativo, utiliza outro SMTP ativo.
            if (!smtpConfig) {
                smtpConfig = await db_1.prisma.smtpConfig.findFirst({
                    where: { isActive: true },
                    orderBy: { createdAt: 'desc' },
                });
            }
        }
        let recipientCompanies = [];
        if (companyIds && companyIds.length > 0) {
            recipientCompanies = await db_1.prisma.company.findMany({
                where: {
                    id: { in: companyIds },
                    email: { not: null },
                },
            });
        }
        else if (cleanGroupId) {
            const groupCompanies = await db_1.prisma.companyGroup.findMany({
                where: { groupId: cleanGroupId },
                include: { company: true },
            });
            recipientCompanies = groupCompanies
                .map((gc) => gc.company)
                .filter((c) => c.email);
        }
        else if (useFilters && filters) {
            const where = {};
            if (filters.search) {
                where.OR = [
                    {
                        name: {
                            contains: filters.search,
                            mode: 'insensitive',
                        },
                    },
                    {
                        email: {
                            contains: filters.search,
                            mode: 'insensitive',
                        },
                    },
                ];
            }
            if (filters.city) {
                where.city = {
                    contains: filters.city,
                    mode: 'insensitive',
                };
            }
            if (filters.state) {
                where.state = {
                    contains: filters.state,
                    mode: 'insensitive',
                };
            }
            recipientCompanies = await db_1.prisma.company.findMany({
                where: { ...where, email: { not: null } },
            });
        }
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
            message: `Campanha criada com ${recipientCompanies.length} destinatÃ¡rios`,
        });
    }),
    send: (0, errorHandler_1.asyncHandler)(async (req, res) => {
        const { id } = req.params;
        const campaign = await db_1.prisma.emailCampaign.findUnique({
            where: { id },
            include: { smtpConfig: true },
        });
        if (!campaign) {
            throw new errorHandler_1.AppError('Campanha nÃ£o encontrada', 404, 'NOT_FOUND');
        }
        if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
            throw new errorHandler_1.AppError('Campanha jÃ¡ iniciada', 400, 'ALREADY_STARTED');
        }
        // Tenta usar o SMTP jÃ¡ associado Ã  campanha.
        let smtpConfig = campaign.smtpConfig;
        // Se nÃ£o houver SMTP vÃ¡lido, procura a configuraÃ§Ã£o padrÃ£o ativa.
        if (!smtpConfig || !smtpConfig.isActive) {
            smtpConfig = await db_1.prisma.smtpConfig.findFirst({
                where: {
                    isDefault: true,
                    isActive: true,
                },
            });
        }
        // Se nÃ£o houver padrÃ£o, procura qualquer SMTP ativo.
        if (!smtpConfig) {
            smtpConfig = await db_1.prisma.smtpConfig.findFirst({
                where: { isActive: true },
                orderBy: { createdAt: 'desc' },
            });
        }
        if (!smtpConfig) {
            throw new errorHandler_1.AppError('Nenhuma configuraÃ§Ã£o SMTP ativa foi encontrada.', 400, 'NO_SMTP');
        }
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
            message: 'Campanha excluÃ­da',
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
                city: 'SÃ£o Paulo',
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
        const { companyId, subject, body, signature, templateId, smtpConfigId, } = req.body;
        const company = await db_1.prisma.company.findUnique({
            where: { id: companyId },
        });
        if (!company || !company.email) {
            throw new errorHandler_1.AppError('Empresa nÃ£o encontrada ou sem e-mail', 400, 'NO_EMAIL');
        }
        const smtpConfig = smtpConfigId
            ? await db_1.prisma.smtpConfig.findUnique({
                where: { id: smtpConfigId },
            })
            : await db_1.prisma.smtpConfig.findFirst({
                where: {
                    isDefault: true,
                    isActive: true,
                },
            });
        if (!smtpConfig) {
            throw new errorHandler_1.AppError('ConfiguraÃ§Ã£o SMTP nÃ£o encontrada', 400, 'NO_SMTP');
        }
        let emailSubject = subject;
        let emailBody = body;
        let emailSignature = signature;
        if (templateId) {
            const template = await db_1.prisma.emailTemplate.findUnique({
                where: { id: templateId },
            });
            if (template) {
                emailSubject = template.subject;
                emailBody = template.body;
                emailSignature = template.signature || '';
            }
        }
        const transporter = nodemailer_1.default.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure,
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.password,
            },
        });
        const personalizedSubject = replaceVariables(emailSubject, company);
        const personalizedBody = replaceVariables(emailBody, company);
        const fullBody = buildEmailBody(personalizedBody, emailSignature);
        await transporter.sendMail({
            from: `"SINDNORTE" <${DEFAULT_FROM_EMAIL}>`,
            to: company.email,
            subject: personalizedSubject,
            html: fullBody,
        });
        const campaign = await db_1.prisma.emailCampaign.create({
            data: {
                name: `E-mail individual - ${company.name}`,
                subject: personalizedSubject,
                body: personalizedBody,
                signature: emailSignature,
                status: 'COMPLETED',
                totalCount: 1,
                sentCount: 1,
                pendingCount: 0,
                sentBy: req.user.id,
                smtpConfigId: smtpConfig.id,
                completedAt: new Date(),
            },
        });
        await db_1.prisma.emailLog.create({
            data: {
                campaignId: campaign.id,
                companyId: company.id,
                recipient: company.email,
                subject: personalizedSubject,
                body: personalizedBody,
                status: 'SENT',
                sentAt: new Date(),
            },
        });
        await (0, audit_1.logAudit)({
            action: 'SEND_SINGLE_EMAIL',
            entity: 'EMAIL',
            entityId: company.id,
            userId: req.user.id,
            details: {
                to: company.email,
                subject: personalizedSubject,
            },
            req,
        });
        res.json({
            success: true,
            message: 'E-mail enviado com sucesso',
        });
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
            throw new errorHandler_1.AppError('Anexo nÃ£o encontrado', 404, 'NOT_FOUND');
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