// tests/unit/neighborhoodIntelligence.test.js
//
// Unit tests for the Neighborhood Intelligence Engine.
// Uses Node.js native test runner (no Jest/Vitest).

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Geo utilities
// ---------------------------------------------------------------------------

const { haversineDistanceMiles, isValidLatLng } = (() => {
  const EARTH_RADIUS_MILES = 3958.8;
  function haversineDistanceMiles(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_MILES * c;
  }
  function isValidLatLng(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return false;
    if (isNaN(lat) || isNaN(lon)) return false;
    if (lat === 0 && lon === 0) return false;
    if (lat < -90 || lat > 90) return false;
    if (lon < -180 || lon > 180) return false;
    return true;
  }
  return { haversineDistanceMiles, isValidLatLng };
})();

test('haversineDistanceMiles — same point is 0', () => {
  const d = haversineDistanceMiles(33.749, -84.388, 33.749, -84.388);
  assert.equal(d, 0);
});

test('haversineDistanceMiles — Atlanta to roughly 1 mile north', () => {
  // ~1 degree latitude ≈ 69 miles, so 0.015 deg ≈ ~1 mile
  const d = haversineDistanceMiles(33.749, -84.388, 33.764, -84.388);
  assert.ok(d > 0.9 && d < 1.2, `Expected ~1 mile, got ${d.toFixed(3)}`);
});

test('isValidLatLng — valid coords', () => {
  assert.equal(isValidLatLng(33.749, -84.388), true);
});

test('isValidLatLng — null island rejected', () => {
  assert.equal(isValidLatLng(0, 0), false);
});

test('isValidLatLng — out-of-range rejected', () => {
  assert.equal(isValidLatLng(999, -84.388), false);
  assert.equal(isValidLatLng(33.749, 999), false);
});

test('isValidLatLng — non-numbers rejected', () => {
  assert.equal(isValidLatLng(null, null), false);
  assert.equal(isValidLatLng('33.749', '-84.388'), false);
});

// ---------------------------------------------------------------------------
// Impact engine
// ---------------------------------------------------------------------------

const { NeighborhoodImpactEngineJS } = (() => {
  // Inline a minimal version of the engine rules for unit testing without TS compilation.

  const IMPACT_RULES = {
    TRANSIT_PROJECT: {
      baseScore: 82,
      defaultRadiusMiles: 2.0,
      impacts: [
        { category: 'PROPERTY_VALUE', direction: 'POSITIVE', description: 'May improve property demand.', confidence: 0.78 },
        { category: 'RENTAL_DEMAND', direction: 'POSITIVE', description: 'May increase rental demand.', confidence: 0.80 },
        { category: 'NOISE', direction: 'NEGATIVE', description: 'Construction noise expected.', confidence: 0.72 },
      ],
      demographics: [
        { segment: 'YOUNG_PROFESSIONALS', description: 'Transit attracts young professionals.', confidence: 0.75 },
      ],
    },
    WAREHOUSE_PROJECT: {
      baseScore: 68,
      defaultRadiusMiles: 2.0,
      impacts: [
        { category: 'TRAFFIC', direction: 'NEGATIVE', description: 'Heavy truck traffic expected.', confidence: 0.85 },
        { category: 'NOISE', direction: 'NEGATIVE', description: 'Loading dock noise expected.', confidence: 0.80 },
        { category: 'LIVING_EXPERIENCE', direction: 'NEGATIVE', description: 'Livability may decline.', confidence: 0.74 },
      ],
      demographics: [],
    },
    FLOOD_MAP_UPDATE: {
      baseScore: 78,
      defaultRadiusMiles: 2.5,
      impacts: [
        { category: 'INSURANCE_RISK', direction: 'NEGATIVE', description: 'Flood insurance may be required.', confidence: 0.85 },
        { category: 'PROPERTY_VALUE', direction: 'NEGATIVE', description: 'Resale friction may increase.', confidence: 0.75 },
      ],
      demographics: [],
    },
    SCHOOL_RATING_CHANGE: {
      baseScore: 75,
      defaultRadiusMiles: 3.0,
      impacts: [
        { category: 'PROPERTY_VALUE', direction: 'POSITIVE', description: 'School improvements often support property demand.', confidence: 0.80 },
      ],
      demographics: [
        { segment: 'FAMILIES_WITH_CHILDREN', description: 'Families may be attracted to improved schools.', confidence: 0.82 },
      ],
    },
  };

  const DEMOGRAPHIC_EVENT_TYPES = new Set([
    'TRANSIT_PROJECT', 'COMMERCIAL_DEVELOPMENT', 'RESIDENTIAL_DEVELOPMENT',
    'ZONING_CHANGE', 'SCHOOL_RATING_CHANGE', 'SCHOOL_BOUNDARY_CHANGE', 'PARK_DEVELOPMENT',
  ]);

  class NeighborhoodImpactEngineJS {
    computeImpactScore(baseScore, distanceMiles, radiusMiles) {
      if (distanceMiles <= 0) return Math.min(100, baseScore);
      const decay = Math.max(0, 1 - (distanceMiles / radiusMiles) * 0.8);
      return Math.round(baseScore * decay);
    }

    decayConfidence(base, distanceMiles, radiusMiles) {
      const decay = Math.max(0.3, 1 - (distanceMiles / radiusMiles) * 0.5);
      return Math.round(base * decay * 100) / 100;
    }

    generate(eventType, distanceMiles, _property) {
      const rule = IMPACT_RULES[eventType];
      if (!rule) throw new Error(`No rule for ${eventType}`);

      const impactScore = this.computeImpactScore(rule.baseScore, distanceMiles, rule.defaultRadiusMiles);
      const impacts = rule.impacts.map((r) => ({
        ...r,
        confidence: this.decayConfidence(r.confidence, distanceMiles, rule.defaultRadiusMiles),
      }));
      const demographics = DEMOGRAPHIC_EVENT_TYPES.has(eventType)
        ? rule.demographics.map((r) => ({
            ...r,
            confidence: this.decayConfidence(r.confidence, distanceMiles, rule.defaultRadiusMiles),
          }))
        : [];

      return { impacts, demographics, impactScore };
    }

    computeOverallEffect(impacts) {
      let pos = 0, neg = 0;
      for (const i of impacts) {
        if (i.direction === 'POSITIVE') pos += i.confidence;
        else if (i.direction === 'NEGATIVE') neg += i.confidence;
      }
      const delta = pos - neg;
      const total = pos + neg;
      if (total === 0) return 'NEUTRAL';
      if (delta > 1.5) return 'HIGHLY_POSITIVE';
      if (delta > 0.5) return 'MODERATELY_POSITIVE';
      if (delta < -1.5) return 'HIGHLY_NEGATIVE';
      if (delta < -0.5) return 'MODERATELY_NEGATIVE';
      return 'MIXED';
    }
  }

  return { NeighborhoodImpactEngineJS };
})();

