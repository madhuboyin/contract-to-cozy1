// apps/backend/src/homeRenovationAdvisor/engine/licensing/licensingRules.provider.ts

import { AdvisorDataSourceType, HomeRenovationType } from '@prisma/client';
import {
  LICENSING_RULES_BY_RENOVATION_TYPE,
  LICENSING_RULES_VERSION,
  LicensingRuleConfig,
} from './licensingRules.data';

export interface LicensingRulesProviderResult {
  data: LicensingRuleConfig | null;
  sourceType: AdvisorDataSourceType;
  sourceLabel: string;
  sourceReferenceUrl: string | null;
  sourceRefreshedAt: Date | null;
  dataAvailable: boolean;
  providerVersion: string;
}

export interface IContractorLicensingRulesProvider {
  getLicensingRules(
    renovationType: HomeRenovationType,
    state: string | null,
  ): Promise<LicensingRulesProviderResult>;
}

export class FallbackLicensingRulesProvider implements IContractorLicensingRulesProvider {
  async getLicensingRules(
    renovationType: HomeRenovationType,
    _state: string | null,
  ): Promise<LicensingRulesProviderResult> {
    const data = LICENSING_RULES_BY_RENOVATION_TYPE[renovationType] ?? null;
    return {
      data,
      sourceType: AdvisorDataSourceType.INTERNAL_RULE,
      sourceLabel: 'Internal licensing heuristics (national defaults)',
      sourceReferenceUrl: null,
      sourceRefreshedAt: null,
      dataAvailable: data !== null,
      providerVersion: LICENSING_RULES_VERSION,
    };
  }
}

export function getLicensingRulesProvider(): IContractorLicensingRulesProvider {
  // Future: return new StateLicenseBoardAdapter()
  return new FallbackLicensingRulesProvider();
}
