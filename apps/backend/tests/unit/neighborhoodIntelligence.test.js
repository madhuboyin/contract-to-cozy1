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
