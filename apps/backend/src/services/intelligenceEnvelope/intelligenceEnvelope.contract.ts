import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  EnvelopeEntityRefSchema,
  entityRefKey,
  EvidenceRefSchema,
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  IntelligenceIssueDomainSchema,
  QualifiedClaimSchema,
} from '../../productFramework/intelligence';

export const ENVELOPE_TYPES = [
  'SIGNAL',
  'GUIDANCE',
  'OBSERVATION',
  'RECOMMENDATION',
  'RADAR_INSIGHT',
] as const;

export const ENVELOPE_PRODUCER_MODELS = [
  'Signal',
  'GuidanceSignal',
  'IntelligenceObservation',
  'RecommendationSnapshot',
  'PersonalizedRecommendation',
  'PropertyRadarMatch',
  'PropertyRadarCompoundInsight',
] as const;

export const ENVELOPE_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN'] as const;
export const ENVELOPE_GENERATION_METHODS = ['DETERMINISTIC', 'LLM', 'EXTERNAL_INGEST', 'HYBRID'] as const;
export const ENVELOPE_CURRENTNESS_VALUES = ['CURRENT', 'STALE', 'UNKNOWN'] as const;

export const EnvelopeTypeSchema = z.enum(ENVELOPE_TYPES);
export const EnvelopeProducerModelSchema = z.enum(ENVELOPE_PRODUCER_MODELS);
export const EnvelopeSeveritySchema = z.enum(ENVELOPE_SEVERITIES);
export const EnvelopeCurrentnessSchema = z.enum(ENVELOPE_CURRENTNESS_VALUES);

export const EnvelopeKeySchema = z.string().regex(/^env_[a-f0-9]{64}$/);
export const LineageKeySchema = z.string().regex(/^lin_[a-f0-9]{64}$/);
export const RevisionKeySchema = z.string().regex(/^rev_[a-f0-9]{64}$/);

export type EnvelopeKey = z.infer<typeof EnvelopeKeySchema>;
export type LineageKey = z.infer<typeof LineageKeySchema>;
export type RevisionKey = z.infer<typeof RevisionKeySchema>;
export type EnvelopeType = z.infer<typeof EnvelopeTypeSchema>;
export type EnvelopeProducerModel = z.infer<typeof EnvelopeProducerModelSchema>;
export type EnvelopeSeverity = z.infer<typeof EnvelopeSeveritySchema>;
export type EnvelopeCurrentness = z.infer<typeof EnvelopeCurrentnessSchema>;

function digest(prefix: 'env' | 'lin' | 'rev', parts: readonly string[]): string {
  return `${prefix}_${createHash('sha256').update(parts.join('\u001f')).digest('hex')}`;
}

export function deriveEnvelopeIdentity(input: {
  producerModel: EnvelopeProducerModel;
  sourceRecordId: string;
  nativeLineageId: string;
  nativeRevisionToken: string;
}): { envelopeKey: EnvelopeKey; lineageKey: LineageKey; revisionKey: RevisionKey } {
  const lineageKey = digest('lin', [input.producerModel, input.nativeLineageId]) as LineageKey;
  const revisionKey = digest('rev', [input.producerModel, input.sourceRecordId, input.nativeRevisionToken]) as RevisionKey;
  return {
    lineageKey,
    revisionKey,
    envelopeKey: digest('env', [lineageKey, revisionKey]) as EnvelopeKey,
  };
}

export const IntelligenceEnvelopeItemSchema = z.object({
  envelopeKey: EnvelopeKeySchema,
  lineageKey: LineageKeySchema,
  revisionKey: RevisionKeySchema,
  nativeRevisionToken: z.string().trim().min(1),
  qualifiedClaim: QualifiedClaimSchema.optional(),
  type: EnvelopeTypeSchema,
  domain: IntelligenceIssueDomainSchema,
  relatedDomains: z.array(IntelligenceIssueDomainSchema).max(16).optional(),
  domainTaxonomyVersion: z.literal(INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION),
  subject: z.object({
    propertyId: z.string().trim().min(1),
    userId: z.string().trim().min(1).optional(),
    entityRef: EnvelopeEntityRefSchema.optional(),
  }).strict(),
  source: z.object({
    producer: z.string().trim().min(1),
    sourceModel: EnvelopeProducerModelSchema,
    sourceRecordId: z.string().trim().min(1),
  }).strict(),
  provenance: z.object({
    generatedBy: z.enum(ENVELOPE_GENERATION_METHODS),
    method: z.string().trim().min(1),
    modelVersion: z.string().trim().min(1).optional(),
  }).strict(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(EvidenceRefSchema).max(100),
  severity: EnvelopeSeveritySchema.nullable(),
  freshness: z.object({
    computedAt: z.string().datetime(),
    ttl: z.string().trim().min(1).nullable(),
    staleAfter: z.string().datetime().nullable(),
    currentness: EnvelopeCurrentnessSchema,
  }).strict(),
  nativeStatus: z.string().trim().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type IntelligenceEnvelopeItem = z.infer<typeof IntelligenceEnvelopeItemSchema>;

export const EnvelopeExecutionPrincipalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('HOMEOWNER_SESSION'), userId: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal('BACKGROUND_JOB_RESOLVED_OWNER'), userId: z.string().trim().min(1) }).strict(),
]);

