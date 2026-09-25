// Shared support for the Ask handlers. Split by subject into ./support/* (FRD v1.110); this file only re-exports them,
// so handler and lifecycle imports are unchanged. The support modules never import this file.
export * from './support/capture';
export * from './support/propertyContext';
export * from './support/executionState';
export * from './support/answerGuards';
export * from './support/capabilityDiscovery';
export * from './support/commandInputs';
export * from './support/homeEventCorrection';
export * from './support/outcomes';
export * from './support/domainHelpers';
export * from './support/roomMap';
