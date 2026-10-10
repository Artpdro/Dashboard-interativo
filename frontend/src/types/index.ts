export interface User {
  id: string; name: string; email: string; role: 'ADMIN' | 'OPERATOR'; isActive: boolean; createdAt: string;
}

export interface Company {
  id: string; name: string; email: string | null; additionalEmails: string | null;
  phone: string | null; companyName: string | null; document: string | null;
  landline: string | null; street: string | null; number: string | null;
  complement: string | null; neighborhood: string | null; city: string | null;
  zipCode: string | null; state: string | null; overdueAmount: string | null;
  paidAmount: string | null; dueAmount: string | null; createdAt: string; updatedAt: string;
  groups: CompanyGroup[]; _count?: { emailLogs: number };
}

export interface CompanyGroup {
  id: string; groupId: string; companyId: string; group: Group;
}

export interface Group {
  id: string; name: string; description: string | null; color: string;
  createdAt: string; _count?: { companies: number }; companies?: CompanyGroup[];
}

export interface EmailTemplate {
  id: string; name: string; subject: string; body: string;
  signature: string | null; variables: any; isActive: boolean; createdAt: string;
}

export interface CampaignAttachment {
  id: string; campaignId: string; filename: string;
  originalName: string; mimeType: string; size: number; path: string; createdAt: string;
}

export interface EmailCampaign {
  id: string; name: string; subject: string; body: string;
  signature: string | null; status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  totalCount: number; sentCount: number; errorCount: number; pendingCount: number;
  createdAt: string; template?: { name: string }; group?: { name: string };
  sender?: { name: string }; smtpConfig?: { name: string }; attachments?: CampaignAttachment[];
}

export interface EmailLog {
  id: string; recipient: string; subject: string;
  status: 'PENDING' | 'SENT' | 'FAILED'; errorMessage: string | null;
  sentAt: string | null; createdAt: string;
  company?: { name: string; email: string }; campaign?: { name: string };
}

export interface SmtpConfig {
  id: string; name: string; host: string; port: number;
  user: string; from: string; fromName: string | null; secure: boolean;
  isDefault: boolean; isActive: boolean;
  /** A senha nunca é devolvida pela API; só indica se já existe uma salva. */
  hasPassword: boolean;
}

/** Empresa em versão enxuta (seleção de grupos). */
export interface CompanySlim {
  id: string; name: string; companyName: string | null; document: string | null;
  email: string | null; city: string | null; neighborhood: string | null; state: string | null;
}

export interface DashboardStats {
  totalCompanies: number; totalGroups: number; totalCampaigns: number;
  totalEmailsSent: number; totalEmailsPending: number; totalEmailsFailed: number;
  companiesWithOverdue: number; totalOverdue: number; totalPaid: number; totalDue: number;
  byState: Array<{ state: string; count: number }>;
  byCity: Array<{ city: string; count: number }>;
  byGroup: Array<{ name: string; count: number; color: string }>;
}

export interface ApiResponse<T> {
  success: boolean; data: T; message?: string;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}
