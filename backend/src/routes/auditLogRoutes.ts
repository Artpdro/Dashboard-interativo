import { Router } from 'express';
import { AuditLogController } from '../controllers/auditLogController';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();
router.get('/', authenticate, requireAdmin, AuditLogController.list);
router.get('/export', authenticate, requireAdmin, AuditLogController.export);
export default router;
