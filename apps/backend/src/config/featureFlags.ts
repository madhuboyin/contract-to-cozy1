// apps/backend/src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  SELLER_PREP: process.env.FEATURE_SELLER_PREP === 'true',
  PROPERTY_NARRATIVE_ENGINE: process.env.FEATURE_PROPERTY_NARRATIVE_ENGINE !== 'false',
};
  