export const IntelligenceEnvelopeQuerySchema = z.object({
  propertyId: z.string().trim().min(1),
  principal: EnvelopeExecutionPrincipalSchema,
  requestingAgentId: z.string().trim().min(1).optional(),
  types: z.array(EnvelopeTypeSchema).max(ENVELOPE_TYPES.length).optional(),
  domains: z.array(IntelligenceIssueDomainSchema).max(32).optional(),
  entityRefs: z.array(EnvelopeEntityRefSchema).max(100).optional(),
  sourceModels: z.array(EnvelopeProducerModelSchema).max(ENVELOPE_PRODUCER_MODELS.length).optional(),
  currentness: z.array(EnvelopeCurrentnessSchema).max(ENVELOPE_CURRENTNESS_VALUES.length).optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();

export const EnvelopeDiagnosticSchema = z.object({
  producerModel: EnvelopeProducerModelSchema,
  code: z.enum(['ADAPTER_FAILED', 'UNMAPPED_NATIVE_VALUE', 'AUTHORIZATION_DENIED', 'TIME_BUDGET_EXHAUSTED']),
  count: z.number().int().positive(),
  nativeValue: z.string().optional(),
}).strict();

export const IntelligenceEnvelopePageSchema = z.object({
  items: z.array(IntelligenceEnvelopeItemSchema),
  nextCursor: z.string().nullable(),
  diagnostics: z.array(EnvelopeDiagnosticSchema),
  contextVersion: z.string().trim().min(1),
  generatedAt: z.string().datetime(),
}).strict();

export type IntelligenceEnvelopeQuery = z.input<typeof IntelligenceEnvelopeQuerySchema>;
export type EnvelopeExecutionPrincipal = z.infer<typeof EnvelopeExecutionPrincipalSchema>;
export type EnvelopeDiagnostic = z.infer<typeof EnvelopeDiagnosticSchema>;
export type IntelligenceEnvelopePage = z.infer<typeof IntelligenceEnvelopePageSchema>;

const EnvelopeCursorPayloadSchema = z.object({
  version: z.literal(1),
  createdAt: z.string().datetime(),
  envelopeKey: EnvelopeKeySchema,
  queryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export class EnvelopeCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeCursorError';
  }
}

function sorted(values: readonly string[] | undefined): string[] | undefined {
  return values ? [...values].sort() : undefined;
}

export function envelopeQueryShapeDigest(query: IntelligenceEnvelopeQuery): string {
  const parsed = IntelligenceEnvelopeQuerySchema.parse(query);
  const shape = {
    propertyId: parsed.propertyId,
    principal: parsed.principal,
    requestingAgentId: parsed.requestingAgentId,
    types: sorted(parsed.types),
    domains: sorted(parsed.domains),
    entityRefs: parsed.entityRefs?.map(entityRefKey).sort(),
    sourceModels: sorted(parsed.sourceModels),
    currentness: sorted(parsed.currentness),
    createdAfter: parsed.createdAfter,
    createdBefore: parsed.createdBefore,
    limit: parsed.limit,
  };
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex');
}

export function encodeEnvelopeCursor(input: {
  createdAt: string;
  envelopeKey: EnvelopeKey;
  query: IntelligenceEnvelopeQuery;
}): string {
  const base = {
    version: 1 as const,
    createdAt: z.string().datetime().parse(input.createdAt),
    envelopeKey: EnvelopeKeySchema.parse(input.envelopeKey),
    queryDigest: envelopeQueryShapeDigest(input.query),
  };
  const checksum = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return Buffer.from(JSON.stringify({ ...base, checksum }), 'utf8').toString('base64url');
}

export function decodeEnvelopeCursor(
  cursor: string,
  query: IntelligenceEnvelopeQuery,
): { createdAt: string; envelopeKey: EnvelopeKey } {
  try {
    const payload = EnvelopeCursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    const { checksum, ...base } = payload;
    const expectedChecksum = createHash('sha256').update(JSON.stringify(base)).digest('hex');
    if (checksum !== expectedChecksum) throw new EnvelopeCursorError('Envelope cursor checksum mismatch');
    if (payload.queryDigest !== envelopeQueryShapeDigest({ ...query, cursor: undefined })) {
      throw new EnvelopeCursorError('Envelope cursor does not match the query shape');
    }
    return { createdAt: payload.createdAt, envelopeKey: payload.envelopeKey };
  } catch (error) {
    if (error instanceof EnvelopeCursorError) throw error;
    throw new EnvelopeCursorError('Envelope cursor is malformed');
  }
}
