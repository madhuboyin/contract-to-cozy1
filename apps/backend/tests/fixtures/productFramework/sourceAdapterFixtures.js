const { goldenTestHomes } = require('./goldenTestHomes.js');

const SOURCE_KINDS = [
  'GUIDANCE',
  'MAINTENANCE',
  'INCIDENT',
  'RECALL',
  'COVERAGE',
  'PERSONALIZATION',
  'PROJECT',
  'SYSTEM',
];

const baseAction = goldenTestHomes.find((fixture) => fixture.id === 'existing-home-buyer').action;

const sourceAdapterFixtures = SOURCE_KINDS.map((sourceKind) => {
  const action = structuredClone(baseAction);
  delete action.source;
  delete action.job;
  return {
    sourceKind,
    input: {
      ...action,
      id: `source-action-${sourceKind.toLowerCase()}`,
      lineageId: `source-lineage-${sourceKind.toLowerCase()}`,
      sourceEntityId: `source-entity-${sourceKind.toLowerCase()}`,
      sourceVersion: 'phase0-v1',
    },
  };
});

module.exports = { SOURCE_KINDS, sourceAdapterFixtures };
