import { logger } from '../lib/logger';
export async function sendSmsNotificationJob(notificationDeliveryId: string) {
    logger.info(
      `[SMS] Sending SMS notification for delivery ${notificationDeliveryId}`
    );
  
    // TODO:
    // - Load delivery + notification
    // - Call Twilio / WhatsApp
    // - Update delivery status
  }
  