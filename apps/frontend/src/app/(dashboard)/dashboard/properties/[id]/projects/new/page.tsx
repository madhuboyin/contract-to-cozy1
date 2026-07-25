'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  MobileCard,
  MobilePageContainer,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { PROJECT_TYPE_OPTIONS, ErrorBanner } from '../ProjectTrackerHelpers';
import { PropertyContextCapturePanel } from '@/components/property-context/PropertyContextCapturePanel';
import {
  projectTrackerLaunchQuery,
  projectTrackerLineage,
} from '@/features/tools/projectTrackerLaunchContext';

type ProjectFormState = {
  name: string;
  projectType: string;
  contractorName: string;
  contractorPhone: string;
  contractorLicense: string;
  contractorEmail: string;
  contractAmountCents: string;
  startDate: string;
  expectedEndDate: string;
  executionPath: 'REPAIR' | 'REPLACEMENT';
  fulfillmentMode: 'PROVIDER' | 'DIY';
  fundingMode: 'SELF_PAID' | 'COVERED' | 'MIXED';
  complexity: 'MINOR' | 'MAJOR';
  providerRankingRationale: string;
  commercialRelationshipType: 'NONE' | 'SPONSORED' | 'REFERRAL_FEE' | 'COMMISSION' | 'OWNED' | 'AFFILIATE' | 'OTHER';
  commercialDisclosureSummary: string;
  nonCommercialAlternative: string;
  recommendationComprehensionConfirmed: boolean;
};

