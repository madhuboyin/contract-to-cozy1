import type { NotificationCategory, NotificationUrgency } from '../../productFramework/notificationPolicy.contract';
import type { AskNotificationDestination, AskNotificationDestinationKind } from './governance/askNotificationContinuationRegistry';

export const ASK_NOTIFICATION_CONTRACT_VERSION = 'ask-notification-v1' as const;
export const ASK_NOTIFICATION_DEFAULT_LIMIT = 25;
export const ASK_NOTIFICATION_MAX_LIMIT = 50;

/** FR-NOTIF-001: one inbox item. Pointers and labels only; the continuation is resolved when it is opened, never replayed from this copy. */
export interface AskNotificationItem {
  id: string;
  type: string;
  category: NotificationCategory;
  categoryLabel: string;
  urgency: NotificationUrgency;
  title: string;
  message: string;
  /** Why this reached the person, in plain words (from its category and urgency). */
  whyItAppeared: string;
  propertyId: string | null;
  /** The home's name, only while the person still has access to it. */
  propertyLabel: string | null;
  /** NONE: not about one home. LOST: about a home the person no longer has access to. */
  propertyAccess: 'ACCESSIBLE' | 'LOST' | 'NONE';
  createdAt: string;
  /** The producer's own expiry, or null when it states none (never invented). */
  expiresAt: string | null;
  expired: boolean;
  isRead: boolean;
  dismissed: boolean;
  /** The person marked this notification useful (the same feedback the Notifications page records). */
  markedUseful: boolean;
  /** Where opening it will lead, known without reading anything: used to label the action, not to navigate. */
  continuationKind: AskNotificationDestinationKind | 'NONE';
  /** This category's external delivery is muted or snoozed by the person. The in-app item is always kept. */
  deliveryPaused: 'MUTED' | 'SNOOZED' | null;
}

export interface AskNotificationPage {
  contractVersion: typeof ASK_NOTIFICATION_CONTRACT_VERSION;
  generatedAt: string;
  view: 'INBOX' | 'DISMISSED';
  total: number;
  unreadCount: number;
  dismissedCount: number;
  nextCursor: string | null;
  truncated: boolean;
  query: { unreadOnly: boolean; category: NotificationCategory | null; propertyId: string | null };
  filterOptions: { categories: Array<{ value: string; label: string }>; properties: Array<{ value: string; label: string }> };
  items: AskNotificationItem[];
}

export type AskNotificationOpenOutcome = 'AVAILABLE' | 'DELETED' | 'ACCESS_LOST' | 'UNAVAILABLE';

export interface AskNotificationOpenResult {
  contractVersion: typeof ASK_NOTIFICATION_CONTRACT_VERSION;
  notificationId: string;
  outcome: AskNotificationOpenOutcome;
  destination: AskNotificationDestination | null;
  propertyId: string | null;
  /** True when the destination is a stored dashboard link, not an Ask destination. */
  legacy: boolean;
  message: string;
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  SAFETY: 'Safety', ACTIVE_DAMAGE: 'Active damage', MATERIAL_DEADLINE: 'Deadlines', WORKFLOW: 'Your requests and claims', MAINTENANCE: 'Maintenance', COVERAGE: 'Coverage',
  PROJECT: 'Projects', RECALL: 'Recalls', ACCOUNT: 'Account', NEIGHBORHOOD: 'Neighborhood', GENERAL: 'General', ALL: 'Everything else', REFINANCE: 'Refinance alerts', SAVINGS_BENEFITS: 'Savings and benefits',
};

export const NOTIFICATION_WHY: Record<NotificationCategory, string> = {
  SAFETY: 'Something that may affect safety was detected for your home.',
  ACTIVE_DAMAGE: 'Possible active damage was detected, so it is shown right away.',
  MATERIAL_DEADLINE: 'A date you are tracking is coming up or has passed.',
  WORKFLOW: 'Something you started, a request, claim or booking, changed.',
  MAINTENANCE: 'A maintenance reminder for your home.',
  COVERAGE: 'Something changed on a policy or warranty you have recorded.',
  PROJECT: 'A project or quote you are following has an update.',
  RECALL: 'A recall may apply to something in your home.',
  ACCOUNT: 'A notice about your account.',
  NEIGHBORHOOD: 'A change was noticed near your home.',
  GENERAL: 'An update about your home.',
  ALL: 'An update about your home.',
  REFINANCE: 'You asked to be told about refinance rate changes.',
  SAVINGS_BENEFITS: 'You asked to be told about savings and benefits.',
};
