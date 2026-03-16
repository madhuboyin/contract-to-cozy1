// apps/backend/src/homeRenovationAdvisor/engine/licensing/licensing.evaluator.ts

import { AdvisorConfidenceLevel, AdvisorDataSourceType } from '@prisma/client';
import {
  AssumptionEntry,
  EvaluationContext,
  LicenseCategoryEntry,
  LicensingEvaluationResult,
} from '../../types/homeRenovationAdvisor.types';
import { getLicensingRulesProvider } from './licensingRules.provider';
import { CONTRACTOR_VERIFICATION_NOTE } from './licensingRules.data';
import { scoreConfidenceFromSource } from '../confidence/confidence.service';

export async function evaluateLicensing(ctx: EvaluationContext): Promise<LicensingEvaluationResult> {
  const provider = getLicensingRulesProvider();
  const result = await provider.getLicensingRules(ctx.renovationType, ctx.jurisdiction.state);

  if (!result.dataAvailable || !result.data) {
    return buildUnavailableResult(result.sourceType, result.sourceLabel);
  }

  const rule = result.data;
  const assumptions: AssumptionEntry[] = [];

  // Confidence: state-level data gets MEDIUM, no state = LOW
  const baseConfidence = scoreConfidenceFromSource(result.sourceType);
  const jurisdictionPenalty = ctx.jurisdiction.state ? 0 : 1;
  const finalConfidence = penalizeConfidence(baseConfidence, jurisdictionPenalty);

  if (!ctx.jurisdiction.state) {
    assumptions.push({
      assumptionKey: 'licensing_no_state',
      assumptionLabel: 'Licensing rules use national defaults (no state data)',
      assumptionValueText: 'State could not be resolved from property profile',
      assumptionValueNumber: null,
      assumptionUnit: null,
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      confidenceLevel: AdvisorConfidenceLevel.LOW,
      rationale: 'Contractor licensing requirements vary significantly by state.',
      isUserVisible: true,
      displayOrder: 0,
    });
  }

  const confidenceReason = buildLicensingConfidenceReason(finalConfidence, !!ctx.jurisdiction.state);

  const licenseCategories: LicenseCategoryEntry[] = rule.categories.map((c, i) => ({
    licenseCategoryType: c.licenseCategoryType,
    isApplicable: c.isApplicable,
    confidenceLevel: finalConfidence,
    note: c.note,
    displayOrder: i,
  }));

  // Build verification URL from state if available
  const verificationToolUrl = ctx.jurisdiction.state
    ? buildStateVerificationUrl(ctx.jurisdiction.state)
    : null;

  return {
    requirementStatus: rule.requirementStatus,
    confidenceLevel: finalConfidence,
    confidenceReason,
    consequenceSummary: rule.consequenceSummary,
    verificationToolUrl,
    verificationToolLabel: verificationToolUrl
      ? `Verify contractor license in ${ctx.jurisdiction.state}`
      : CONTRACTOR_VERIFICATION_NOTE,
    plainLanguageSummary: rule.plainLanguageSummary,
    licenseCategories,
    dataAvailable: true,
    sourceType: result.sourceType,
    sourceLabel: result.sourceLabel,
    sourceReferenceUrl: result.sourceReferenceUrl,
    sourceRefreshedAt: result.sourceRefreshedAt,
    notes: rule.notes,
    assumptions,
  };
}

function buildUnavailableResult(
  sourceType: AdvisorDataSourceType,
  sourceLabel: string,
): LicensingEvaluationResult {
  return {
    requirementStatus: 'UNKNOWN',
    confidenceLevel: AdvisorConfidenceLevel.UNAVAILABLE,
    confidenceReason: 'Contractor licensing data is not available for this renovation type.',
    consequenceSummary: '',
    verificationToolUrl: null,
    verificationToolLabel: CONTRACTOR_VERIFICATION_NOTE,
    plainLanguageSummary: 'Licensing requirement data is unavailable. Contact your local licensing board or building department.',
    licenseCategories: [],
    dataAvailable: false,
    sourceType,
    sourceLabel,
    sourceReferenceUrl: null,
    sourceRefreshedAt: null,
    notes: null,
    assumptions: [],
  };
}

function penalizeConfidence(base: AdvisorConfidenceLevel, penalty: number): AdvisorConfidenceLevel {
  const levels: AdvisorConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'];
  const idx = levels.indexOf(base);
  return levels[Math.min(idx + penalty, levels.length - 1)];
}

function buildLicensingConfidenceReason(
  confidence: AdvisorConfidenceLevel,
  hasState: boolean,
): string {
  if (confidence === 'HIGH') return 'High confidence: licensing rules verified at state level.';
  if (confidence === 'MEDIUM') {
    return hasState
      ? 'Medium confidence: licensing rules based on national defaults applied for this state. Exact requirements may differ.'
      : 'Medium confidence: national licensing defaults applied.';
  }
  return 'Low confidence: contractor licensing data could not be resolved for this jurisdiction.';
}

// Maps US state abbreviation to common contractor license verification portal
// These are the official state licensing board pages
const STATE_LICENSE_VERIFY_URLS: Record<string, string> = {
  CA: 'https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx',
  TX: 'https://www.tdlr.texas.gov/LicenseSearch/',
  FL: 'https://www.myfloridalicense.com/wl11.asp',
  NY: 'https://www.dos.ny.gov/licensing/licenseSearch.html',
  AZ: 'https://roc.az.gov/license-search',
  WA: 'https://secure.lni.wa.gov/verify/',
  CO: 'https://apps2.colorado.gov/dora/licensing/Lookup/LicenseLookup.aspx',
  IL: 'https://ilesonline.idfpr.illinois.gov/DFPR/Lookup/LicenseLookup.aspx',
  GA: 'https://sos.ga.gov/index.php/licensing/plb/45',
  NC: 'https://www.nclbgc.org/verify.aspx',
  NJ: 'https://newjersey.mylicense.com/verification/Search.aspx',
  PA: 'https://www.pals.pa.gov/#/page/search',
  OH: 'https://elicense.ohio.gov/oh_verifylicense',
  MI: 'https://www.lara.michigan.gov/BCHS/',
  VA: 'https://dhp.virginiainteractive.org/lookup/index',
};

function buildStateVerificationUrl(state: string): string | null {
  return STATE_LICENSE_VERIFY_URLS[state.toUpperCase()] ?? null;
}
