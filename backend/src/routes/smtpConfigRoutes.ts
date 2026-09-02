import { Router } from 'express';
import { body } from 'express-validator';
import { SmtpConfigController } from '../controllers/smtpConfigController';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { validate } from '../middlewares/validation';

const router = Router();
router.get('/', authenticate, SmtpConfigController.list);
router.get('/:id', authenticate, SmtpConfigController.getById);
router.post('/', authenticate, requireAdmin, [
  body('name').trim().isLength({ min: 1 }),
  body('host').trim().isLength({ min: 1 }),
  body('port').isInt({ min: 1, max: 65535 }),
  body('user').trim().isLength({ min: 1 }),
  body('password').trim().isLength({ min: 1 }),
  body('from').isEmail(),
  validate,
], SmtpConfigController.create);
router.put('/:id', authenticate, requireAdmin, SmtpConfigController.update);
router.delete('/:id', authenticate, requireAdmin, SmtpConfigController.delete);
router.post('/:id/test', authenticate, SmtpConfigController.test);
export default router;
