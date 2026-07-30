// apps/backend/src/homeRenovationAdvisor/engine/permit/permitRules.provider.ts
//
// Provider interface + fallback implementation for permit rules.
// Real providers (e.g. Symbium, PermitFlow) can implement IPermitRulesProvider
// and be swapped in by replacing getFallbackPermitRulesProvider().

import { AdvisorDataSourceType, HomeRenovationType } from '@prisma/client';
import {
  PERMIT_RULES_BY_RENOVATION_TYPE,
  PERMIT_RULES_VERSION,
  PermitRuleConfig,
} from './permitRules.data';
import { pollAuthorityGuidance } from '../../../services/renovationAuthorityIntegration.service';

// ============================================================================
// PROVIDER INTERFACE
// ============================================================================

export interface PermitRulesProviderResult {
  data: PermitRuleConfig | null;
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: Date | null;
  dataAvailable: boolean;
  providerVersion: string;
}

export interface IPermitRulesProvider {
  getPermitRules(
    renovationType: HomeRenovationType,
    state: string | null,
    county: string | null,
    city: string | null,
    postalCode: string | null,
  ): Promise<PermitRulesProviderResult>;
}

// ============================================================================
// FALLBACK / INTERNAL IMPLEMENTATION
// ============================================================================

export class FallbackPermitRulesProvider implements IPermitRulesProvider {
  async getPermitRules(
    renovationType: HomeRenovationType,
    _state: string | null,
    _county: string | null,
    _city: string | null,
    _postalCode: string | null,
  ): Promise<PermitRulesProviderResult> {
    const data = PERMIT_RULES_BY_RENOVATION_TYPE[renovationType] ?? null;

    return {
      data,
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      sourceLabel: 'Internal permit heuristics (national defaults)',
      sourceReferenceUrl: null,
      sourceRefreshedAt: null,
      dataAvailable: data !== null,
      providerVersion: PERMIT_RULES_VERSION,
    };
  }
}

export class LivePermitRulesProvider implements IPermitRulesProvider {
  constructor(private readonly fallback: IPermitRulesProvider = new FallbackPermitRulesProvider()) {}

  async getPermitRules(
    renovationType: HomeRenovationType,
    state: string | null,
    county: string | null,
    city: string | null,
    postalCode: string | null,
  ): Promise<PermitRulesProviderResult> {
    const live = await pollAuthorityGuidance('PERMIT', {
      renovationType,
      state,
      county,
      city,
      postalCode,
    });
    const rules = live.payload?.rules;
    if (
      live.available
      && rules
      && typeof rules === 'object'
      && Array.isArray((rules as Record<string, unknown>).permitTypes)
      && Array.isArray((rules as Record<string, unknown>).inspectionStages)
      && typeof (rules as Record<string, unknown>).requirementStatus === 'string'
    ) {
      return {
        data: rules as unknown as PermitRuleConfig,
        sourceType: AdvisorDataSourceType.API_VERIFIED,
        sourceLabel: live.sourceLabel ?? 'Verified municipal permit source',
        sourceReferenceUrl: live.sourceReferenceUrl,
        sourceRefreshedAt: live.observedAt,
        dataAvailable: true,
        providerVersion: 'live-authority-v1',
      };
    }
    return this.fallback.getPermitRules(renovationType, state, county, city, postalCode);
  }
}

// ============================================================================
// FACTORY — swap real provider here when ready
// ============================================================================

export function getPermitRulesProvider(): IPermitRulesProvider {
  return new LivePermitRulesProvider();
}
