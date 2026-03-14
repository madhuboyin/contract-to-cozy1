// Home Digital Will — frontend types

export type DigitalWillStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type DigitalWillReadiness = 'NOT_STARTED' | 'IN_PROGRESS' | 'READY' | 'NEEDS_REVIEW';
export type SectionType =
  | 'EMERGENCY'
  | 'CRITICAL_INFO'
  | 'CONTRACTORS'
  | 'MAINTENANCE_KNOWLEDGE'
  | 'UTILITIES'
  | 'INSURANCE'
  | 'HOUSE_RULES'
  | 'GENERAL_NOTES';
export type EntryType =
  | 'INSTRUCTION'
  | 'LOCATION_NOTE'
  | 'CONTACT_NOTE'
  | 'SERVICE_PREFERENCE'
  | 'MAINTENANCE_RULE'
  | 'POLICY_NOTE'
  | 'ACCESS_NOTE'
  | 'GENERAL_NOTE';
export type EntryPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DigitalWillEntry {
  id: string;
  sectionId: string;
  entryType: EntryType;
  title: string;
  content: string | null;
  summary: string | null;
  priority: EntryPriority;
  sortOrder: number;
  isPinned: boolean;
  isEmergency: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DigitalWillSection {
  id: string;
  digitalWillId: string;
  type: SectionType;
  title: string;
  description: string | null;
  sortOrder: number;
  isEnabled: boolean;
  entries: DigitalWillEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface DigitalWillCounts {
  sectionCount: number;
  entryCount: number;
  trustedContactCount: number;
  hasEmergencyEntries: boolean;
}

export interface DigitalWill {
  id: string;
  propertyId: string;
  title: string;
  status: DigitalWillStatus;
  readiness: DigitalWillReadiness;
  completionPercent: number;
  setupCompletedAt: string | null;
  lastReviewedAt: string | null;
  publishedAt: string | null;
  sections: DigitalWillSection[];
  trustedContacts: unknown[];
  counts: DigitalWillCounts;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEntryInput {
  entryType: EntryType;
  title: string;
  content?: string | null;
  summary?: string | null;
  priority?: EntryPriority;
  isPinned?: boolean;
  isEmergency?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface UpdateEntryInput {
  entryType?: EntryType;
  title?: string;
  content?: string | null;
  summary?: string | null;
  priority?: EntryPriority;
  isPinned?: boolean;
  isEmergency?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface UpdateWillInput {
  title?: string;
  status?: DigitalWillStatus;
  readiness?: DigitalWillReadiness;
  lastReviewedAt?: string | null;
  publishedAt?: string | null;
}
