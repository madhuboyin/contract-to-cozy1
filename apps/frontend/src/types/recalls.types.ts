// apps/frontend/src/types/recalls.types.ts
export type RecallSource = 'CPSC' | 'NHTSA' | 'MANUFACTURER' | 'USER_REPORTED';

export type RecallStatus = 'ACTIVE' | 'ENDED' | 'UNKNOWN';

export type RecallSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type RecallMatchStatus = 'OPEN' | 'NEEDS_CONFIRMATION' | 'DISMISSED' | 'RESOLVED';

export type RecallResolutionType =
  | 'FIXED'
  | 'REPLACED'
  | 'REFUNDED'
  | 'NOT_APPLICABLE'
  | 'IGNORED'
  | 'OTHER';

export type RecallRecordDTO = {
  id: string;
  source: RecallSource;
  externalId: string;
  status: RecallStatus;
  severity: RecallSeverity;
  title: string;
  summary?: string | null;
  hazard?: string | null;
  remedy?: string | null;
  remedyUrl?: string | null;
  recallUrl?: string | null;
  recalledAt?: string | null;
};

export type InventoryItemLiteDTO = {
  id: string;
  manufacturer?: string | null;
  modelNumber?: string | null;
  name?: string | null; // if you have this field; safe optional
};

export type RecallMatchDTO = {
  id: string;
  propertyId: string;
  inventoryItemId?: string | null;
  homeAssetId?: string | null;

  method: string;
  confidencePct: number;
  status: RecallMatchStatus;

  rationale?: string | null;

  confirmedAt?: string | null;
  dismissedAt?: string | null;
  resolvedAt?: string | null;
  resolutionType?: RecallResolutionType | null;
  resolutionNotes?: string | null;

  maintenanceTaskId?: string | null;

  recall: RecallRecordDTO;
  inventoryItem?: InventoryItemLiteDTO | null;
};

export type ListPropertyRecallsResponse = {
  propertyId: string;
  matches: RecallMatchDTO[];
  recallMatches: RecallMatchDTO[];
};
