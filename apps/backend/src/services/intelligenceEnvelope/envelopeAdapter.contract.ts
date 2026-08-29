import type {
  EnvelopeDomain,
  EvidenceRef,
  QualifiedClaimPropositionType,
} from '../../productFramework/intelligence';
import type {
  EnvelopeDiagnostic,
  EnvelopeProducerModel,
  EnvelopeType,
  IntelligenceEnvelopeItem,
} from './intelligenceEnvelope.contract';

export const ENVELOPE_MAPPING_VERSION = '1.0' as const;

export type EnvelopeAdapterCapability = Readonly<{
  type: EnvelopeType;
  domain: EnvelopeDomain;
  nativeSubtype: string;
  propositionType?: QualifiedClaimPropositionType;
}>;

export type EnvelopeAdapterDescriptor = Readonly<{
  producerModel: EnvelopeProducerModel;
  capabilities: readonly EnvelopeAdapterCapability[];
  domainTaxonomyVersion: '1.0';
  mappingVersion: typeof ENVELOPE_MAPPING_VERSION;
  lineageDerivationVersion: string;
  revisionTokenAlgorithm: string;
  freshnessPolicy: string;
}>;

export type EnvelopeAdapterResult =
  | { item: IntelligenceEnvelopeItem; capability: EnvelopeAdapterCapability; diagnostic?: never }
  | { item?: never; capability?: never; diagnostic: EnvelopeDiagnostic };

export type EnvelopeAdapterInputBase = {
  propertyId: string;
  userId?: string;
  evidence: EvidenceRef[];
};

export interface EnvelopeAdapter<TRow> {
  readonly descriptor: EnvelopeAdapterDescriptor;
  map(row: TRow, context: EnvelopeAdapterInputBase): EnvelopeAdapterResult;
}
