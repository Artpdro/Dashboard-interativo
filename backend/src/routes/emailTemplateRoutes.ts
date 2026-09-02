import { Router } from 'express';
import { body } from 'express-validator';
import { EmailTemplateController } from '../controllers/emailTemplateController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';

const router = Router();
router.get('/', authenticate, EmailTemplateController.list);
router.get('/:id', authenticate, EmailTemplateController.getById);
router.post('/', authenticate, [
  body('name').trim().isLength({ min: 1 }),
  body('subject').trim().isLength({ min: 1 }),
  body('body').trim().isLength({ min: 1 }),
  validate,
], EmailTemplateController.create);
router.put('/:id', authenticate, EmailTemplateController.update);
router.delete('/:id', authenticate, EmailTemplateController.delete);
router.post('/:id/duplicate', authenticate, EmailTemplateController.duplicate);
export default router;