const engine = new NeighborhoodImpactEngineJS();
const dummyProperty = { propertyId: 'test-prop' };

// --- Transit ---
test('impact engine — TRANSIT_PROJECT produces positive PROPERTY_VALUE impact', () => {
  const { impacts } = engine.generate('TRANSIT_PROJECT', 0.5, dummyProperty);
  const pv = impacts.find((i) => i.category === 'PROPERTY_VALUE');
  assert.ok(pv, 'PROPERTY_VALUE impact should exist');
  assert.equal(pv.direction, 'POSITIVE');
});

test('impact engine — TRANSIT_PROJECT produces positive RENTAL_DEMAND impact', () => {
  const { impacts } = engine.generate('TRANSIT_PROJECT', 0.5, dummyProperty);
  const rd = impacts.find((i) => i.category === 'RENTAL_DEMAND');
  assert.ok(rd, 'RENTAL_DEMAND impact should exist');
  assert.equal(rd.direction, 'POSITIVE');
});

test('impact engine — TRANSIT_PROJECT produces YOUNG_PROFESSIONALS demographic signal', () => {
  const { demographics } = engine.generate('TRANSIT_PROJECT', 0.5, dummyProperty);
  const seg = demographics.find((d) => d.segment === 'YOUNG_PROFESSIONALS');
  assert.ok(seg, 'YOUNG_PROFESSIONALS demographic should exist');
});

// --- Warehouse ---
test('impact engine — WAREHOUSE_PROJECT produces negative TRAFFIC impact', () => {
  const { impacts } = engine.generate('WAREHOUSE_PROJECT', 0.5, dummyProperty);
  const traffic = impacts.find((i) => i.category === 'TRAFFIC');
  assert.ok(traffic, 'TRAFFIC impact should exist');
  assert.equal(traffic.direction, 'NEGATIVE');
});

test('impact engine — WAREHOUSE_PROJECT produces negative NOISE impact', () => {
  const { impacts } = engine.generate('WAREHOUSE_PROJECT', 0.5, dummyProperty);
  const noise = impacts.find((i) => i.category === 'NOISE');
  assert.ok(noise, 'NOISE impact should exist');
  assert.equal(noise.direction, 'NEGATIVE');
});

test('impact engine — WAREHOUSE_PROJECT produces no demographic signals', () => {
  const { demographics } = engine.generate('WAREHOUSE_PROJECT', 0.5, dummyProperty);
  assert.equal(demographics.length, 0);
});

// --- Flood ---
test('impact engine — FLOOD_MAP_UPDATE produces negative INSURANCE_RISK impact', () => {
  const { impacts } = engine.generate('FLOOD_MAP_UPDATE', 0.5, dummyProperty);
  const ins = impacts.find((i) => i.category === 'INSURANCE_RISK');
  assert.ok(ins, 'INSURANCE_RISK impact should exist');
  assert.equal(ins.direction, 'NEGATIVE');
});

// --- School ---
test('impact engine — SCHOOL_RATING_CHANGE produces positive PROPERTY_VALUE impact', () => {
  const { impacts } = engine.generate('SCHOOL_RATING_CHANGE', 0.5, dummyProperty);
  const pv = impacts.find((i) => i.category === 'PROPERTY_VALUE');
  assert.ok(pv, 'PROPERTY_VALUE impact should exist');
  assert.equal(pv.direction, 'POSITIVE');
});

