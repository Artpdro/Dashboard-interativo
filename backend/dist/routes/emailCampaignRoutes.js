"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const emailCampaignController_1 = require("../controllers/emailCampaignController");
const auth_1 = require("../middlewares/auth");
const validation_1 = require("../middlewares/validation");
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.list);
router.get('/history', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.getHistory);
router.get('/:id', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.getById);
router.post('/', auth_1.authenticate, [
    (0, express_validator_1.body)('name').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('subject').trim().isLength({ min: 1 }),
    (0, express_validator_1.body)('body').trim().isLength({ min: 1 }),
    validation_1.validate,
], emailCampaignController_1.EmailCampaignController.create);
router.post('/:id/send', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.send);
router.post('/:id/pause', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.pause);
router.post('/:id/cancel', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.cancel);
router.delete('/:id', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.delete);
router.post('/preview', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.preview);
router.post('/send-single', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.sendSingle);
router.post('/:campaignId/attachments', auth_1.authenticate, upload.single('file'), emailCampaignController_1.EmailCampaignController.uploadAttachment);
router.delete('/attachments/:attachmentId', auth_1.authenticate, emailCampaignController_1.EmailCampaignController.deleteAttachment);
exports.default = router;
//# sourceMappingURL=emailCampaignRoutes.js.map