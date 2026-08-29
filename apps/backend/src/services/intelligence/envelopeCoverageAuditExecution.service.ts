import { prisma } from '../../lib/prisma';
import {
  queryIntelligenceEnvelopeForCoverage,
  type IntelligenceEnvelopeCoveragePage,
} from '../intelligenceEnvelope';
import {
  auditEnvelopeCoverage,
  type ObservedEnvelopeCapability,
} from './envelopeCoverageAudit.service';
import {
  reconcileEnvelopeCoverageFindings,
  type EnvelopeCoverageReconciliationResult,
} from './envelopeCoverageFinding.repository';
import {
  finalizeCoverageAuditRun,
  type CoverageAuditRunSummary,
} from './envelopeCoverageRun.repository';

const DEFAULT_PROPERTY_PAGE_SIZE = 100;
const DEFAULT_ENVELOPE_PAGE_SIZE = 100;
const DEFAULT_MAX_ENVELOPE_PAGES_PER_PROPERTY = 1_000;
const COVERAGE_AUDIT_AGENT_ID = 'envelope-promotion-coverage-audit';

function exactObservedCapabilityKey(capability: ObservedEnvelopeCapability): string {
  return [
    capability.producerModel,
    capability.type,
    capability.domain,
    capability.nativeSubtype,
    capability.propositionType ?? '',
  ].join('\u001f');
}

type AuditProperty = Readonly<{
  id: string;
  homeownerProfile: { userId: string } | null;
}>;

export type EnvelopeCoverageAuditExecutionDependencies = Readonly<{
  listProperties(input: { afterId: string | null; take: number }): Promise<readonly AuditProperty[]>;
  queryProperty(input: {
    propertyId: string;
    userId: string;
    cursor: string | null;
    limit: number;
  }): Promise<IntelligenceEnvelopeCoveragePage>;
  reconcile(
    findings: ReturnType<typeof auditEnvelopeCoverage>['findings'],
    options: { complete: boolean; auditedAt: Date },
  ): Promise<EnvelopeCoverageReconciliationResult>;
  finalizeRun(input: {
    runId: string;
    auditedAt: Date;
    finishedAt: Date;
    findings: ReturnType<typeof auditEnvelopeCoverage>['findings'];
    summary: CoverageAuditRunSummary;
  }): Promise<EnvelopeCoverageReconciliationResult>;
  now(): Date;
}>;

export type EnvelopeCoverageAuditExecutionResult = Readonly<{
  status: 'COMPLETE' | 'PARTIAL';
  evaluationStatus: 'NOT_MEASURED';
  propertiesExamined: number;
  propertiesAudited: number;
  ownerUnresolved: number;
  propertyFailures: number;
  adapterFailures: number;
  envelopePagesRead: number;
  observedCapabilities: number;
  findings: number;
  reviewRequired: number;
  declarationDrift: number;
  certificationIssues: readonly string[];
  diagnostics: readonly string[];
  reconciliation: EnvelopeCoverageReconciliationResult;
}>;

