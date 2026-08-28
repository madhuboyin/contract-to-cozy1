import type { EnvelopeAdapter } from './envelopeAdapter.contract';
import type { EnvelopeProducerModel } from './intelligenceEnvelope.contract';
import {
  guidanceSignalEnvelopeAdapter,
  intelligenceObservationEnvelopeAdapter,
  personalizedRecommendationEnvelopeAdapter,
  propertyRadarCompoundInsightEnvelopeAdapter,
  propertyRadarMatchEnvelopeAdapter,
  recommendationSnapshotEnvelopeAdapter,
  signalEnvelopeAdapter,
} from './adapters';

export const ENVELOPE_ADAPTERS = Object.freeze([
  signalEnvelopeAdapter,
  guidanceSignalEnvelopeAdapter,
  intelligenceObservationEnvelopeAdapter,
  recommendationSnapshotEnvelopeAdapter,
  personalizedRecommendationEnvelopeAdapter,
  propertyRadarMatchEnvelopeAdapter,
  propertyRadarCompoundInsightEnvelopeAdapter,
] satisfies readonly EnvelopeAdapter<unknown>[]);

const adapterByProducer = new Map(
  ENVELOPE_ADAPTERS.map((adapter) => [adapter.descriptor.producerModel, adapter]),
);

export function getEnvelopeAdapter(producerModel: EnvelopeProducerModel): EnvelopeAdapter<unknown> | null {
  return adapterByProducer.get(producerModel) ?? null;
}
