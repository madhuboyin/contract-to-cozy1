function fact(key, value) {
  return {
    key,
    value,
    state: value == null ? 'UNKNOWN' : 'KNOWN',
    source: null,
    verified: false,
    confidence: null,
    observedAt: null,
    validUntil: null,
    correctionPath: null,
  };
}

function installPersonalizationContextMock(prismaMock) {
  const contextPath = require.resolve('../../src/services/aggregationContext/context.ts');
  require.cache[contextPath] = {
    id: contextPath,
    filename: contextPath,
    loaded: true,
    exports: {
      getAggregationPropertyContext: async (propertyId) => {
        const property = await prismaMock.property.findUnique({ where: { id: propertyId } });
        if (!property) throw new Error('Property not found');
        return {
          propertyId,
          contextVersion: 'personalization-test-context',
          generatedAt: new Date().toISOString(),
          scopes: ['STRUCTURE', 'SAFETY', 'INVENTORY'],
          facts: {
            'safety.hasSmokeDetectors': fact('safety.hasSmokeDetectors', property.hasSmokeDetectors),
            'structure.roofReplacementYear': fact('structure.roofReplacementYear', property.roofReplacementYear),
            'inventory.items': fact('inventory.items', property.inventoryItems ?? []),
          },
          warnings: [],
        };
      },
    },
  };
}

module.exports = { installPersonalizationContextMock };
