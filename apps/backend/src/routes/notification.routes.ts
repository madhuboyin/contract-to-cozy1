import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, NotificationController.list);
router.get('/unread-count', authenticate, NotificationController.unreadCount);
router.patch('/:id/read', authenticate, NotificationController.markAsRead);
router.post(
    '/deliveries/:deliveryId/retry',
    authenticate,
    NotificationController.retryDelivery
  );
  
export default router;
