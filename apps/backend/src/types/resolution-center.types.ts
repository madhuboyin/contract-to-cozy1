export type ResolutionActionType =
  | 'MAINTENANCE_OVERDUE'
  | 'MAINTENANCE_UNSCHEDULED'
  | 'RENEWAL_EXPIRED'
  | 'RENEWAL_UPCOMING'
  | 'HEALTH_INSIGHT'
  | 'INCIDENT'
  | 'COVERAGE_GAP'
  | 'COVERAGE_PARTIAL';

export interface ResolutionActionDTO {
  id: string;
  type: ResolutionActionType;
  title: string;
  description: string;
  dueDate?: string | null;
  daysUntilDue?: number;
  propertyId: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  entityType?: 'Warranty' | 'Insurance';
  itemId?: string;
}

export type ResolutionCaseKind =
  | 'coverage_gap'
  | 'repair_replace'
  | 'maintenance'
  | 'incident'
  | 'renewal'
  | 'health_insight';

export type ResolutionCaseStatus =
  | 'detected'
  | 'needs_analysis'
  | 'options_ready'
  | 'in_progress'
  | 'resolved';

export type ResolutionCasePriority = 'critical' | 'high' | 'medium' | 'low';

export type ResolutionCaseSource =
  | 'inventory'
  | 'coverage'
  | 'replace_repair'
  | 'incident'
  | 'health_score'
  | 'checklist';

export interface ResolutionCaseDTO {
  id: string;
  propertyId: string;
  kind: ResolutionCaseKind;
  status: ResolutionCaseStatus;
  priority: ResolutionCasePriority;
  title: string;
  summary: string;
  href: string;
  itemId?: string;
  dueDate?: string | null;
  source: ResolutionCaseSource;
  badges?: string[];
  metadata?: Record<string, unknown>;
}

export type DecisionInsightKind = 'repair_replace' | 'coverage_recommendation';

export interface DecisionInsightDTO {
  id: string;
  propertyId: string;
  kind: DecisionInsightKind;
  title: string;
  subject: string;
  summary: string;
  href: string;
  itemId?: string;
  trust: {
    confidenceLabel: string;
    freshnessLabel: string;
    sourceLabel: string;
    rationale: string;
  };
  metadata?: Record<string, unknown>;
}

export type ExecutionItemKind = 'booking';

export interface ExecutionItemDTO {
  id: string;
  propertyId: string;
  kind: ExecutionItemKind;
  title: string;
  subtitle?: string | null;
  statusLabel: string;
  href: string;
  scheduledLabel?: string | null;
  priceLabel?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResolutionCenterDataDTO {
  cases: ResolutionCaseDTO[];
  decisionInsights: DecisionInsightDTO[];
  executionItems: ExecutionItemDTO[];
  counts: {
    openCases: number;
    decisionsReady: number;
    activeBookings: number;
    activeIncidents: number;
  };
}

export interface ResolutionCenterPayloadDTO extends ResolutionCenterDataDTO {
  urgentActions: ResolutionActionDTO[];
}