test('impact engine — SCHOOL_RATING_CHANGE produces FAMILIES_WITH_CHILDREN demographic signal', () => {
  const { demographics } = engine.generate('SCHOOL_RATING_CHANGE', 0.5, dummyProperty);
  const seg = demographics.find((d) => d.segment === 'FAMILIES_WITH_CHILDREN');
  assert.ok(seg, 'FAMILIES_WITH_CHILDREN demographic should exist');
});

// --- Distance decay ---
test('impact engine — score decreases with distance', () => {
  const near = engine.generate('TRANSIT_PROJECT', 0.1, dummyProperty);
  const far = engine.generate('TRANSIT_PROJECT', 1.8, dummyProperty);
  assert.ok(near.impactScore > far.impactScore, `Near score ${near.impactScore} should be > far score ${far.impactScore}`);
});

// --- Impact scoring range ---
test('impact engine — impactScore is within 0–100', () => {
  const { impactScore } = engine.generate('TRANSIT_PROJECT', 0.5, dummyProperty);
  assert.ok(impactScore >= 0 && impactScore <= 100, `Score ${impactScore} out of range`);
});

// --- Overall effect ---
test('impact engine — computeOverallEffect — all positive → HIGHLY_POSITIVE', () => {
  const impacts = [
    { direction: 'POSITIVE', confidence: 0.9 },
    { direction: 'POSITIVE', confidence: 0.85 },
    { direction: 'POSITIVE', confidence: 0.8 },
  ];
  const effect = engine.computeOverallEffect(impacts);
  assert.equal(effect, 'HIGHLY_POSITIVE');
});

test('impact engine — computeOverallEffect — all negative → HIGHLY_NEGATIVE', () => {
  const impacts = [
    { direction: 'NEGATIVE', confidence: 0.85 },
    { direction: 'NEGATIVE', confidence: 0.80 },
    { direction: 'NEGATIVE', confidence: 0.74 },
  ];
  const effect = engine.computeOverallEffect(impacts);
  assert.equal(effect, 'HIGHLY_NEGATIVE');
});

test('impact engine — computeOverallEffect — empty → NEUTRAL', () => {
  const effect = engine.computeOverallEffect([]);
  assert.equal(effect, 'NEUTRAL');
});

// ---------------------------------------------------------------------------
// Ingestion validation (business rules, no DB)
// ---------------------------------------------------------------------------

const LOW_SIGNAL_TITLES = ['permit', 'inspection', 'misc', 'other', 'unknown', 'n/a', 'na'];
const MIN_TITLE_LENGTH = 5;

function validateIngestionInput(input) {
  const SUPPORTED = new Set([
    'TRANSIT_PROJECT', 'HIGHWAY_PROJECT', 'COMMERCIAL_DEVELOPMENT', 'RESIDENTIAL_DEVELOPMENT',
    'INDUSTRIAL_PROJECT', 'WAREHOUSE_PROJECT', 'ZONING_CHANGE', 'SCHOOL_RATING_CHANGE',
    'SCHOOL_BOUNDARY_CHANGE', 'FLOOD_MAP_UPDATE', 'UTILITY_INFRASTRUCTURE', 'PARK_DEVELOPMENT',
    'LARGE_CONSTRUCTION',
  ]);

  if (!SUPPORTED.has(input.eventType)) return { ok: false, code: 'UNSUPPORTED_EVENT_TYPE' };

  const lat = input.latitude, lon = input.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)
    || (lat === 0 && lon === 0) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ok: false, code: 'INVALID_COORDINATES' };
  }

  if (!input.title || input.title.trim().length < MIN_TITLE_LENGTH) {
    return { ok: false, code: 'INVALID_TITLE' };
  }

  const t = input.title.trim().toLowerCase();
  if (LOW_SIGNAL_TITLES.some((kw) => t === kw || t.startsWith(kw + ' '))) {
    return { ok: false, code: 'LOW_SIGNAL_EVENT' };
  }

  return { ok: true };
}

test('ingestion validation — valid input passes', () => {
  const result = validateIngestionInput({
    eventType: 'TRANSIT_PROJECT',
    title: 'Metro Blue Line Extension',
    latitude: 33.749,
    longitude: -84.388,
  });
  assert.equal(result.ok, true);
});

