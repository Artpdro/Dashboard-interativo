export interface CompanyFilters {
  search?: string;
  name?: string;
  companyName?: string;
  document?: string;
  email?: string;
  phone?: string;
  city?: string;
  neighborhood?: string;
  state?: string;
  groupId?: string;
  minOverdueAmount?: number;
  maxOverdueAmount?: number;
  minPaidAmount?: number;
  maxPaidAmount?: number;
  minDueAmount?: number;
  maxDueAmount?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CsvImportResult {
  added: number;
  updated: number;
  ignored: number;
  errors: Array<{ row: number; message: string }>;
  total: number;
}

export interface EmailCampaignData {
  name: string;
  subject: string;
  body: string;
  signature?: string;
  templateId?: string;
  groupId?: string;
  companyIds?: string[];
  smtpConfigId?: string;
  useFilters?: boolean;
  filters?: CompanyFilters;
}
