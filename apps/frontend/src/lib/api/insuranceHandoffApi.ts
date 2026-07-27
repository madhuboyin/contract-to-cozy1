import { api } from './client';

export type InsuranceHandoffRecipientDTO = {
  id: string;
  name: string;
  configVersion: string;
  licensingDisclosure: string;
  commercialDisclosure: string;
  compensationDisclosure: string;
  marketScopeDisclosure: string;
  rankingDisclosure: string;
  fulfillmentSlaHours: number;
  disclosureVersion: string;
};

export type InsuranceHandoffReadinessDTO =
  | {
      available: false;
      code: 'INSURANCE_HANDOFF_UNAVAILABLE';
      message: string;
      jurisdictionCode: string;
    }
  | {
      available: true;
      jurisdictionCode: string;
      purpose: string;
      sharedFields: string[];
      excludedFields: string[];
      recipient: InsuranceHandoffRecipientDTO;
    };

export type InsuranceHandoffRequestDTO = {
  id: string;
  status:
    | 'CONSENTED'
    | 'SUBMITTED'
    | 'ACKNOWLEDGED'
    | 'IN_PROGRESS'
    | 'QUOTE_RECEIVED'
    | 'WITHDRAWN'
    | 'FAILED'
    | 'CLOSED';
  purpose: string;
  submittedAt: string | null;
  withdrawnAt: string | null;
  fulfilledAt: string | null;
  recipient: InsuranceHandoffRecipientDTO;
};

export async function getInsuranceHandoffReadiness(propertyId: string) {
  const response = await api.get<{ success: true; data: InsuranceHandoffReadinessDTO }>(
    `/api/properties/${propertyId}/insurance-handoff/readiness`
  );
  return response.data.data;
}

export async function createInsuranceHandoffRequest(
  propertyId: string,
  input: {
    recipientId: string;
    disclosureVersion: string;
    source: 'COVERAGE_COMPARISON';
    purpose: string;
    preferredContact: 'EMAIL' | 'SMS' | 'PHONE';
    contactEmail?: string;
    contactPhone?: string;
    coverageComparisonId?: string | null;
    consent: {
      dataSharing: true;
      disclosuresAccepted: true;
      email: boolean;
      sms: boolean;
      phone: boolean;
    };
  }
) {
  const response = await api.post<{
    success: true;
    data: { request: InsuranceHandoffRequestDTO };
  }>(`/api/properties/${propertyId}/insurance-handoff/requests`, input);
  return response.data.data.request;
}

export async function withdrawInsuranceHandoffRequest(propertyId: string, requestId: string) {
  const response = await api.post<{
    success: true;
    data: { request: InsuranceHandoffRequestDTO };
  }>(`/api/properties/${propertyId}/insurance-handoff/requests/${requestId}/withdraw`, {});
  return response.data.data.request;
}
