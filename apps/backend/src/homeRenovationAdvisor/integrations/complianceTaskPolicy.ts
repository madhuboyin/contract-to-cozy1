import {
  ContractorLicenseRequirementStatus,
  PermitRequirementStatus,
} from '@prisma/client';

const PERMIT_TASK_REQUIRED_BY_STATUS: Record<PermitRequirementStatus, boolean> = {
  [PermitRequirementStatus.REQUIRED]: true,
  [PermitRequirementStatus.LIKELY_REQUIRED]: true,
  [PermitRequirementStatus.NOT_REQUIRED]: false,
  [PermitRequirementStatus.LIKELY_NOT_REQUIRED]: false,
  [PermitRequirementStatus.UNKNOWN]: false,
  [PermitRequirementStatus.DATA_UNAVAILABLE]: false,
};

const LICENSING_TASK_REQUIRED_BY_STATUS: Record<ContractorLicenseRequirementStatus, boolean> = {
  [ContractorLicenseRequirementStatus.REQUIRED]: true,
  [ContractorLicenseRequirementStatus.MAY_BE_REQUIRED]: true,
  [ContractorLicenseRequirementStatus.NOT_REQUIRED]: false,
  [ContractorLicenseRequirementStatus.UNKNOWN]: false,
  [ContractorLicenseRequirementStatus.DATA_UNAVAILABLE]: false,
};

export interface ComplianceTaskRequirements {
  needsPermitTask: boolean;
  needsLicensingTask: boolean;
}

/**
 * Maps persisted Prisma statuses to homeowner follow-up requirements.
 *
 * Keeping the maps typed as Records makes a newly added enum value a compile
 * error until its action behavior is explicitly decided.
 */
export function getComplianceTaskRequirements(
  permitStatus: PermitRequirementStatus,
  licensingStatus: ContractorLicenseRequirementStatus,
): ComplianceTaskRequirements {
  return {
    needsPermitTask: PERMIT_TASK_REQUIRED_BY_STATUS[permitStatus],
    needsLicensingTask: LICENSING_TASK_REQUIRED_BY_STATUS[licensingStatus],
  };
}
