import { Router } from 'express';
import { body } from 'express-validator';
import { EmailCampaignController } from '../controllers/emailCampaignController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validation';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/', authenticate, EmailCampaignController.list);
router.get('/history', authenticate, EmailCampaignController.getHistory);
router.get('/:id', authenticate, EmailCampaignController.getById);
router.post('/', authenticate, [
  body('name').trim().isLength({ min: 1 }),
  body('subject').trim().isLength({ min: 1 }),
  body('body').trim().isLength({ min: 1 }),
  validate,
], EmailCampaignController.create);
router.post('/:id/send', authenticate, EmailCampaignController.send);
router.post('/:id/pause', authenticate, EmailCampaignController.pause);
router.post('/:id/cancel', authenticate, EmailCampaignController.cancel);
router.delete('/:id', authenticate, EmailCampaignController.delete);
router.post('/preview', authenticate, EmailCampaignController.preview);
router.post('/send-single', authenticate, EmailCampaignController.sendSingle);
router.post('/:campaignId/attachments', authenticate, upload.single('file'), EmailCampaignController.uploadAttachment);
router.delete('/attachments/:attachmentId', authenticate, EmailCampaignController.deleteAttachment);

export default router;