export default function NewProjectPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const guidanceJourneyId =
    searchParams.get('guidanceJourneyId') ?? searchParams.get('journeyId');
  const launchLineage = projectTrackerLineage(searchParams);
  const launchQuery = projectTrackerLaunchQuery(searchParams);
  const launchSuffix = launchQuery ? `?${launchQuery}` : '';
  const inventoryItemId = searchParams.get('itemId') ?? searchParams.get('inventoryItemId');
  const guidedIssue = searchParams.get('issueType');
  const providerId = searchParams.get('providerId');
  const serviceCategory = searchParams.get('category') ?? searchParams.get('serviceCategory');
  const [providerReadiness, setProviderReadiness] = useState<Awaited<ReturnType<typeof api.getProjectProviderReadiness>> | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextInvoked, setContextInvoked] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [resumeRequested, setResumeRequested] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<ProjectFormState>({
    name: '',
    projectType: 'CUSTOM',
    contractorName: '',
    contractorPhone: '',
    contractorLicense: '',
    contractorEmail: '',
    contractAmountCents: '',
    startDate: new Date().toISOString().split('T')[0],
    expectedEndDate: '',
    executionPath: 'REPAIR',
    fulfillmentMode: 'PROVIDER',
    fundingMode: 'SELF_PAID',
    complexity: 'MAJOR',
    providerRankingRationale: '',
    commercialRelationshipType: 'NONE',
    commercialDisclosureSummary: 'ContractToCozy does not influence this provider selection for compensation.',
    nonCommercialAlternative: 'Use a provider you find independently or complete the work yourself when appropriate.',
    recommendationComprehensionConfirmed: false,
  });

  const set = (field: keyof ProjectFormState, value: string) =>
    setForm(f => ({ ...f, [field]: value }) as ProjectFormState);

  const operationInput = useMemo(() => ({ projectType: form.projectType }), [form.projectType]);

  useEffect(() => {
    setContextInvoked(false);
    setContextReady(false);
    setResumeRequested(false);
  }, [form.projectType]);

  useEffect(() => {
    if (!providerId || !serviceCategory) return;
    api.getProjectProviderReadiness(propertyId, providerId, serviceCategory)
      .then(setProviderReadiness)
      .catch(() => setProviderReadiness(null));
  }, [propertyId, providerId, serviceCategory]);

  useEffect(() => {
    if (!contextReady || !resumeRequested) return;
    setResumeRequested(false);
    formRef.current?.requestSubmit();
  }, [contextReady, resumeRequested]);

  const toInt = (s: string) => {
    const v = parseFloat(s.replace(/[^0-9.]/g, ''));
    return isNaN(v) ? undefined : Math.round(v * 100);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Project name is required'); return; }
    if (form.fulfillmentMode === 'PROVIDER' && !form.contractorName.trim()) { setError('Contractor name is required for provider-led work'); return; }
    if (guidanceJourneyId && form.fulfillmentMode === 'PROVIDER' && !form.providerRankingRationale.trim()) { setError('Explain why this provider fits the project'); return; }
    if (!form.contractAmountCents) { setError('Contract amount is required'); return; }
    const amtCents = toInt(form.contractAmountCents);
    if (!amtCents || amtCents <= 0) { setError('Enter a valid contract amount'); return; }
    if (!form.startDate) { setError('Start date is required'); return; }
    if (guidanceJourneyId && inventoryItemId && form.complexity === 'MINOR' && !form.recommendationComprehensionConfirmed) { setError('Confirm that you understood the recommendation, alternatives, and tradeoffs'); return; }
    if (!contextReady) {
      setContextInvoked(true);
      setResumeRequested(true);
      return;
    }

    setSaving(true);
    try {
      const commercialDisclosure = guidanceJourneyId && form.fulfillmentMode === 'PROVIDER' ? {
        involvesCommercialAction: true,
        relationshipType: form.commercialRelationshipType,
        compensationMayOccur: form.commercialRelationshipType !== 'NONE',
        rankingInfluenced: ['SPONSORED', 'COMMISSION', 'OWNED', 'AFFILIATE'].includes(form.commercialRelationshipType),
        summary: form.commercialDisclosureSummary.trim(),
        selectionCriteria: ['Homeowner-stated fit', 'Project scope', 'Credentials relevant to the category and jurisdiction'],
        nonCommercialAlternatives: [form.nonCommercialAlternative.trim()],
      } : undefined;
      if (guidanceJourneyId && inventoryItemId && form.complexity === 'MINOR') {
        await api.completeMinorWork(propertyId, {
          guidanceJourneyId,
          inventoryItemId,
          title: form.name.trim(),
          executionPath: form.executionPath,
          fulfillmentMode: form.fulfillmentMode,
          providerName: form.fulfillmentMode === 'PROVIDER' ? form.contractorName.trim() : undefined,
          providerRankingRationale: form.providerRankingRationale.trim() || undefined,
          commercialDisclosure,
          actualEndDate: form.startDate,
          actualCostCents: amtCents,
          recommendationComprehensionConfirmed: true,
        });
        router.push(`/dashboard/properties/${propertyId}/projects`);
        return;
      }
      const project = await api.createProject(propertyId, {
        name: form.name.trim(),
        projectType: form.projectType,
        contractorName: form.fulfillmentMode === 'PROVIDER' ? form.contractorName.trim() : undefined,
        contractorPhone: form.contractorPhone.trim() || undefined,
        contractorLicense: form.contractorLicense.trim() || undefined,
        contractorEmail: form.contractorEmail.trim() || undefined,
        contractorId: providerId || undefined,
        contractAmountCents: amtCents,
        startDate: form.startDate,
        expectedEndDate: form.expectedEndDate || undefined,
        sourceType: guidanceJourneyId ? 'GUIDANCE' : 'MANUAL',
        guidanceJourneyId: guidanceJourneyId || undefined,
        inventoryItemId: inventoryItemId || undefined,
        executionPath: form.executionPath,
        fulfillmentMode: form.fulfillmentMode,
        fundingMode: form.fundingMode,
        complexity: form.complexity,
        serviceCategory: serviceCategory || undefined,
        providerRankingRationale: form.providerRankingRationale.trim() || undefined,
        commercialDisclosure,
        ...launchLineage,
      });
      router.push(
        `/dashboard/properties/${propertyId}/projects/${project.id}${launchSuffix}`,
      );
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project');
      setSaving(false);
    }
  }

  return (
    <MobilePageContainer className="space-y-4 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:max-w-2xl lg:pb-10">
      <Button variant="ghost" className="min-h-[44px] w-fit px-0 text-muted-foreground" asChild>
        <Link href={`/dashboard/properties/${propertyId}/projects${launchSuffix}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to projects
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-900">New Project</h1>
        <p className="text-sm text-slate-500">Set up a project to track milestones, payments, and progress photos.</p>
      </div>

      {error && <ErrorBanner msg={error} />}

      {guidanceJourneyId ? (
        <MobileCard className="border-indigo-200 bg-indigo-50/70">
          <p className="text-sm font-semibold text-indigo-900">Continuing your guided home decision</p>
          <p className="mt-1 text-xs text-indigo-800">
            {guidedIssue ? `This project will stay linked to “${guidedIssue}”. ` : ''}
            Confirm the execution path below before work begins.
          </p>
        </MobileCard>
      ) : null}

      {guidanceJourneyId && inventoryItemId && form.complexity === 'MINOR' ? (
        <MobileCard className="border-emerald-200 bg-emerald-50 text-emerald-900">
          <p className="text-sm font-semibold">Lightweight minor-work closure</p>
          <p className="mt-1 text-xs">Submitting records the verified work directly in the Living Home Record and advances future care without creating a full project tracker.</p>
          <label className="mt-3 flex items-start gap-2 text-xs"><input className="mt-0.5" type="checkbox" checked={form.recommendationComprehensionConfirmed} onChange={event => setForm(current => ({ ...current, recommendationComprehensionConfirmed: event.target.checked }))} /> I understood the recommendation, alternatives, material tradeoffs, and why this path was selected.</label>
        </MobileCard>
      ) : null}

      {contextInvoked ? <PropertyContextCapturePanel
        propertyId={propertyId}
        featureKey="PROJECTS"
        operationKey="CREATE_PROJECT"
        operationInput={operationInput}
        onReady={() => setContextReady(true)}
      /> : null}

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
        {/* Project basics */}
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Project basics</h2>

          <div className="space-y-1.5">
            <Label htmlFor="name">Project name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Roof Replacement 2026"
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="projectType">Project type *</Label>
            <select
              id="projectType"
              value={form.projectType}
              onChange={e => set('projectType', e.target.value)}
              className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {PROJECT_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="executionPath">Execution path</Label>
              <select id="executionPath" value={form.executionPath} onChange={e => set('executionPath', e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="REPAIR">Repair</option>
                <option value="REPLACEMENT">Replacement</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="complexity">Complexity</Label>
              <select id="complexity" value={form.complexity} onChange={e => set('complexity', e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="MINOR">Minor work</option>
                <option value="MAJOR">Major project</option>
              </select>
            </div>
          </div>
        </MobileCard>

        {/* Contractor info */}
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Contractor</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fulfillmentMode">Who will do the work?</Label>
              <select id="fulfillmentMode" value={form.fulfillmentMode} onChange={e => set('fulfillmentMode', e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="PROVIDER">Provider</option>
                <option value="DIY">DIY / household</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fundingMode">Funding</Label>
              <select id="fundingMode" value={form.fundingMode} onChange={e => set('fundingMode', e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="SELF_PAID">Self-paid</option>
                <option value="COVERED">Covered</option>
                <option value="MIXED">Mixed</option>
              </select>
            </div>
          </div>

          {form.fulfillmentMode === 'PROVIDER' ? <div className="space-y-1.5">
            <Label htmlFor="contractorName">Contractor / company name *</Label>
            <Input
              id="contractorName"
              value={form.contractorName}
              onChange={e => set('contractorName', e.target.value)}
              placeholder="ABC Roofing Co."
              className="h-11"
            />
          </div> : null}

          {guidanceJourneyId && form.fulfillmentMode === 'PROVIDER' ? (
            <div className="space-y-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <div>
                <p className="text-sm font-semibold text-indigo-950">Provider fit and commercial disclosure</p>
                <p className="mt-1 text-xs text-indigo-800">Review this before confirming the provider. Platform-listed providers are credential-checked again when the project is created.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="providerRankingRationale">Why this provider fits *</Label>
                <Textarea id="providerRankingRationale" value={form.providerRankingRationale} onChange={e => set('providerRankingRationale', e.target.value)} rows={3} placeholder="Explain scope fit, availability, credentials, price, and tradeoffs." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commercialRelationshipType">ContractToCozy relationship</Label>
                <select id="commercialRelationshipType" value={form.commercialRelationshipType} onChange={e => set('commercialRelationshipType', e.target.value)} className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="NONE">No commercial relationship</option>
                  <option value="SPONSORED">Sponsored</option>
                  <option value="REFERRAL_FEE">Referral fee</option>
                  <option value="COMMISSION">Commission</option>
                  <option value="AFFILIATE">Affiliate</option>
                  <option value="OWNED">Owned provider</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="commercialDisclosureSummary">Disclosure</Label>
                <Textarea id="commercialDisclosureSummary" value={form.commercialDisclosureSummary} onChange={e => set('commercialDisclosureSummary', e.target.value)} rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nonCommercialAlternative">Non-commercial alternative</Label>
                <Textarea id="nonCommercialAlternative" value={form.nonCommercialAlternative} onChange={e => set('nonCommercialAlternative', e.target.value)} rows={2} />
              </div>
            </div>
          ) : null}

          {providerReadiness && form.fulfillmentMode === 'PROVIDER' ? (
            <div className={`rounded-lg border p-3 ${providerReadiness.jurisdictionStatus === 'VERIFIED' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-sm font-semibold">{providerReadiness.provider.businessName} · {providerReadiness.jurisdiction} readiness</p>
              <p className="mt-1 text-xs">Category eligibility: {providerReadiness.jurisdictionStatus.toLowerCase()}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {providerReadiness.credentials.map(credential => (
                  <span key={`${credential.type}-${credential.expiryDate}`} className="rounded-full bg-white px-2 py-1 text-xs ring-1 ring-black/10">
                    {credential.type.toLowerCase().replace(/_/g, ' ')}{credential.expiryDate ? ` · expires ${new Date(credential.expiryDate).toLocaleDateString()}` : ''}
                  </span>
                ))}
              </div>
              {providerReadiness.missingCredentialTypes.length ? <p className="mt-2 text-xs font-medium text-amber-900">Missing: {providerReadiness.missingCredentialTypes.join(', ').toLowerCase().replace(/_/g, ' ')}</p> : null}
            </div>
          ) : null}

          {form.fulfillmentMode === 'PROVIDER' ? <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contractorPhone">Phone</Label>
              <Input
                id="contractorPhone"
                type="tel"
                value={form.contractorPhone}
                onChange={e => set('contractorPhone', e.target.value)}
                placeholder="(555) 000-0000"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contractorLicense">License #</Label>
              <Input
                id="contractorLicense"
                value={form.contractorLicense}
                onChange={e => set('contractorLicense', e.target.value)}
                placeholder="CA-12345"
                className="h-11"
              />
            </div>
          </div> : null}

          {form.fulfillmentMode === 'PROVIDER' ? <div className="space-y-1.5">
            <Label htmlFor="contractorEmail">Email</Label>
            <Input
              id="contractorEmail"
              type="email"
              value={form.contractorEmail}
              onChange={e => set('contractorEmail', e.target.value)}
              placeholder="contractor@example.com"
              className="h-11"
            />
          </div> : null}
        </MobileCard>

        {/* Contract / schedule */}
        <MobileCard className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Contract &amp; schedule</h2>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Contract amount ($) *</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={form.contractAmountCents}
              onChange={e => set('contractAmountCents', e.target.value)}
              placeholder="12500.00"
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date *</Label>
              <Input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedEndDate">Expected completion</Label>
              <Input
                id="expectedEndDate"
                type="date"
                value={form.expectedEndDate}
                onChange={e => set('expectedEndDate', e.target.value)}
                className="h-11"
              />
            </div>
          </div>
        </MobileCard>

        <Button type="submit" disabled={saving} className="w-full min-h-[48px] text-base">
          {saving ? 'Creating…' : 'Create project'}
        </Button>
      </form>
    </MobilePageContainer>
  );
}
