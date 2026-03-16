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

// ============================================================================
// FACTORY — swap real provider here when ready
// ============================================================================

export function getPermitRulesProvider(): IPermitRulesProvider {
  // Future: return new SymbiumPermitRulesProvider() or new PermitFlowAdapter()
  return new FallbackPermitRulesProvider();
}
