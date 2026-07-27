'use client';

import { useEffect, useState } from 'react';
import {
  createInsuranceHandoffRequest,
  getInsuranceHandoffReadiness,
  withdrawInsuranceHandoffRequest,
  type InsuranceHandoffReadinessDTO,
  type InsuranceHandoffRequestDTO,
} from '@/lib/api/insuranceHandoffApi';
import { getCoverageComparisonWorkspace } from '@/lib/api/coverageAnalysisApi';

type ContactChannel = 'EMAIL' | 'SMS' | 'PHONE';

function requestStatus(request: InsuranceHandoffRequestDTO) {
  if (request.status === 'QUOTE_RECEIVED') return 'A quote was received and added to your comparison.';
  if (request.status === 'WITHDRAWN') return 'Request withdrawn. Contact authorization has been revoked.';
  if (request.status === 'FAILED') return 'The request could not be fulfilled.';
  return `Help request ${request.status.toLowerCase().replace('_', ' ')}. No quote has been received yet.`;
}

export default function InsuranceHandoffPanel({ propertyId }: { propertyId: string }) {
  const [readiness, setReadiness] = useState<InsuranceHandoffReadinessDTO | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [request, setRequest] = useState<InsuranceHandoffRequestDTO | null>(null);
  const [channel, setChannel] = useState<ContactChannel>('EMAIL');
  const [contact, setContact] = useState('');
  const [channelConsent, setChannelConsent] = useState(false);
  const [dataConsent, setDataConsent] = useState(false);
  const [disclosureConsent, setDisclosureConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getInsuranceHandoffReadiness(propertyId),
      getCoverageComparisonWorkspace(propertyId),
    ])
      .then(([nextReadiness, workspace]) => {
        setReadiness(nextReadiness);
        setComparisonId(workspace.comparison?.id ?? null);
      })
      .catch((loadError: any) => setError(loadError?.message ?? 'Unable to check availability.'));
  }, [propertyId]);

  async function submit() {
    if (!readiness?.available || !contact.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createInsuranceHandoffRequest(propertyId, {
        recipientId: readiness.recipient.id,
        disclosureVersion: readiness.recipient.disclosureVersion,
        source: 'COVERAGE_COMPARISON',
        purpose: readiness.purpose,
        preferredContact: channel,
        contactEmail: channel === 'EMAIL' ? contact.trim() : undefined,
        contactPhone: channel !== 'EMAIL' ? contact.trim() : undefined,
        coverageComparisonId: comparisonId,
        consent: {
          dataSharing: true,
          disclosuresAccepted: true,
          email: channel === 'EMAIL' && channelConsent,
          sms: channel === 'SMS' && channelConsent,
          phone: channel === 'PHONE' && channelConsent,
        },
      });
      setRequest(created);
    } catch (submitError: any) {
      setError(submitError?.message ?? 'Unable to submit the help request.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      setRequest(await withdrawInsuranceHandoffRequest(propertyId, request.id));
    } catch (withdrawError: any) {
      setError(withdrawError?.message ?? 'Unable to withdraw the request.');
    } finally {
      setBusy(false);
    }
  }

  if (!readiness) {
    return (
      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {error ?? 'Checking licensed-help availability…'}
      </section>
    );
  }
  if (!readiness.available) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-card p-5">
        <h2 className="font-semibold">Licensed help is not currently available</h2>
        <p className="mt-1 text-sm text-muted-foreground">{readiness.message}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          We will not collect contact details or submit a request without an approved recipient for
          your jurisdiction.
        </p>
      </section>
    );
  }

  const recipient = readiness.recipient;
  if (request) {
    const withdrawable = !['QUOTE_RECEIVED', 'WITHDRAWN', 'CLOSED'].includes(request.status);
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Licensed-help request
        </p>
        <h2 className="mt-1 font-semibold">{requestStatus(request)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Recipient: {request.recipient.name}. Submitting this request did not mean a quote was
          received or that coverage was recommended.
        </p>
        {withdrawable && (
          <button
            type="button"
            onClick={() => void withdraw()}
            disabled={busy}
            className="mt-4 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Withdrawing…' : 'Withdraw request and contact consent'}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </section>
    );
  }

  const canSubmit =
    contact.trim().length > 0 && channelConsent && dataConsent && disclosureConsent && !busy;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Optional licensed help
      </p>
      <h2 className="mt-1 text-lg font-semibold">Ask {recipient.name} to help find choices</h2>
      <p className="mt-1 text-sm text-muted-foreground">{readiness.purpose}</p>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-lg bg-muted/40 p-3">
          <h3 className="font-semibold">Recipient and market</h3>
          <p className="mt-1">{recipient.licensingDisclosure}</p>
          <p className="mt-1">{recipient.marketScopeDisclosure}</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <h3 className="font-semibold">Commercial relationship</h3>
          <p className="mt-1">{recipient.compensationDisclosure}</p>
          <p className="mt-1">{recipient.commercialDisclosure}</p>
          <p className="mt-1">{recipient.rankingDisclosure}</p>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <p className="font-semibold">Data shared after consent</p>
        <p className="mt-1 text-muted-foreground">{readiness.sharedFields.join(', ')}.</p>
        <p className="mt-1 text-muted-foreground">
          Not shared: {readiness.excludedFields.join(', ')}.
        </p>
        <p className="mt-1 text-muted-foreground">
          Expected fulfillment window: {recipient.fulfillmentSlaHours} hours.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['EMAIL', 'SMS', 'PHONE'] as ContactChannel[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setChannel(value);
              setChannelConsent(false);
              setContact('');
            }}
            className={`rounded-lg border px-3 py-2 text-sm ${channel === value ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            {value === 'EMAIL' ? 'Email' : value === 'SMS' ? 'Text message' : 'Phone call'}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-sm font-medium">
        {channel === 'EMAIL' ? 'Email address' : 'Phone number'}
        <input
          type={channel === 'EMAIL' ? 'email' : 'tel'}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </label>
      <div className="mt-4 space-y-2 text-sm">
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={channelConsent}
            onChange={(event) => setChannelConsent(event.target.checked)}
          />
          I agree that {recipient.name} may contact me by {channel.toLowerCase()} about this request.
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={dataConsent}
            onChange={(event) => setDataConsent(event.target.checked)}
          />
          I authorize sharing only the data listed above for this purpose.
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={disclosureConsent}
            onChange={(event) => setDisclosureConsent(event.target.checked)}
          />
          I reviewed the recipient, licensing, market, compensation, and commercial disclosures.
        </label>
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Submitting request…' : 'Submit help request'}
      </button>
      <p className="mt-2 text-xs text-muted-foreground">
        This submits a request, not an insurance application and not a received quote.
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