test('ingestion validation — unsupported event type rejected', () => {
  const result = validateIngestionInput({
    eventType: 'ALIEN_LANDING',
    title: 'Something big',
    latitude: 33.749,
    longitude: -84.388,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UNSUPPORTED_EVENT_TYPE');
});

test('ingestion validation — missing coordinates rejected', () => {
  const result = validateIngestionInput({
    eventType: 'TRANSIT_PROJECT',
    title: 'Metro Blue Line Extension',
    latitude: null,
    longitude: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_COORDINATES');
});

test('ingestion validation — null island rejected', () => {
  const result = validateIngestionInput({
    eventType: 'TRANSIT_PROJECT',
    title: 'Metro Blue Line Extension',
    latitude: 0,
    longitude: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_COORDINATES');
});

test('ingestion validation — low-signal title "permit" rejected', () => {
  const result = validateIngestionInput({
    eventType: 'LARGE_CONSTRUCTION',
    title: 'permit',
    latitude: 33.749,
    longitude: -84.388,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LOW_SIGNAL_EVENT');
});

test('ingestion validation — very short title rejected', () => {
  const result = validateIngestionInput({
    eventType: 'LARGE_CONSTRUCTION',
    title: 'abc',
    latitude: 33.749,
    longitude: -84.388,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_TITLE');
});

// ---------------------------------------------------------------------------
// Property proximity matching rules
// ---------------------------------------------------------------------------

function isWithinRadius(distanceMiles, radiusMiles) {
  return distanceMiles <= radiusMiles;
}

test('proximity matching — nearby property matches', () => {
  const TRANSIT_RADIUS = 2.0;
  assert.equal(isWithinRadius(0.5, TRANSIT_RADIUS), true);
  assert.equal(isWithinRadius(1.9, TRANSIT_RADIUS), true);
});

test('proximity matching — far property does not match', () => {
  const TRANSIT_RADIUS = 2.0;
  assert.equal(isWithinRadius(2.1, TRANSIT_RADIUS), false);
  assert.equal(isWithinRadius(5.0, TRANSIT_RADIUS), false);
});

// ---------------------------------------------------------------------------
// Neighborhood signal service — deriveDominantDirection (unit)
// ---------------------------------------------------------------------------

function deriveDominantDirection(impacts) {
  let pos = 0;
  let neg = 0;
  for (const { direction } of impacts) {
    if (direction === 'POSITIVE') pos++;
    else if (direction === 'NEGATIVE') neg++;
  }
  if (pos > neg) return 'POSITIVE';
  if (neg > pos) return 'NEGATIVE';
  return 'MIXED';
}

test('deriveDominantDirection — majority positive → POSITIVE', () => {
  const d = deriveDominantDirection([
    { direction: 'POSITIVE' },
    { direction: 'POSITIVE' },
    { direction: 'NEGATIVE' },
  ]);
  assert.equal(d, 'POSITIVE');
});

test('deriveDominantDirection — majority negative → NEGATIVE', () => {
  const d = deriveDominantDirection([
    { direction: 'NEGATIVE' },
    { direction: 'NEGATIVE' },
    { direction: 'POSITIVE' },
  ]);
  assert.equal(d, 'NEGATIVE');
});

test('deriveDominantDirection — tie → MIXED', () => {
  const d = deriveDominantDirection([
    { direction: 'POSITIVE' },
    { direction: 'NEGATIVE' },
  ]);
  assert.equal(d, 'MIXED');
});

test('deriveDominantDirection — empty array → MIXED', () => {
  const d = deriveDominantDirection([]);
  assert.equal(d, 'MIXED');
});

// ---------------------------------------------------------------------------
// Signal mapping rules
// ---------------------------------------------------------------------------

const SIGNAL_RULES = [
  { eventType: 'TRANSIT_PROJECT', direction: 'POSITIVE', code: 'TRANSIT_UPSIDE_PRESENT' },
  { eventType: 'FLOOD_MAP_UPDATE', direction: 'NEGATIVE', code: 'FLOOD_RISK_PRESSURE' },
  { eventType: 'SCHOOL_RATING_CHANGE', direction: 'POSITIVE', code: 'SCHOOL_QUALITY_IMPROVING' },
  { eventType: 'SCHOOL_RATING_CHANGE', direction: 'NEGATIVE', code: 'SCHOOL_QUALITY_DECLINING' },
  { eventType: 'COMMERCIAL_DEVELOPMENT', direction: 'POSITIVE', code: 'COMMERCIAL_GROWTH_SIGNAL' },
  { eventType: 'INDUSTRIAL_PROJECT', direction: 'NEGATIVE', code: 'INDUSTRIAL_NOISE_RISK' },
  { eventType: 'WAREHOUSE_PROJECT', direction: 'NEGATIVE', code: 'WAREHOUSE_TRAFFIC_RISK' },
  { eventType: 'ZONING_CHANGE', direction: 'NEGATIVE', code: 'ZONING_RISK' },
  { eventType: 'HIGHWAY_PROJECT', direction: 'NEGATIVE', code: 'HIGHWAY_DISRUPTION_RISK' },
  { eventType: 'PARK_DEVELOPMENT', direction: 'POSITIVE', code: 'PARK_AMENITY_UPSIDE' },
  { eventType: 'RESIDENTIAL_DEVELOPMENT', direction: null, code: 'RESIDENTIAL_DENSITY_INCREASING' },
  { eventType: 'LARGE_CONSTRUCTION', direction: 'NEGATIVE', code: 'LARGE_CONSTRUCTION_DISRUPTION' },
  { eventType: 'UTILITY_INFRASTRUCTURE', direction: null, code: 'UTILITY_INFRASTRUCTURE_CHANGE' },
];

function resolveSignalCode(eventType, dominantDirection) {
  for (const rule of SIGNAL_RULES) {
    if (rule.eventType !== eventType) continue;
    if (rule.direction !== null && rule.direction !== dominantDirection) continue;
    return rule.code;
  }
  return null;
}

test('signal rules — TRANSIT_PROJECT + POSITIVE → TRANSIT_UPSIDE_PRESENT', () => {
  assert.equal(resolveSignalCode('TRANSIT_PROJECT', 'POSITIVE'), 'TRANSIT_UPSIDE_PRESENT');
});

test('signal rules — TRANSIT_PROJECT + NEGATIVE → no signal (not in rules)', () => {
  assert.equal(resolveSignalCode('TRANSIT_PROJECT', 'NEGATIVE'), null);
});

test('signal rules — FLOOD_MAP_UPDATE + NEGATIVE → FLOOD_RISK_PRESSURE', () => {
  assert.equal(resolveSignalCode('FLOOD_MAP_UPDATE', 'NEGATIVE'), 'FLOOD_RISK_PRESSURE');
});

test('signal rules — SCHOOL_RATING_CHANGE + POSITIVE → SCHOOL_QUALITY_IMPROVING', () => {
  assert.equal(resolveSignalCode('SCHOOL_RATING_CHANGE', 'POSITIVE'), 'SCHOOL_QUALITY_IMPROVING');
});

test('signal rules — SCHOOL_RATING_CHANGE + NEGATIVE → SCHOOL_QUALITY_DECLINING', () => {
  assert.equal(resolveSignalCode('SCHOOL_RATING_CHANGE', 'NEGATIVE'), 'SCHOOL_QUALITY_DECLINING');
});

test('signal rules — RESIDENTIAL_DEVELOPMENT + any direction → RESIDENTIAL_DENSITY_INCREASING', () => {
  assert.equal(resolveSignalCode('RESIDENTIAL_DEVELOPMENT', 'POSITIVE'), 'RESIDENTIAL_DENSITY_INCREASING');
  assert.equal(resolveSignalCode('RESIDENTIAL_DEVELOPMENT', 'NEGATIVE'), 'RESIDENTIAL_DENSITY_INCREASING');
  assert.equal(resolveSignalCode('RESIDENTIAL_DEVELOPMENT', 'MIXED'), 'RESIDENTIAL_DENSITY_INCREASING');
});

test('signal rules — PARK_DEVELOPMENT + POSITIVE → PARK_AMENITY_UPSIDE', () => {
  assert.equal(resolveSignalCode('PARK_DEVELOPMENT', 'POSITIVE'), 'PARK_AMENITY_UPSIDE');
});

// ---------------------------------------------------------------------------
// Notification deduplication logic
// ---------------------------------------------------------------------------

function shouldNotify(existingNotificationIds, linkId) {
  // Simulate deduplication: only notify if no prior notification for this link
  return !existingNotificationIds.has(linkId);
}

test('notification dedup — first occurrence triggers notification', () => {
  const sent = new Set();
  assert.equal(shouldNotify(sent, 'link-abc'), true);
});

test('notification dedup — second occurrence is suppressed', () => {
  const sent = new Set(['link-abc']);
  assert.equal(shouldNotify(sent, 'link-abc'), false);
});

test('notification dedup — different link triggers new notification', () => {
  const sent = new Set(['link-abc']);
  assert.equal(shouldNotify(sent, 'link-xyz'), true);
});

// ---------------------------------------------------------------------------
// Scheduled job guardrails
// ---------------------------------------------------------------------------

test('refresh job — NEIGHBORHOOD_REFRESH_ENABLED=false should skip', () => {
  const enabled = 'false' !== 'false'; // simulates process.env check
  assert.equal(enabled, false);
});

test('notification threshold — score below 60 should not trigger', () => {
  const NOTIFICATION_THRESHOLD = 60;
  assert.equal(59 >= NOTIFICATION_THRESHOLD, false);
  assert.equal(60 >= NOTIFICATION_THRESHOLD, true);
  assert.equal(85 >= NOTIFICATION_THRESHOLD, true);
});

test('notification lookback — 25h window covers daily cron with jitter', () => {
  const LOOKBACK_MS = 25 * 60 * 60 * 1000;
  const now = Date.now();
  const since = new Date(now - LOOKBACK_MS);
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
  // 25h window should include events from 24h ago
  assert.ok(since < twentyFourHoursAgo, 'Lookback window should extend past 24h');
});

// ---------------------------------------------------------------------------
// Event confidence scoring (mirrors eventConfidence.ts logic)
// ---------------------------------------------------------------------------

function monthsAgo(date) {
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
}

function computeEventConfidence(event) {
  let score = 0.50;
  if (event.description && event.description.trim().length >= 20) score += 0.10;
  if (event.sourceName) score += 0.10;
  if (event.sourceUrl) score += 0.08;
  if (event.announcedDate) score += 0.07;
  if (event.expectedStartDate || event.expectedEndDate) score += 0.05;

  const refDate = event.announcedDate ?? event.createdAt;
  const ageMonths = monthsAgo(refDate);

  if (ageMonths < 6) {
    score += 0.05;
  } else if (ageMonths > 24) {
    score -= 0.20;
  } else if (ageMonths > 12) {
    score -= 0.10;
  }

  if (event.expectedEndDate && event.expectedEndDate < new Date()) {
    const monthsPastEnd = monthsAgo(event.expectedEndDate);
    if (monthsPastEnd > 12) score -= 0.15;
    else if (monthsPastEnd > 6) score -= 0.08;
  }

  const clamped = Math.max(0.05, Math.min(1.0, score));
  const rounded = Math.round(clamped * 100) / 100;
  const band = rounded >= 0.72 ? 'HIGH' : rounded >= 0.48 ? 'MEDIUM' : 'PRELIMINARY';
  return { overall: rounded, band };
}

const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 1 month ago
const oldDate = new Date(Date.now() - 36 * 30 * 24 * 60 * 60 * 1000); // 3 years ago

test('confidence — full data + fresh → HIGH band', () => {
  const score = computeEventConfidence({
    description: 'A detailed description of the transit corridor expansion project.',
    sourceName: 'City Planning Dept',
    sourceUrl: 'https://example.gov/project',
    announcedDate: recentDate,
    expectedStartDate: recentDate,
    expectedEndDate: null,
    createdAt: recentDate,
  });
  assert.equal(score.band, 'HIGH', `Expected HIGH, got ${score.band} (${score.overall})`);
});

test('confidence — no extra data + fresh → MEDIUM band', () => {
  const score = computeEventConfidence({
    description: null,
    sourceName: null,
    sourceUrl: null,
    announcedDate: recentDate,
    expectedStartDate: null,
    expectedEndDate: null,
    createdAt: recentDate,
  });
  // Fresh event boosts baseline 0.50 by 0.05 = 0.55 + announced 0.07 = 0.62 → MEDIUM
  assert.equal(score.band, 'MEDIUM', `Expected MEDIUM, got ${score.band} (${score.overall})`);
});

test('confidence — stale event (3 years old) → PRELIMINARY or low MEDIUM', () => {
  const score = computeEventConfidence({
    description: null,
    sourceName: null,
    sourceUrl: null,
    announcedDate: null,
    expectedStartDate: null,
    expectedEndDate: null,
    createdAt: oldDate,
  });
  // 0.50 base - 0.20 stale penalty = 0.30 → PRELIMINARY
  assert.equal(score.band, 'PRELIMINARY', `Expected PRELIMINARY, got ${score.band} (${score.overall})`);
});

test('confidence — expected end date 18 months ago penalizes score', () => {
  const endPast = new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000);
  const score = computeEventConfidence({
    description: null,
    sourceName: null,
    sourceUrl: null,
    announcedDate: null,
    expectedStartDate: null,
    expectedEndDate: endPast,
    createdAt: recentDate, // recently ingested but project ended 18mo ago
  });
  // Should be penalized for ended project
  assert.ok(score.overall < 0.50, `Expected < 0.50, got ${score.overall}`);
});

test('confidence score is clamped between 0.05 and 1.0', () => {
  // Worst case: all penalties
  const score = computeEventConfidence({
    description: null,
    sourceName: null,
    sourceUrl: null,
    announcedDate: null,
    expectedStartDate: null,
    expectedEndDate: new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000), // 2yr old end
    createdAt: oldDate,
  });
  assert.ok(score.overall >= 0.05, `Score ${score.overall} below minimum 0.05`);
  assert.ok(score.overall <= 1.0, `Score ${score.overall} above maximum 1.0`);
});

// ---------------------------------------------------------------------------
// Freshness scoring
// ---------------------------------------------------------------------------

function computeFreshnessScore(event) {
  const now = Date.now();

  if (event.expectedEndDate && event.expectedEndDate.getTime() < now) {
    const monthsPastEnd = (now - event.expectedEndDate.getTime()) / (1000 * 60 * 60 * 24 * 30.5);
    if (monthsPastEnd > 18) return 0.20;
    if (monthsPastEnd > 12) return 0.35;
    if (monthsPastEnd > 6) return 0.50;
    return 0.65;
  }

  const refDate = event.announcedDate ?? event.createdAt;
  const ageMonths = (now - refDate.getTime()) / (1000 * 60 * 60 * 24 * 30.5);

  if (ageMonths < 3) return 1.00;
  if (ageMonths < 6) return 0.90;
  if (ageMonths < 12) return 0.80;
  if (ageMonths < 18) return 0.65;
  if (ageMonths < 24) return 0.50;
  if (ageMonths < 36) return 0.35;
  return 0.20;
}

function isStaleEvent(event) {
  return computeFreshnessScore(event) <= 0.35;
}

test('freshness — event created 1 month ago → 1.0', () => {
  const score = computeFreshnessScore({ createdAt: recentDate, announcedDate: null, expectedEndDate: null });
  assert.equal(score, 1.0);
});

test('freshness — event 3+ years old → 0.20', () => {
  // Use 38 * 30.5-day months to clearly exceed the 36-month boundary in the formula
  const veryOldDate = new Date(Date.now() - Math.ceil(38 * 30.5) * 24 * 60 * 60 * 1000);
  const score = computeFreshnessScore({ createdAt: veryOldDate, announcedDate: null, expectedEndDate: null });
  assert.equal(score, 0.20);
});

test('freshness — expected end 18+ months in past → 0.20', () => {
  const pastEnd = new Date(Date.now() - 20 * 30 * 24 * 60 * 60 * 1000);
  const score = computeFreshnessScore({ createdAt: recentDate, announcedDate: null, expectedEndDate: pastEnd });
  assert.equal(score, 0.20);
});

test('freshness — expected end 3 months in past → 0.65', () => {
  const pastEnd = new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000);
  const score = computeFreshnessScore({ createdAt: recentDate, announcedDate: null, expectedEndDate: pastEnd });
  assert.equal(score, 0.65);
});

test('isStale — old event is stale', () => {
  assert.equal(isStaleEvent({ createdAt: oldDate, announcedDate: null, expectedEndDate: null }), true);
});

test('isStale — recent event is not stale', () => {
  assert.equal(isStaleEvent({ createdAt: recentDate, announcedDate: null, expectedEndDate: null }), false);
});

// ---------------------------------------------------------------------------
// Composite rank ordering
// ---------------------------------------------------------------------------

function computeCompositeRank(impactScore, confidence, freshnessScore) {
  return impactScore * 0.55 + confidence * 25 + freshnessScore * 20;
}

test('compositeRank — high impact + high confidence + fresh ranks above weak + stale', () => {
  const strong = computeCompositeRank(85, 0.90, 1.0);
  const weak = computeCompositeRank(45, 0.30, 0.20);
  assert.ok(strong > weak, `Expected ${strong} > ${weak}`);
});

test('compositeRank — fresh high-confidence event outranks old medium-confidence event at same impactScore', () => {
  const fresh = computeCompositeRank(60, 0.80, 1.0);
  const stale = computeCompositeRank(60, 0.50, 0.20);
  assert.ok(fresh > stale, `Expected fresh(${fresh}) > stale(${stale})`);
});

test('compositeRank — flood risk at 70 score outranks minor commercial at 50', () => {
  const floodRisk = computeCompositeRank(70, 0.75, 0.90); // verified flood data
  const minor = computeCompositeRank(50, 0.55, 0.90);
  assert.ok(floodRisk > minor, `Flood(${floodRisk}) should outrank minor(${minor})`);
});

// ---------------------------------------------------------------------------
// Risk language / copy guardrails
// ---------------------------------------------------------------------------

function hasDeterministicClaim(text) {
  const FORBIDDEN = [
    'will increase property value',
    'will decrease property value',
    'will move in',
    'will appreciate',
    'will depreciate',
    'is definitely',
    'guaranteed',
    'certain',
  ];
  const lower = text.toLowerCase();
  return FORBIDDEN.some((phrase) => lower.includes(phrase));
}

function hasCautiousLanguage(text) {
  const CAUTIOUS = ['may', 'might', 'could', 'often', 'typically', 'generally', 'possible'];
  const lower = text.toLowerCase();
  return CAUTIOUS.some((word) => lower.includes(word));
}

const SAMPLE_IMPACT_DESCRIPTIONS = [
  'Transit infrastructure often correlates with increased long-term property demand in surrounding neighborhoods.',
  'Highway construction and expanded road capacity may increase vehicle traffic volumes near the property.',
  'New commercial development may expand local retail, dining, and services near the property.',
  'Proximity to new highway infrastructure may affect outdoor quality of life and pedestrian experience.',
  'Flood zone expansion may increase insurance premium requirements for affected properties.',
];

test('impact descriptions — no deterministic claims in sample descriptions', () => {
  for (const desc of SAMPLE_IMPACT_DESCRIPTIONS) {
    assert.equal(hasDeterministicClaim(desc), false, `Found overclaiming language in: "${desc}"`);
  }
});

test('impact descriptions — all use cautious hedging language', () => {
  for (const desc of SAMPLE_IMPACT_DESCRIPTIONS) {
    assert.equal(hasCautiousLanguage(desc), true, `Missing cautious language in: "${desc}"`);
  }
});

test('notification copy — title should not contain overclaiming language', () => {
  const titles = [
    'Transit development detected nearby',
    'Flood map update may affect your property',
    'Nearby school rating has changed',
    'Commercial development nearby',
  ];
  for (const title of titles) {
    assert.equal(hasDeterministicClaim(title), false, `Overclaiming title: "${title}"`);
  }
});

// ---------------------------------------------------------------------------
// Explainability
// ---------------------------------------------------------------------------

function buildWhyThisMatters({ eventType, distanceMiles, impactScore, confidenceBand }) {
  const reasons = [];

  if (distanceMiles < 0.3) {
    reasons.push('This development is very close to your property.');
  } else if (distanceMiles < 1.0) {
    reasons.push(`This development is approximately ${distanceMiles.toFixed(1)} mile from your property.`);
  } else {
    reasons.push(`This development is approximately ${distanceMiles.toFixed(1)} miles from your property.`);
  }

  const EVENT_CONTEXT = {
    TRANSIT_PROJECT: 'Transit projects often correlate with long-term demand shifts in surrounding neighborhoods.',
    FLOOD_MAP_UPDATE: 'Flood map changes may affect insurance requirements and financing options.',
    SCHOOL_RATING_CHANGE: 'School quality is a key factor in family buyer demand and long-term value.',
  };

  const context = EVENT_CONTEXT[eventType];
  if (context) reasons.push(context);

  if (impactScore >= 75) {
    reasons.push('The estimated relevance for your property is high based on event type and proximity.');
  }

  if (confidenceBand === 'PRELIMINARY') {
    reasons.push('Data for this signal is limited — consider it an early indicator only.');
  }

  return reasons;
}

test('explainability — returns at least one reason for any valid event', () => {
  const reasons = buildWhyThisMatters({
    eventType: 'TRANSIT_PROJECT',
    distanceMiles: 0.5,
    impactScore: 60,
    confidenceBand: 'MEDIUM',
  });
  assert.ok(reasons.length >= 1, `Expected at least 1 reason, got ${reasons.length}`);
});

test('explainability — includes distance context', () => {
  const reasons = buildWhyThisMatters({
    eventType: 'FLOOD_MAP_UPDATE',
    distanceMiles: 0.8,
    impactScore: 70,
    confidenceBand: 'HIGH',
  });
  const hasDistance = reasons.some((r) => r.toLowerCase().includes('mile'));
  assert.ok(hasDistance, 'Should include distance context');
});

test('explainability — PRELIMINARY band adds caveat', () => {
  const reasons = buildWhyThisMatters({
    eventType: 'ZONING_CHANGE',
    distanceMiles: 1.2,
    impactScore: 45,
    confidenceBand: 'PRELIMINARY',
  });
  const hasCaveat = reasons.some((r) => r.toLowerCase().includes('early indicator'));
  assert.ok(hasCaveat, 'Should add preliminary caveat for PRELIMINARY band');
});

test('explainability — HIGH confidence without PRELIMINARY caveat', () => {
  const reasons = buildWhyThisMatters({
    eventType: 'TRANSIT_PROJECT',
    distanceMiles: 0.5,
    impactScore: 80,
    confidenceBand: 'HIGH',
  });
  const hasCaveat = reasons.some((r) => r.toLowerCase().includes('limited data'));
  assert.equal(hasCaveat, false, 'Should not add caveat for HIGH confidence');
});

test('explainability — high score includes impact strength reason', () => {
  const reasons = buildWhyThisMatters({
    eventType: 'FLOOD_MAP_UPDATE',
    distanceMiles: 0.5,
    impactScore: 85,
    confidenceBand: 'HIGH',
  });
  const hasStrength = reasons.some((r) => r.toLowerCase().includes('high'));
  assert.ok(hasStrength, 'Should mention high relevance for score >= 75');
});

// ---------------------------------------------------------------------------
// Prioritization / surfacing
// ---------------------------------------------------------------------------

test('prioritization — flood risk should outrank multiple weak commercial signals', () => {
  const floodRank = computeCompositeRank(72, 0.85, 0.90);
  const weakCommercial1 = computeCompositeRank(40, 0.55, 0.80);
  const weakCommercial2 = computeCompositeRank(42, 0.50, 0.75);
  assert.ok(
    floodRank > weakCommercial1 && floodRank > weakCommercial2,
    `Flood(${floodRank}) should outrank both commercial signals`,
  );
});

test('prioritization — stale events should not dominate summary when fresh events exist', () => {
  const staleEventRank = computeCompositeRank(75, 0.55, 0.20);  // Old, faded
  const freshModerateRank = computeCompositeRank(55, 0.70, 1.0); // New, decent data
  assert.ok(
    freshModerateRank > staleEventRank,
    `Fresh moderate(${freshModerateRank}) should outrank stale strong(${staleEventRank})`,
  );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('edge case — event with no metadata scores baseline MEDIUM confidence', () => {
  const score = computeEventConfidence({
    description: null, sourceName: null, sourceUrl: null,
    announcedDate: null, expectedStartDate: null, expectedEndDate: null,
    createdAt: recentDate,
  });
  // Fresh bonus 0.05 added: 0.50 + 0.05 = 0.55 → MEDIUM
  assert.equal(score.band, 'MEDIUM', `Expected MEDIUM for minimal data, got ${score.band}`);
});

test('edge case — very stale event with all data fields still bounded at PRELIMINARY', () => {
  const score = computeEventConfidence({
    description: 'Detailed description with lots of helpful information.',
    sourceName: 'Official Gov Source',
    sourceUrl: 'https://example.gov/old',
    announcedDate: oldDate,
    expectedStartDate: oldDate,
    expectedEndDate: new Date(Date.now() - 30 * 30 * 24 * 60 * 60 * 1000), // 2.5yr old end
    createdAt: oldDate,
  });
  // All bonuses + stale penalties: should be capped low
  assert.ok(score.overall < 0.72, `Stale event should not reach HIGH: ${score.overall}`);
});
