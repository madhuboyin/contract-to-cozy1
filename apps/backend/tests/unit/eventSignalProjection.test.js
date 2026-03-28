const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  buildUnifiedEventEnvelope,
  timelineEntryFromEvent,
  timelineEntryFromSignal,
  mergeTimelineProjectionEntries,
} = require('../../src/services/eventSignalProjection.service.ts');

test('buildUnifiedEventEnvelope normalizes event type and defaults nullable fields', () => {
  const envelope = buildUnifiedEventEnvelope({
    eventType: 'risk_spike',
    propertyId: 'property-1',
    sourceModel: 'RadarEvent',
    sourceId: 'radar-1',
    occurredAt: '2026-03-01T00:00:00.000Z',
  });

  assert.equal(envelope.eventType, 'RISK_SPIKE');
  assert.equal(envelope.roomId, null);
  assert.equal(envelope.homeItemId, null);
  assert.equal(envelope.propertyId, 'property-1');
});

test('timeline projection merges event and signal entries in descending time order', () => {
  const eventEntry = timelineEntryFromEvent(
    buildUnifiedEventEnvelope({
      eventType: 'maintenance',
      propertyId: 'property-1',
      sourceModel: 'HomeEventsService',
      sourceId: 'evt-1',
      occurredAt: '2026-03-10T10:00:00.000Z',
    }),
    'Maintenance completed',
    'HVAC tune-up finished',
  );

  const signalEntry = timelineEntryFromSignal({
    id: 'sig-1',
    propertyId: 'property-1',
    roomId: null,
    homeItemId: null,
    signalKey: 'RISK_SPIKE',
    valueNumber: 0.88,
    valueText: 'HIGH_SPIKE',
    valueJson: { severity: 'high' },
    unit: 'ratio',
    confidence: 0.8,
    sourceModel: 'HomeEventRadarService',
    sourceId: 'radar-9',
    capturedAt: '2026-03-11T10:00:00.000Z',
    validUntil: null,
    version: 1,
    createdAt: '2026-03-11T10:00:00.000Z',
    updatedAt: '2026-03-11T10:00:00.000Z',
  });

  const merged = mergeTimelineProjectionEntries([eventEntry, signalEntry], 10);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].kind, 'SIGNAL');
  assert.equal(merged[1].kind, 'EVENT');
});

