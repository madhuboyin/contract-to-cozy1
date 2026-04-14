import { logger } from '../lib/logger';
export async function sendPushNotificationJob(notificationDeliveryId: string) {
    logger.info(
      `[PUSH] Sending push notification for delivery ${notificationDeliveryId}`
    );
  
    // TODO:
    // - Load delivery + notification
    // - Call Firebase / APNs
    // - Update delivery status
  }
  