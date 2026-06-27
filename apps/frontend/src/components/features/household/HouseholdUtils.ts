import type { HouseholdRole, HouseholdActivityType } from '@/types';

export const ROLE_LABELS: Record<HouseholdRole, string> = {
  OWNER: 'Owner',
  CONTRIBUTOR: 'Contributor',
  VIEWER: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<HouseholdRole, string> = {
  OWNER: 'Full access — can invite members, change roles, and manage settings',
  CONTRIBUTOR: 'Can view everything, complete tasks, log events, and add inventory',
  VIEWER: 'Read-only access — cannot create or modify anything',
};

export const ROLE_BADGE_COLORS: Record<HouseholdRole, string> = {
  OWNER: 'bg-amber-100 text-amber-800',
  CONTRIBUTOR: 'bg-blue-100 text-blue-800',
  VIEWER: 'bg-gray-100 text-gray-700',
};

export const ACTIVITY_LABELS: Record<HouseholdActivityType, string> = {
  MEMBER_INVITED: 'invited a member',
  MEMBER_JOINED: 'joined the household',
  MEMBER_REMOVED: 'removed a member',
  MEMBER_ROLE_CHANGED: 'changed a member role',
  TASK_ASSIGNED: 'assigned a task',
  TASK_COMPLETED: 'completed a task',
  TASK_CREATED: 'created a task',
  HOME_EVENT_LOGGED: 'logged a home event',
  INVENTORY_ITEM_ADDED: 'added an inventory item',
  INCIDENT_UPDATED: 'updated an incident',
  CLAIM_FILED: 'filed a claim',
  DOCUMENT_UPLOADED: 'uploaded a document',
  GUIDANCE_STEP_COMPLETED: 'completed a guidance step',
  NOTE_ADDED: 'added a note',
};

export function getMemberDisplayName(member: {
  displayName?: string | null;
  user: { firstName: string; lastName: string };
}) {
  return member.displayName ?? `${member.user.firstName} ${member.user.lastName}`;
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
