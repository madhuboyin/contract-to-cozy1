// apps/backend/src/services/analytics/index.ts
//
// Barrel export for the analytics module.
// Feature modules should import from here.
//
// Typical usage:
//   import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../analytics';

// Taxonomy — event types, module keys, feature keys, source keys
export {
  ProductAnalyticsEventType,
  AnalyticsEvent,
  AnalyticsModule,
  AnalyticsFeature,
  AnalyticsSource,
} from './taxonomy';
export type {
  AnalyticsEventType,
  AnalyticsModuleKey,
  AnalyticsFeatureKey,
  AnalyticsSourceKey,
} from './taxonomy';

// Schemas — Zod validators and inferred types
export {
  TrackEventSchema,
  TrackFeatureOpenedSchema,
  TrackDecisionGuidedSchema,
  TrackPropertyActivatedSchema,
  TrackToolUsedSchema,
} from './schemas';
export type {
  TrackEventInput,
  TrackFeatureOpenedInput,
  TrackDecisionGuidedInput,
  TrackPropertyActivatedInput,
  TrackToolUsedInput,
} from './schemas';

// Repository — direct data-access (prefer service for most callers)
export { AnalyticsRepository } from './repository';
export type { CreateAnalyticsEventData } from './repository';

// Service — validated ingestion with normalization
export { ProductAnalyticsService } from './service';

// Emitter — fire-and-forget helpers for use in product feature modules
export { analyticsEmitter, emitProductEvent } from './emitter';
