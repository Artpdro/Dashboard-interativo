import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';
import authRoutes from './routes/authRoutes';
import companyRoutes from './routes/companyRoutes';
import groupRoutes from './routes/groupRoutes';
import emailTemplateRoutes from './routes/emailTemplateRoutes';
import emailCampaignRoutes from './routes/emailCampaignRoutes';
import smtpConfigRoutes from './routes/smtpConfigRoutes';
import auditLogRoutes from './routes/auditLogRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { success: false, message: 'Muitas requisições, tente novamente mais tarde' },
});
app.use(limiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => { logger.info(`${req.method} ${req.path} - ${req.ip}`); next(); });

app.get('/health', (req, res) => { res.json({ success: true, message: 'API funcionando', timestamp: new Date().toISOString() }); });

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/templates', emailTemplateRoutes);
app.use('/api/campaigns', emailCampaignRoutes);
app.use('/api/smtp', smtpConfigRoutes);
app.use('/api/audit', auditLogRoutes);

app.use(errorHandler);
app.use((req, res) => { res.status(404).json({ success: false, message: 'Rota não encontrada' }); });

app.listen(PORT, () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`);
  logger.info(`📚 API disponível em http://localhost:${PORT}/api`);
});

export default app;
