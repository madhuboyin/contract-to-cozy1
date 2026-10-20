// Creating a home-record export: the one place the rules live, shared by the route (POST /properties/:propertyId/reports/exports) and the
// Ask command (HOME_RECORD_EXPORT) so a conversation can never create one the route would refuse.
import type { HomeReportExport, HomeReportExportType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from './analytics';
import { resolvePropertyAccess } from './propertyAccess.service';
import { getAggregationContextEnvelope } from './aggregationContext/context';
import { normalizeAskRecordExportRequest } from './ask/askRecordExportSelection';
import type { ReportPackSelection } from './planningContext/reportPackSections';


export type CreateHomeReportExportResult =
  | { kind: 'CREATED'; export: HomeReportExport; selection: ReportPackSelection; propertyContext: unknown }
  /** The home's report context is not ready (not enough is recorded for a report), so nothing was created. */
  | { kind: 'CONTEXT_NOT_READY'; propertyContext: unknown }
  /** An export for this home is already pending or generating; a second would waste a generation and orphan an upload. */
  | { kind: 'IN_FLIGHT'; exportId: string };

/**
 * Validates the section choice against the Record section registry (throws InvalidExportSelectionError), checks the report context, refuses
 * a second concurrent export, then records a PENDING export with its CREATED event. The worker generates the PDF.
 */
export async function createHomeReportExportRecord(input: {
  userId: string;
  propertyId: string;
  type?: string;
  sections?: unknown;
  locale?: string;
}): Promise<CreateHomeReportExportResult> {
  const { userId, propertyId } = input;
  const type = input.type ?? 'HOME_REPORT_PACK';
  const access = await resolvePropertyAccess(userId, propertyId);
  const selection = normalizeAskRecordExportRequest({ sections: input.sections, type, role: access?.role ?? 'VIEWER' });

  const propertyContext = await getAggregationContextEnvelope(propertyId, userId, 'REPORT_SUMMARIES');
  if (propertyContext.decision.status !== 'APPLICABLE') return { kind: 'CONTEXT_NOT_READY', propertyContext };

  // W3 (exports, concurrent duplicate requests): a double-click or two open tabs used to trigger two full generations and two uploads.
  const inFlight = await prisma.homeReportExport.findFirst({ where: { propertyId, status: { in: ['PENDING', 'GENERATING'] } }, select: { id: true } });
  if (inFlight) return { kind: 'IN_FLIGHT', exportId: inFlight.id };

  const created = await prisma.homeReportExport.create({
    data: {
      userId, propertyId, type: type as HomeReportExportType, status: 'PENDING', sections: selection as unknown as object, templateVersion: 1, dataVersion: 1,
      timezone: 'America/New_York', locale: input.locale || 'en-US', // Kept for 30 days (a shared link has its own, shorter default).
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.homeReportExportEvent.create({ data: { reportId: created.id, type: 'CREATED' } });
  analyticsEmitter.track({
    eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.DASHBOARD, featureKey: AnalyticsFeature.HOME_REPORT_EXPORT,
    metadataJson: { actionType: 'create_export', type: created.type },
  });
  return { kind: 'CREATED', export: created, selection, propertyContext };
}
