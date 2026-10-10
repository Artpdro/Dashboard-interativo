
import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import { logger } from '../utils/logger';
import { Decimal } from '@prisma/client/runtime/library';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  buildFrom,
  buildTransport,
  deliverMail,
  isValidEmail,
  resolveSmtpConfig,
  SmtpConfigRecord,
} from '../utils/emailSender';
import { findAllCompanyIds } from '../utils/companySearch';
const campaignQueue: Map<string, { cancelled: boolean }> = new Map();

// Envios individuais recentes (chave -> horário), para barrar duplo clique / reenvio acidental.
const SINGLE_SEND_WINDOW_MS = 30_000;
const recentSingleSends: Map<string, number> = new Map();
const pruneRecentSingleSends = () => {
  const limit = Date.now() - SINGLE_SEND_WINDOW_MS;
  for (const [key, at] of recentSingleSends) if (at < limit) recentSingleSends.delete(key);
};

const replaceVariables = (text: string, company: any): string => {
  if (!text) return '';
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

const buildEmailBody = (body: string, signature?: string | null): string => {
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

const getAttachmentsForMail = (attachments: any[]): any[] => {
  return attachments.map((att) => ({
    filename: att.originalName,
    path: att.path,
  }));
};

const sendEmail = async (
  transporter: any,
  from: { name: string; address: string },
  logId: string,
  to: string,
  subject: string,
  html: string,
  campaignId: string,
  attachments: any[] = []
) => {
  try {
    const mailOptions: any = { from, to, subject, html };

    if (attachments.length > 0) {
      mailOptions.attachments = getAttachmentsForMail(attachments);
    }

    // Só conta como enviado quando o servidor SMTP aceita a mensagem.
    await deliverMail(transporter, mailOptions);

    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: 'SENT', sentAt: new Date() },
    });

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        sentCount: { increment: 1 },
        pendingCount: { decrement: 1 },
      },
    });

    return { success: true };
  } catch (error: any) {
    await prisma.emailLog.update({
      where: { id: logId },
      data: { status: 'FAILED', errorMessage: error.message },
    });

    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: {
        errorCount: { increment: 1 },
        pendingCount: { decrement: 1 },
      },
    });

    return { success: false, error: error.message };
  }
};

const processCampaign = async (campaignId: string) => {
  const campaign = await prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { smtpConfig: true, attachments: true },
  });

  if (!campaign || campaign.status !== 'SENDING') return;

  const smtpConfig = campaign.smtpConfig;

  if (!smtpConfig || !smtpConfig.isActive) {
    await prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { status: 'PAUSED' },
    });
    return;
  }

  const transporter = buildTransport(smtpConfig, { pool: true });
  const from = buildFrom(smtpConfig);

  const pendingLogs = await prisma.emailLog.findMany({
    where: { campaignId, status: 'PENDING' },
    include: { company: true },
    take: 50,
  });

  if (pendingLogs.length === 0) {
    await prisma.emailCampaign.update({
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
      await prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: 'CANCELLED' },
      });

      campaignQueue.delete(campaignId);
      return;
    }

    const personalizedBody = replaceVariables(campaign.body, log.company);
    const personalizedSubject = replaceVariables(campaign.subject, log.company);
    const fullBody = buildEmailBody(personalizedBody, campaign.signature);

    await sendEmail(
      transporter,
      from,
      log.id,
      log.recipient,
      personalizedSubject,
      fullBody,
      campaignId,
      campaign.attachments
    );

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  setTimeout(() => processCampaign(campaignId), 1000);
};

// Sanitiza campos de relação: string vazia -> undefined
const sanitizeId = (val: any): string | undefined => {
  if (val === '' || val === null || val === undefined) return undefined;
  return String(val);
};

