'use client';

import { useState, FormEvent } from 'react';
import { api } from '@/lib/api/client';
import { useToast } from '@/components/ui/use-toast';
import type { ProviderCredentialType, ServiceCategory, SubmitProviderCredentialPayload } from '@/types';
import { formatEnumLabel } from '@/lib/utils/formatters';

const CREDENTIAL_TYPES: ProviderCredentialType[] = [
  'TRADE_LICENSE',
  'LIABILITY_INSURANCE',
  'WORKERS_COMP_INSURANCE',
  'BONDING',
  'CERTIFICATION',
  'BACKGROUND_CHECK',
];

const ALL_SERVICE_CATEGORIES: ServiceCategory[] = [
  'INSPECTION', 'HANDYMAN', 'GENERAL_HANDYMAN', 'PLUMBING', 'ELECTRICAL', 'HVAC', 'ROOFING',
  'WATER_HEATER', 'FOUNDATION', 'WINDOWS_DOORS', 'INSULATION', 'LANDSCAPING', 'LANDSCAPING_DRAINAGE',
  'GUTTERS', 'SOLAR', 'FLOORING', 'PAINTING', 'SIDING', 'MOLD_REMEDIATION', 'APPLIANCE_REPAIR',
  'APPLIANCE_REPLACEMENT', 'SECURITY_SAFETY', 'CLEANING', 'MOVING', 'PEST_CONTROL', 'LOCKSMITH',
];

interface CredentialSubmitFormProps {
  /** Scopes the category checkboxes to what the provider actually offers, if known. */
  providerServiceCategories?: ServiceCategory[];
  /** When set, this is a renewal of an existing credential rather than a new submission. */
  renewalOfCredentialId?: string;
  onSubmitted: () => void;
  onCancel?: () => void;
}

/**
 * Credential submission form — type, categories, issuing authority, number,
 * dates, document upload. See
 * docs/functional/PROVIDER_TRUST_COMPLIANCE_FRD.md, Section 10.
 */
export function CredentialSubmitForm({
  providerServiceCategories,
  renewalOfCredentialId,
  onSubmitted,
  onCancel,
}: CredentialSubmitFormProps) {
  const { toast } = useToast();
  const [type, setType] = useState<ProviderCredentialType>('LIABILITY_INSURANCE');
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [credentialNumber, setCredentialNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = providerServiceCategories?.length ? providerServiceCategories : ALL_SERVICE_CATEGORIES;

  function toggleCategory(category: ServiceCategory) {
    setServiceCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!issuingAuthority.trim()) {
      setError('Issuing authority is required');
      return;
    }
    if (serviceCategories.length === 0) {
      setError('Select at least one service category');
      return;
    }

    setSubmitting(true);
    try {
      let documentId: string | undefined;
      if (file) {
        documentId = await api.uploadProviderCredentialDocument(file, type);
      }

      const payload: SubmitProviderCredentialPayload = {
        type,
        serviceCategories,
        issuingAuthority: issuingAuthority.trim(),
        credentialNumber: credentialNumber.trim() || undefined,
        issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : undefined,
        documentId,
      };

      if (renewalOfCredentialId) {
        await api.renewProviderCredential(renewalOfCredentialId, payload);
        toast({ title: 'Renewal submitted', description: 'An admin will review it shortly.' });
      } else {
        await api.submitProviderCredential(payload);
        toast({ title: 'Credential submitted', description: 'An admin will review it shortly.' });
      }

      onSubmitted();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit credential');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="mb-0 text-sm text-rose-800">{error}</p>
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Credential type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProviderCredentialType)}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {CREDENTIAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {formatEnumLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Service categories covered</label>
        <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2 sm:grid-cols-3">
          {categoryOptions.map((category) => (
            <label key={category} className="flex items-center gap-1.5 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={serviceCategories.includes(category)}
                onChange={() => toggleCategory(category)}
                className="rounded border-neutral-300"
              />
              {formatEnumLabel(category)}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Issuing authority</label>
          <input
            type="text"
            value={issuingAuthority}
            onChange={(e) => setIssuingAuthority(e.target.value)}
            placeholder="e.g. California Contractors State License Board"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Credential/license number</label>
          <input
            type="text"
            value={credentialNumber}
            onChange={(e) => setCredentialNumber(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Issue date</label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Expiry date <span className="text-neutral-400">(leave blank if it doesn&apos;t expire)</span>
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Evidence document (PDF or photo)</label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-neutral-700"
        />
        <p className="mb-0 mt-1 text-xs text-neutral-500">
          Required before this credential can move out of review.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : renewalOfCredentialId ? 'Submit renewal' : 'Submit credential'}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
