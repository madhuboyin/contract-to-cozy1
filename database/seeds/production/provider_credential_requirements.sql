-- Provider Trust & Compliance Verification — requirement matrix seed data
-- See docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 4.2
--
-- Data-driven, admin-editable (isActive can be flipped per-row without a deploy).
-- Safe to re-run: each INSERT is guarded by a NOT EXISTS check against
-- (serviceCategory, credentialType, stateCode IS NULL), since Postgres unique
-- indexes treat NULL stateCode values as distinct from one another and would
-- not otherwise prevent duplicate rows on a second run.
--
-- Run this only after the corresponding `prisma db push` has created the
-- provider_credential_requirements table.

-- Rule 1: LIABILITY_INSURANCE required for every ServiceCategory.
INSERT INTO "provider_credential_requirements"
  ("id", "serviceCategory", "credentialType", "isRequired", "stateCode", "notes", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  v.category::"ServiceCategory",
  'LIABILITY_INSURANCE'::"ProviderCredentialType",
  true,
  NULL,
  'Phase 1 seed: baseline liability insurance requirement, applies to every category',
  true,
  now(),
  now()
FROM (VALUES
  ('INSPECTION'), ('HANDYMAN'), ('GENERAL_HANDYMAN'), ('PLUMBING'), ('ELECTRICAL'),
  ('HVAC'), ('ROOFING'), ('WATER_HEATER'), ('FOUNDATION'), ('WINDOWS_DOORS'),
  ('INSULATION'), ('LANDSCAPING'), ('LANDSCAPING_DRAINAGE'), ('GUTTERS'), ('SOLAR'),
  ('FLOORING'), ('PAINTING'), ('SIDING'), ('MOLD_REMEDIATION'), ('APPLIANCE_REPAIR'),
  ('APPLIANCE_REPLACEMENT'), ('SECURITY_SAFETY'), ('CLEANING'), ('MOVING'), ('PEST_CONTROL'),
  ('LOCKSMITH'), ('INSURANCE'), ('ATTORNEY'), ('FINANCE'), ('WARRANTY'),
  ('ADMIN'), ('OTHER')
) AS v(category)
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_credential_requirements" r
  WHERE r."serviceCategory" = v.category::"ServiceCategory"
    AND r."credentialType" = 'LIABILITY_INSURANCE'::"ProviderCredentialType"
    AND r."stateCode" IS NULL
);

-- Rule 2: TRADE_LICENSE required for the higher-risk trade categories.
INSERT INTO "provider_credential_requirements"
  ("id", "serviceCategory", "credentialType", "isRequired", "stateCode", "notes", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  v.category::"ServiceCategory",
  'TRADE_LICENSE'::"ProviderCredentialType",
  true,
  NULL,
  'Phase 1 seed: state/local trade license requirement for higher-risk categories',
  true,
  now(),
  now()
FROM (VALUES
  ('PLUMBING'), ('ELECTRICAL'), ('HVAC'), ('ROOFING'),
  ('FOUNDATION'), ('WATER_HEATER'), ('SOLAR')
) AS v(category)
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_credential_requirements" r
  WHERE r."serviceCategory" = v.category::"ServiceCategory"
    AND r."credentialType" = 'TRADE_LICENSE'::"ProviderCredentialType"
    AND r."stateCode" IS NULL
);

-- Note: WORKERS_COMP_INSURANCE is deliberately NOT seeded here — per the FRD,
-- it's required only where a provider's teamSize > 1, which is evaluated at
-- eligibility-compute time in ProviderComplianceService, not stored as a
-- requirement-matrix row.
