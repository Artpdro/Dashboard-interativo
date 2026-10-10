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
import { mountFrontend } from './utils/staticFrontend';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const isProd = process.env.NODE_ENV === 'production';
// Em produção (uso local) escuta só neste computador; defina HOST=0.0.0.0 no .env para liberar a rede
const HOST = process.env.HOST || (isProd ? '127.0.0.1' : undefined);

app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
  hsts: false,
}));
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || (isProd ? 3000 : 100),
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

mountFrontend(app);

app.use(errorHandler);
app.use((req, res) => { res.status(404).json({ success: false, message: 'Rota não encontrada' }); });

const onListen = () => {
  logger.info(`🚀 Servidor rodando na porta ${PORT}`);
  logger.info(`📚 API disponível em http://localhost:${PORT}/api`);
};
if (HOST) app.listen(PORT, HOST, onListen); else app.listen(PORT, onListen);

export default app;
