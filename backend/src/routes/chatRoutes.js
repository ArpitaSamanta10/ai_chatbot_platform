import express from 'express';
import {
  deleteConversation,
  getConversationMessages,
  getConversations,
  getHistory,
  pinConversation,
  renameConversation,
  sendMessage,
} from '../controllers/chatController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authMiddleware);

router.post('/send', sendMessage);
router.get('/history', getHistory);
router.get('/conversations', getConversations);
router.get('/messages/:id', getConversationMessages);
router.patch('/conversations/:id/rename', renameConversation);
router.patch('/conversations/:id/pin', pinConversation);
router.delete('/conversations/:id', deleteConversation);

export default router;
