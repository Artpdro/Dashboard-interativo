
import { Request, Response } from 'express';
import { prisma } from '../utils/db';
import { AppError, asyncHandler } from '../utils/errorHandler';
import { logAudit } from '../utils/audit';
import { logger } from '../utils/logger';
import nodemailer from 'nodemailer';
import { Decimal } from '@prisma/client/runtime/library';
import fs from 'fs';
import path from 'path';

const DEFAULT_FROM_EMAIL = 'sindnorteigarassu2019@hotmail.com';
const campaignQueue: Map<string, { cancelled: boolean }> = new Map();

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
  logId: string,
  to: string,
  subject: string,
  html: string,
  campaignId: string,
  attachments: any[] = []
) => {
  try {
    const mailOptions: any = {
      from: `"SINDNORTE" <${DEFAULT_FROM_EMAIL}>`,
      to,
      subject,
      html,
    };

    if (attachments.length > 0) {
      mailOptions.attachments = getAttachmentsForMail(attachments);
    }

    await transporter.sendMail(mailOptions);

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

  const transporter = nodemailer.createTransport({
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

// Sanitiza campos de relaÃ§Ã£o: string vazia -> undefined
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
      throw new AppError('Campanha nÃ£o encontrada', 404, 'NOT_FOUND');
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

    // Procura o SMTP informado ou utiliza a configuraÃ§Ã£o padrÃ£o ativa.
    let smtpConfig = cleanSmtpConfigId
      ? await prisma.smtpConfig.findUnique({
          where: { id: cleanSmtpConfigId },
        })
      : null;

    // Se o SMTP nÃ£o foi informado ou estÃ¡ inativo, procura o padrÃ£o ativo.
    if (!smtpConfig || !smtpConfig.isActive) {
      smtpConfig = await prisma.smtpConfig.findFirst({
        where: {
          isDefault: true,
          isActive: true,
        },
      });

      // Se nÃ£o houver um padrÃ£o ativo, utiliza outro SMTP ativo.
      if (!smtpConfig) {
        smtpConfig = await prisma.smtpConfig.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    let recipientCompanies: any[] = [];

    if (companyIds && companyIds.length > 0) {
      recipientCompanies = await prisma.company.findMany({
        where: {
          id: { in: companyIds },
          email: { not: null },
        },
      });
    } else if (cleanGroupId) {
      const groupCompanies = await prisma.companyGroup.findMany({
        where: { groupId: cleanGroupId },
        include: { company: true },
      });

      recipientCompanies = groupCompanies
        .map((gc) => gc.company)
        .filter((c) => c.email);
    } else if (useFilters && filters) {
      const where: any = {};

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

      recipientCompanies = await prisma.company.findMany({
        where: { ...where, email: { not: null } },
      });
    }

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
      message: `Campanha criada com ${recipientCompanies.length} destinatÃ¡rios`,
    });
  }),

 send: asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  const campaign = await prisma.emailCampaign.findUnique({
    where: { id },
    include: { smtpConfig: true },
  });

  if (!campaign) {
    throw new AppError('Campanha nÃ£o encontrada', 404, 'NOT_FOUND');
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
    throw new AppError('Campanha jÃ¡ iniciada', 400, 'ALREADY_STARTED');
  }

  // Tenta usar o SMTP jÃ¡ associado Ã  campanha.
  let smtpConfig = campaign.smtpConfig;

  // Se nÃ£o houver SMTP vÃ¡lido, procura a configuraÃ§Ã£o padrÃ£o ativa.
  if (!smtpConfig || !smtpConfig.isActive) {
    smtpConfig = await prisma.smtpConfig.findFirst({
      where: {
        isDefault: true,
        isActive: true,
      },
    });
  }

  // Se nÃ£o houver padrÃ£o, procura qualquer SMTP ativo.
  if (!smtpConfig) {
    smtpConfig = await prisma.smtpConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!smtpConfig) {
    throw new AppError(
      'Nenhuma configuraÃ§Ã£o SMTP ativa foi encontrada.',
      400,
      'NO_SMTP'
    );
  }

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
      message: 'Campanha excluÃ­da',
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
          city: 'SÃ£o Paulo',
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
    const {
      companyId,
      subject,
      body,
      signature,
      templateId,
      smtpConfigId,
    } = req.body;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company || !company.email) {
      throw new AppError(
        'Empresa nÃ£o encontrada ou sem e-mail',
        400,
        'NO_EMAIL'
      );
    }

    const smtpConfig = smtpConfigId
      ? await prisma.smtpConfig.findUnique({
          where: { id: smtpConfigId },
        })
      : await prisma.smtpConfig.findFirst({
          where: {
            isDefault: true,
            isActive: true,
          },
        });

    if (!smtpConfig) {
      throw new AppError(
        'ConfiguraÃ§Ã£o SMTP nÃ£o encontrada',
        400,
        'NO_SMTP'
      );
    }

    let emailSubject = subject;
    let emailBody = body;
    let emailSignature = signature;

    if (templateId) {
      const template = await prisma.emailTemplate.findUnique({
        where: { id: templateId },
      });

      if (template) {
        emailSubject = template.subject;
        emailBody = template.body;
        emailSignature = template.signature || '';
      }
    }

    const transporter = nodemailer.createTransport({
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

    const campaign = await prisma.emailCampaign.create({
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

    await prisma.emailLog.create({
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

    await logAudit({
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
        'Anexo nÃ£o encontrado',
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
