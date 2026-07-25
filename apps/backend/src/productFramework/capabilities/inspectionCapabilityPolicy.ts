import type { CapabilityPersonalizationSource } from './capabilityRecommendationContext';

const REVIEWED_INSPECTION_JOURNEYS = new Set([
  'inspection_followup_resolution',
  'general_inspection_journey',
  'inspection_quote_journey',
  'pre_purchase_inspection_journey',
  'annual_maintenance_inspection_journey',
  'post_repair_inspection_journey',
]);

export function inspectionJourneyTrigger(
  journeyTypeKey?: string | null,
): string | null {
  return journeyTypeKey && REVIEWED_INSPECTION_JOURNEYS.has(journeyTypeKey)
    ? 'INSPECTION_DOCUMENT_AVAILABLE'
    : null;
}

export function inspectionDocumentCapabilitySource(document: {
  id: string;
  type: string;
  updatedAt: Date;
}): CapabilityPersonalizationSource | null {
  if (document.type !== 'INSPECTION_REPORT') return null;
  return {
    id: `inspection-document:${document.id}`,
    definitionCode: 'INSPECTION_DOCUMENT_AVAILABLE',
    status: 'ACTIVE',
    recommendationVersion: 'inspection-document-v1',
    sourceEntityType: 'DOCUMENT',
    sourceEntityId: document.id,
    lastEvaluatedAt: document.updatedAt.toISOString(),
  };
}

export function inspectionReportCapabilitySource(report: {
  id: string;
  updatedAt: Date;
}): CapabilityPersonalizationSource {
  return {
    id: `inspection-report:${report.id}`,
    definitionCode: 'INSPECTION_DOCUMENT_AVAILABLE',
    status: 'ACTIVE',
    recommendationVersion: 'inspection-report-v1',
    sourceEntityType: 'DOCUMENT',
    sourceEntityId: report.id,
    lastEvaluatedAt: report.updatedAt.toISOString(),
  };
}