export const EmailCampaignController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const campaigns = await prisma.emailCampaign.findMany({
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

  getById: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const campaign = await prisma.emailCampaign.findUnique({
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
      throw new AppError('Campanha não encontrada', 404, 'NOT_FOUND');
    }

    res.json({ success: true, data: campaign });
  }),

  create: asyncHandler(async (req: any, res: Response) => {
    const {
      name,
      subject,
      body,
      signature,
      templateId,
      groupId,
      companyIds,
      smtpConfigId,
      useFilters,
      filters,
    } = req.body;

    const cleanTemplateId = sanitizeId(templateId);
    const cleanGroupId = sanitizeId(groupId);
    const cleanSmtpConfigId = sanitizeId(smtpConfigId);
    // SMTP escolhido (se ativo) -> padrão ativo -> qualquer ativo. Na criação pode ficar vazio; no envio é exigido.
    let smtpConfig: SmtpConfigRecord | null = null;
    try {
      smtpConfig = await resolveSmtpConfig(cleanSmtpConfigId);
    } catch {
      smtpConfig = null;
    }

    let recipientCompanies: any[] = [];

    if (companyIds && companyIds.length > 0) {
      const uniqueIds = Array.from(new Set<string>(companyIds));
      recipientCompanies = await prisma.company.findMany({
        where: { id: { in: uniqueIds }, email: { not: null } },
      });
    } else if (cleanGroupId) {
      const groupCompanies = await prisma.companyGroup.findMany({
        where: { groupId: cleanGroupId },
        include: { company: true },
      });

      recipientCompanies = groupCompanies.map((gc) => gc.company).filter((c) => c.email);
    } else if (useFilters && filters) {
      const ids = await findAllCompanyIds(
        {
          search: filters.search,
          name: filters.name,
          document: filters.document,
          city: filters.city,
          neighborhood: filters.neighborhood,
          state: filters.state,
        },
        20000
      );
      recipientCompanies = ids.length
        ? await prisma.company.findMany({ where: { id: { in: ids }, email: { not: null } } })
        : [];
    }

    // Mantém só e-mails válidos e remove destinatários repetidos (mesmo e-mail em empresas diferentes).
    const seenEmails = new Set<string>();
    let skippedInvalid = 0;
    let skippedDuplicate = 0;
    recipientCompanies = recipientCompanies.filter((company) => {
      const email = String(company.email || '').trim();
      if (!isValidEmail(email)) {
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
      throw new AppError(
        'Nenhuma empresa com e-mail encontrada',
        400,
        'NO_RECIPIENTS'
      );
    }

    const recentCampaign = await prisma.emailCampaign.findFirst({
      where: {
        name,
        createdAt: {
          gte: new Date(Date.now() - 60000),
        },
      },
    });

    if (recentCampaign) {
      throw new AppError(
        'Campanha com mesmo nome criada recentemente',
        400,
        'DUPLICATE_CAMPAIGN'
      );
    }

    const campaign = await prisma.emailCampaign.create({
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
      recipient: company.email!,
      subject: replaceVariables(subject, company),
      body: replaceVariables(body, company),
      status: 'PENDING' as const,
    }));

    await prisma.emailLog.createMany({
      data: emailLogsData,
    });

    await logAudit({
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

 send: asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
    include: { smtpConfig: true },
  });

  if (!campaign) {
    throw new AppError('Campanha não encontrada', 404, 'NOT_FOUND');
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
    throw new AppError('Campanha já iniciada', 400, 'ALREADY_STARTED');
  }
  // SMTP da campanha (se ativo) -> padrão ativo -> qualquer ativo; erro claro quando não há nenhum.
  const smtpConfig = await resolveSmtpConfig(campaign.smtpConfigId);


  // Associa o SMTP e inicia a campanha.
  await prisma.emailCampaign.update({
    where: { id },
    data: {
      smtpConfigId: smtpConfig.id,
      status: 'SENDING',
      startedAt: new Date(),
    },
  });

  campaignQueue.set(id, { cancelled: false });

  setTimeout(() => processCampaign(id), 100);

  await logAudit({
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

  pause: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;

    await prisma.emailCampaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    if (campaignQueue.has(id)) {
      campaignQueue.get(id)!.cancelled = true;
    }

    await logAudit({
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

  cancel: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;

    await prisma.emailCampaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    if (campaignQueue.has(id)) {
      campaignQueue.get(id)!.cancelled = true;
    }

    await logAudit({
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

  delete: asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;

    const campaign = await prisma.emailCampaign.findUnique({
      where: { id },
      include: { attachments: true },
    });

    if (campaign) {
      for (const att of campaign.attachments) {
        try {
          fs.unlinkSync(att.path);
        } catch {}
      }
    }

    await prisma.emailCampaign.delete({
      where: { id },
    });

    await logAudit({
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

  preview: asyncHandler(async (req: any, res: Response) => {
    const {
      templateId,
      companyId,
      subject,
      body,
      signature,
    } = req.body;

    let templateSubject = subject;
    let templateBody = body;
    let templateSignature = signature;

    if (templateId) {
      const template = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      if (template) {
        templateSubject = template.subject;
        templateBody = template.body;
        templateSignature = template.signature || '';
      }
    }

    const company = companyId
      ? await prisma.company.findUnique({
          where: { id: companyId },
        })
      : {
          name: 'Empresa Exemplo',
          companyName: 'Empresa Exemplo LTDA',
          email: 'exemplo@email.com',
          city: 'São Paulo',
          state: 'SP',
          overdueAmount: new Decimal(1500.00),
          paidAmount: new Decimal(5000.00),
          dueAmount: new Decimal(2500.00),
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

  sendSingle: asyncHandler(async (req: any, res: Response) => {
    const { companyId, subject, body, signature, templateId, smtpConfigId } = req.body;

    if (!companyId) {
      throw new AppError('Selecione a empresa destinatária.', 400, 'VALIDATION_ERROR');
    }

    const company = await prisma.company.findUnique({ where: { id: String(companyId) } });
    if (!company) {
      throw new AppError('Empresa não encontrada.', 404, 'NOT_FOUND');
    }

    const recipient = (company.email || '').trim();
    if (!recipient) {
      throw new AppError('Esta empresa não tem e-mail cadastrado.', 400, 'NO_EMAIL');
    }
    if (!isValidEmail(recipient)) {
      throw new AppError(`O e-mail cadastrado (${recipient}) é inválido. Corrija o cadastro da empresa.`, 400, 'INVALID_EMAIL');
    }

    let emailSubject: string = typeof subject === 'string' ? subject : '';
    let emailBody: string = typeof body === 'string' ? body : '';
    let emailSignature: string | null = typeof signature === 'string' ? signature : null;

    if (templateId) {
      const template = await prisma.emailTemplate.findUnique({ where: { id: String(templateId) } });
      if (template) {
        emailSubject = template.subject;
        emailBody = template.body;
        emailSignature = template.signature || '';
      }
    }

    if (!emailSubject.trim() || !emailBody.trim()) {
      throw new AppError('Preencha o assunto e a mensagem do e-mail.', 400, 'VALIDATION_ERROR');
    }

    // Mesma configuração SMTP salva usada pelas campanhas (escolhida -> padrão -> qualquer ativa).
    const smtpConfig = await resolveSmtpConfig(sanitizeId(smtpConfigId));

    // Evita envio repetido por clique duplo/reenvio acidental.
    const sendKey = crypto
      .createHash('sha1')
      .update(`${req.user.id}|${company.id}|${emailSubject}|${emailBody}`)
      .digest('hex');
    pruneRecentSingleSends();
    if (recentSingleSends.has(sendKey)) {
      throw new AppError(
        'Este e-mail já foi enviado para esta empresa há instantes. Aguarde antes de enviar novamente.',
        409,
        'DUPLICATE_SEND'
      );
    }
    recentSingleSends.set(sendKey, Date.now());

    const personalizedSubject = replaceVariables(emailSubject, company);
    const personalizedBody = replaceVariables(emailBody, company);
    const fullBody = buildEmailBody(personalizedBody, emailSignature);

    // Registra a tentativa ANTES de enviar: sucesso ou falha ficam no histórico.
    const campaign = await prisma.emailCampaign.create({
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

    const emailLog = await prisma.emailLog.create({
      data: {
        campaignId: campaign.id,
        companyId: company.id,
        recipient,
        subject: personalizedSubject,
        body: personalizedBody,
        status: 'PENDING',
      },
    });

    const transporter = buildTransport(smtpConfig);
    try {
      const delivery = await deliverMail(transporter, {
        from: buildFrom(smtpConfig),
        to: recipient,
        subject: personalizedSubject,
        html: fullBody,
      });

      await prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: 'SENT', sentAt: new Date() } });
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED', sentCount: 1, pendingCount: 0, completedAt: new Date() },
      });

      await logAudit({
        action: 'SEND_SINGLE_EMAIL',
        entity: 'EMAIL',
        entityId: company.id,
        userId: req.user.id,
        companyId: company.id,
        details: { to: recipient, subject: personalizedSubject, messageId: delivery.messageId },
        req,
      });
      logger.info(`E-mail individual enviado para ${recipient} (campanha ${campaign.id})`);

      res.json({
        success: true,
        message: `E-mail enviado com sucesso para ${recipient}`,
        data: { recipient, messageId: delivery.messageId, campaignId: campaign.id },
      });
    } catch (error: any) {
      recentSingleSends.delete(sendKey); // permite tentar de novo depois de corrigir o problema

      await prisma.emailLog.update({ where: { id: emailLog.id }, data: { status: 'FAILED', errorMessage: error.message } });
      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'COMPLETED', errorCount: 1, pendingCount: 0, completedAt: new Date() },
      });

      await logAudit({
        action: 'SEND_SINGLE_EMAIL_FAILED',
        entity: 'EMAIL',
        entityId: company.id,
        userId: req.user.id,
        companyId: company.id,
        details: { to: recipient, subject: personalizedSubject, error: error.message },
        req,
      });
      logger.warn(`Falha no envio individual para ${recipient}: ${error.message}`);

      throw new AppError(`Não foi possível enviar o e-mail: ${error.message}`, 502, 'SEND_FAILED');
    } finally {
      transporter.close();
    }
  }),

  getHistory: asyncHandler(async (req: any, res: Response) => {
    const { page = 1, limit = 20 } = req.query;

    const [logs, total] = await Promise.all([
      prisma.emailLog.findMany({
        include: {
          company: { select: { name: true, email: true } },
          campaign: { select: { name: true, subject: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.emailLog.count(),
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

  uploadAttachment: asyncHandler(async (req: any, res: Response) => {
    const { campaignId } = req.params;

    if (!req.file) {
      throw new AppError('Nenhum arquivo enviado', 400, 'NO_FILE');
    }

    const uploadDir = path.join(
      process.cwd(),
      'uploads',
      'campaigns',
      campaignId
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(uploadDir, filename);

    fs.writeFileSync(filePath, req.file.buffer);

    const attachment = await prisma.campaignAttachment.create({
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

  deleteAttachment: asyncHandler(async (req: any, res: Response) => {
    const { attachmentId } = req.params;

    const attachment = await prisma.campaignAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new AppError(
        'Anexo não encontrado',
        404,
        'NOT_FOUND'
      );
    }

    try {
      fs.unlinkSync(attachment.path);
    } catch {}

    await prisma.campaignAttachment.delete({
      where: { id: attachmentId },
    });

    res.json({
      success: true,
      message: 'Anexo removido',
    });
  }),
};
