import express from 'express';
import { sendMessage, getHistory } from '../controllers/chatController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/send', authMiddleware, sendMessage);
router.get('/history', authMiddleware, getHistory);

export default router;
