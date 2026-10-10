import { Router } from 'express';
import { SmtpConfigController } from '../controllers/smtpConfigController';
import { authenticate, requireAdmin } from '../middlewares/auth';

// A validação dos campos (com mensagens em português) é feita no controller.
const router = Router();
router.get('/', authenticate, SmtpConfigController.list);
router.post('/test', authenticate, requireAdmin, SmtpConfigController.testDraft); // testa os dados do formulário antes de salvar
router.get('/:id', authenticate, SmtpConfigController.getById);
router.post('/', authenticate, requireAdmin, SmtpConfigController.create);
router.put('/:id', authenticate, requireAdmin, SmtpConfigController.update);
router.delete('/:id', authenticate, requireAdmin, SmtpConfigController.delete);
router.post('/:id/test', authenticate, requireAdmin, SmtpConfigController.test);
export default router;
