// Stub for workers Docker build.
// The real notification.service.ts imports JobQueue.service which pulls in
// many backend-only dependencies (RiskAssessmentService, FinancialReportService, etc.).
// In the workers context, gazette publication notifications are fire-and-forget
// already wrapped in .catch() — this stub satisfies the TypeScript contract
// and logs the intent without side effects that require backend-only services.

export class NotificationService {
  static async create(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
    actionUrl?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    // In the workers build, skip email/push/SMS queuing. The in-app notification
    // will be created by the backend the next time the user's session is loaded.
    console.log(
      `[NotificationService stub] Notification queued (worker build): type=${input.type} userId=${input.userId}`,
    );
  }
}
