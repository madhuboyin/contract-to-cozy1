const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  canTransitionRecommendationIncident,
  defaultRecommendationIncidentSeverity,
  incidentRequiresImmediatePause,
} = require('../../src/productFramework/recommendationIncident.contract.ts');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('recommendation incidents enforce the audited lifecycle', () => {
  assert.equal(canTransitionRecommendationIncident('OPEN', 'TRIAGED'), true);
  assert.equal(canTransitionRecommendationIncident('OPEN', 'RESOLVED'), false);
  assert.equal(canTransitionRecommendationIncident('TRIAGED', 'INVESTIGATING'), true);
  assert.equal(canTransitionRecommendationIncident('INVESTIGATING', 'MITIGATED'), true);
  assert.equal(canTransitionRecommendationIncident('MITIGATED', 'RESOLVED'), true);
  assert.equal(canTransitionRecommendationIncident('RESOLVED', 'CLOSED'), true);
  assert.equal(canTransitionRecommendationIncident('CLOSED', 'OPEN'), false);
});

test('critical and safety incidents require immediate definition pause', () => {
  assert.equal(defaultRecommendationIncidentSeverity('SAFETY_HARM', 'LOW_CONSEQUENCE'), 'CRITICAL');
  assert.equal(defaultRecommendationIncidentSeverity('COMPLAINT', 'SAFETY_EMERGENCY'), 'CRITICAL');
  assert.equal(defaultRecommendationIncidentSeverity('REVERSAL', 'LOW_CONSEQUENCE'), 'MODERATE');
  assert.equal(defaultRecommendationIncidentSeverity('COMMERCIAL_INTEGRITY', 'LOW_CONSEQUENCE'), 'HIGH');
  assert.equal(incidentRequiresImmediatePause({ type: 'COMPLAINT', severity: 'CRITICAL', safetyTier: 'LOW_CONSEQUENCE' }), true);
  assert.equal(incidentRequiresImmediatePause({ type: 'COMPLAINT', severity: 'LOW', safetyTier: 'LOW_CONSEQUENCE' }), false);
});

test('feedback, admin operations, and reporting share the recommendation incident record', () => {
  const schema = source('../../prisma/schema.prisma');
  const useCase = source('../../src/modules/personalization/application/recordRecommendationFeedback.usecase.ts');
  const routes = source('../../src/routes/adminPersonalization.routes.ts');
  const service = source('../../src/services/recommendationIncident.service.ts');
  const quality = source('../../src/services/personalizationQuality.service.ts');
  const homeowner = source('../../../frontend/src/app/(dashboard)/dashboard/personalization/page.tsx');
  const admin = source('../../../frontend/src/app/(dashboard)/dashboard/admin/personalization/page.tsx');

  assert.match(schema, /model RecommendationIncident \{/);
  assert.match(schema, /sourceFeedbackId\s+String\?\s+@unique/);
  assert.match(useCase, /COMPLAINT: 'COMPLAINT'/);
  assert.match(routes, /personalization\/incidents/);
  assert.match(service, /RECOMMENDATION_INCIDENT_DEFINITION_AUTO_PAUSED/);
  assert.match(quality, /medianResolutionHours/);
  assert.match(homeowner, /Report a problem/);
  assert.match(admin, /Recommendation incident queue/);
});

test('Increment 3 adds no Prisma migration script', () => {
  const migrationsRoot = path.resolve(__dirname, '../../prisma/migrations');
  const migrationSql = fs.existsSync(migrationsRoot)
    ? fs.readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(migrationsRoot, entry.name, 'migration.sql'))
      .filter(fs.existsSync)
      .map((file) => fs.readFileSync(file, 'utf8'))
      .join('\n')
    : '';
  assert.doesNotMatch(migrationSql, /personalization_recommendation_incidents/);
});
