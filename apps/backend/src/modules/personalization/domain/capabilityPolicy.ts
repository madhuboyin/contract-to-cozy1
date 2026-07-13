// apps/backend/src/modules/personalization/domain/capabilityPolicy.ts
//
// Property capability policy for the personalization engine — the "first
// implementation step" item named in
// docs/personalization/09-implementation-roadmap.md. Maps a HouseholdRole
// (from propertyAccess.service.ts, already governing property-level access
// elsewhere in this codebase) to what that role can do *within
// personalization specifically*, per the matrix in
// docs/personalization/06-api-design.md ("OWNER manages sensitive profile/
// consent by default. CONTRIBUTOR can read ordinary recommendations and
// create actions/feedback; VIEWER read access excludes sensitive
// evidence.") and 08-personalization-frd.md ("All item-by-ID routes
// resolve property then apply capability policy.").
//
// This is deliberately a separate layer from resolvePropertyAccess/
// ROLE_RANK: that service answers "does this user have property access at
// all, and at what role" (already used by Risk, Maintenance, Seller Prep,
// Seasonal Checklist, Home Digital Will); this answers "given that role,
// what can they do in personalization" — a second, personalization-specific
// policy on top of the first, matching the docs' explicit "recheck scope
// even when middleware is present" requirement.
import { HouseholdRole } from '@prisma/client';

export interface PersonalizationCapabilities {
  /** Household profile answers, consent, trait overrides — sensitive-profile management. */
  canManageSensitiveProfile: boolean;
  /** Raw trait evidence / sensitive explanation detail, not just the recommendation summary. */
  canViewSensitiveEvidence: boolean;
  /** Property-scoped recommendation summaries (redacted of sensitive evidence for non-owners). */
  canViewOrdinaryRecommendations: boolean;
  /** Convert a recommendation into a task/Guidance/vendor action. */
  canAct: boolean;
  /** Accept/dismiss/rate a recommendation. */
  canGiveFeedback: boolean;
}

const OWNER_CAPABILITIES: PersonalizationCapabilities = {
  canManageSensitiveProfile: true,
  canViewSensitiveEvidence: true,
  canViewOrdinaryRecommendations: true,
  canAct: true,
  canGiveFeedback: true,
};

const CONTRIBUTOR_CAPABILITIES: PersonalizationCapabilities = {
  canManageSensitiveProfile: false,
  canViewSensitiveEvidence: false,
  canViewOrdinaryRecommendations: true,
  canAct: true,
  canGiveFeedback: true,
};

const VIEWER_CAPABILITIES: PersonalizationCapabilities = {
  canManageSensitiveProfile: false,
  canViewSensitiveEvidence: false,
  canViewOrdinaryRecommendations: true,
  canAct: false,
  canGiveFeedback: false,
};

const CAPABILITIES_BY_ROLE: Record<HouseholdRole, PersonalizationCapabilities> = {
  OWNER: OWNER_CAPABILITIES,
  CONTRIBUTOR: CONTRIBUTOR_CAPABILITIES,
  VIEWER: VIEWER_CAPABILITIES,
};

/**
 * Returns the personalization capabilities for a given household role.
 * Callers should already have resolved property access (and thus a role)
 * via resolvePropertyAccess() — this function assumes a valid role and does
 * not itself check whether the user has any property access at all.
 */
export function getPersonalizationCapabilities(role: HouseholdRole): PersonalizationCapabilities {
  return CAPABILITIES_BY_ROLE[role];
}