const DEFAULT_DEPENDENCIES: EnvelopeCoverageAuditExecutionDependencies = {
  async listProperties({ afterId, take }) {
    return prisma.property.findMany({
      where: afterId ? { id: { gt: afterId } } : undefined,
      select: { id: true, homeownerProfile: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take,
    });
  },
  queryProperty({ propertyId, userId, cursor, limit }) {
    return queryIntelligenceEnvelopeForCoverage({
      propertyId,
      principal: { kind: 'BACKGROUND_JOB_RESOLVED_OWNER', userId },
      requestingAgentId: COVERAGE_AUDIT_AGENT_ID,
      ...(cursor ? { cursor } : {}),
      limit,
    });
  },
  reconcile: reconcileEnvelopeCoverageFindings,
  finalizeRun: finalizeCoverageAuditRun,
  now: () => new Date(),
};

export async function executeEnvelopeCoverageAudit(input: Readonly<{
  propertyPageSize?: number;
  envelopePageSize?: number;
  maxEnvelopePagesPerProperty?: number;
  runId?: string;
}> = {}, dependencyOverrides: Partial<EnvelopeCoverageAuditExecutionDependencies> = {}): Promise<EnvelopeCoverageAuditExecutionResult> {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencyOverrides };
  const propertyPageSize = Math.max(1, Math.min(input.propertyPageSize ?? DEFAULT_PROPERTY_PAGE_SIZE, 500));
  const envelopePageSize = Math.max(1, Math.min(input.envelopePageSize ?? DEFAULT_ENVELOPE_PAGE_SIZE, 100));
  const maxEnvelopePages = Math.max(1, Math.min(
    input.maxEnvelopePagesPerProperty ?? DEFAULT_MAX_ENVELOPE_PAGES_PER_PROPERTY,
    DEFAULT_MAX_ENVELOPE_PAGES_PER_PROPERTY,
  ));
  const auditedAt = dependencies.now();
  const observedCapabilities: ObservedEnvelopeCapability[] = [];
  const diagnostics: string[] = [];
  const unmappedCertificationIssues = new Set<string>();
  let propertiesExamined = 0;
  let propertiesAudited = 0;
  let ownerUnresolved = 0;
  let propertyFailures = 0;
  let adapterFailures = 0;
  let envelopePagesRead = 0;
  let afterId: string | null = null;
  let propertyPagingComplete = true;

  while (true) {
    let properties: readonly AuditProperty[];
    try {
      properties = await dependencies.listProperties({ afterId, take: propertyPageSize });
    } catch (error) {
      propertyPagingComplete = false;
      diagnostics.push(`PROPERTY_PAGE_FAILED:${error instanceof Error ? error.message : String(error)}`);
      break;
    }
    if (!properties.length) break;

    for (const property of properties) {
      propertiesExamined += 1;
      const userId = property.homeownerProfile?.userId;
      if (!userId) {
        ownerUnresolved += 1;
        diagnostics.push(`OWNER_UNRESOLVED:${property.id}`);
        continue;
      }
      let cursor: string | null = null;
      const seenCursors = new Set<string>();
      let propertyComplete = true;
      let pageCount = 0;
      do {
        if (pageCount >= maxEnvelopePages) {
          propertyComplete = false;
          diagnostics.push(`ENVELOPE_PAGE_LIMIT_EXCEEDED:${property.id}`);
          break;
        }
        try {
          const result = await dependencies.queryProperty({
            propertyId: property.id,
            userId,
            cursor,
            limit: envelopePageSize,
          });
          envelopePagesRead += 1;
          pageCount += 1;
          observedCapabilities.push(...result.observedCapabilities.map((capability) => ({
            ...capability,
            // Persistence tracks when this audit observed the combination;
            // source-record freshness remains on the Envelope item itself.
            observedAt: auditedAt.toISOString(),
          })));
          for (const diagnostic of result.page.diagnostics) {
            if (diagnostic.code === 'ADAPTER_FAILED' || diagnostic.code === 'TIME_BUDGET_EXHAUSTED') {
              adapterFailures += diagnostic.count;
              propertyComplete = false;
            }
            if (diagnostic.code === 'UNMAPPED_NATIVE_VALUE') {
              unmappedCertificationIssues.add(
                `${diagnostic.producerModel}:${diagnostic.nativeValue ?? 'UNKNOWN'}: observed native value is not mapped`,
              );
            }
          }
          const nextCursor = result.page.nextCursor;
          if (nextCursor && seenCursors.has(nextCursor)) {
            propertyComplete = false;
            diagnostics.push(`ENVELOPE_CURSOR_REPEATED:${property.id}`);
            break;
          }
          if (nextCursor) seenCursors.add(nextCursor);
          cursor = nextCursor;
        } catch (error) {
          propertyComplete = false;
          diagnostics.push(`PROPERTY_ENVELOPE_READ_FAILED:${property.id}:${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      } while (cursor);
      if (propertyComplete) propertiesAudited += 1;
      else propertyFailures += 1;
    }

    afterId = properties.at(-1)?.id ?? afterId;
    if (properties.length < propertyPageSize) break;
  }

  const operationallyComplete = propertyPagingComplete
    && ownerUnresolved === 0
    && propertyFailures === 0
    && adapterFailures === 0;
  const audit = auditEnvelopeCoverage({
    observedCapabilities,
    auditedAt: auditedAt.toISOString(),
  });
  const certificationIssues = [...audit.certificationIssues, ...unmappedCertificationIssues].sort();
  const summary: CoverageAuditRunSummary = {
    status: operationallyComplete ? 'COMPLETE' : 'PARTIAL',
    evaluationStatus: 'NOT_MEASURED',
    propertiesExamined,
    propertiesAudited,
    ownerUnresolved,
    propertyFailures,
    adapterFailures,
    envelopePagesRead,
    observedCapabilities: new Set(observedCapabilities.map(exactObservedCapabilityKey)).size,
    findings: audit.findings.length,
    reviewRequired: audit.findings.filter(({ determination }) => determination === 'REVIEW_REQUIRED').length,
    declarationDrift: audit.declarationDrift.length,
    certificationIssues,
    diagnostics: [...new Set(diagnostics)].sort(),
  };
  const reconciliation = input.runId
    ? await dependencies.finalizeRun({
      runId: input.runId,
      auditedAt,
      finishedAt: dependencies.now(),
      findings: audit.findings,
      summary,
    })
    : await dependencies.reconcile(audit.findings, {
      complete: operationallyComplete,
      auditedAt,
    });

  return {
    ...summary,
    reconciliation,
  };
}
