// apps/backend/src/homeRenovationAdvisor/engine/licensing/licensingRules.provider.ts

import { AdvisorDataSourceType, HomeRenovationType } from '@prisma/client';
import {
  LICENSING_RULES_BY_RENOVATION_TYPE,
  LICENSING_RULES_VERSION,
  LicensingRuleConfig,
} from './licensingRules.data';
import { pollAuthorityGuidance } from '../../../services/renovationAuthorityIntegration.service';

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

export class LiveLicensingRulesProvider implements IContractorLicensingRulesProvider {
  constructor(
    private readonly fallback: IContractorLicensingRulesProvider = new FallbackLicensingRulesProvider(),
  ) {}

  async getLicensingRules(
    renovationType: HomeRenovationType,
    state: string | null,
  ): Promise<LicensingRulesProviderResult> {
    const live = await pollAuthorityGuidance('LICENSING', {
      renovationType,
      state,
    });
    const rules = live.payload?.rules;
    if (
      live.available
      && rules
      && typeof rules === 'object'
      && Array.isArray((rules as Record<string, unknown>).categories)
      && typeof (rules as Record<string, unknown>).requirementStatus === 'string'
    ) {
      return {
        data: rules as unknown as LicensingRuleConfig,
        sourceType: AdvisorDataSourceType.API_VERIFIED,
        sourceLabel: live.sourceLabel ?? 'Verified contractor licensing source',
        sourceReferenceUrl: live.sourceReferenceUrl,
        sourceRefreshedAt: live.observedAt,
        dataAvailable: true,
        providerVersion: 'live-authority-v1',
      };
    }
    return this.fallback.getLicensingRules(renovationType, state);
  }
}

export function getLicensingRulesProvider(): IContractorLicensingRulesProvider {
  return new LiveLicensingRulesProvider();
}
