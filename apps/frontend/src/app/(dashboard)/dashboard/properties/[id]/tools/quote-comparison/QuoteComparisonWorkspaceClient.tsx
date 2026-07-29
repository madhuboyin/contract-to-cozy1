'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  ActionPriorityRow,
  CompactEntityRow,
  ResultHeroCard,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { formatEnumLabel } from '@/lib/utils/formatters';
import {
  confirmQuoteProposal,
  createQuoteClarification,
  createQuoteProposal,
  createQuoteProposalFromDocument,
  getQuoteComparability,
  getQuoteComparisonWorkspace,
  listServicePriceRadarChecks,
  getProjectComplianceContext,
  getOrCreateQuoteComparisonWorkspace,
  deleteQuoteProposal,
  resolveQuoteClarification,
  setQuoteDisposition,
  type QuoteComparabilityResult,
  type QuoteComparisonWorkspaceSummary,
  type QuoteProposalReadinessStage,
  type QuoteProposalSummary,
  type ServicePriceRadarCheckSummary,
  type ServiceRadarVerdict,
  selectQuoteForDecision,
  transitionServiceQuoteDecision,
  updateQuoteProposal,
  updateServiceQuoteOutcomeConsent,
} from '../service-price-radar/servicePriceRadarApi';
import { api } from '@/lib/api/client';
import { createNegotiationShieldCase } from '../negotiation-shield/negotiationShieldApi';
import { createPriceFinalizationDraft } from '@/lib/api/priceFinalizationApi';
import HomeToolsRail from '../../components/HomeToolsRail';
import CompareTemplate from '../../components/route-templates/CompareTemplate';
import { pricingLoopTrust } from '@/lib/trust/trustPresets';
import { buildGuidanceOverviewHref } from '@/lib/navigation/guidanceOverviewHref';
import { track } from '@/lib/analytics/events';
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';
import { CapabilityDiscoveryAnchor } from '@/features/tools/CapabilityDiscoveryAnchor';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { buildKnownFacts, buildProposalEvidence, isProposalStale } from './quoteDecisionUi';

type SearchParamSource = { get(name: string): string | null };

type QuoteCandidate = {
  id: string;
  vendorName: string;
  quoteAmount: number;
  currency: string;
  serviceCategory: string | null;
  verdict: ServiceRadarVerdict | null;
  confidenceScore: number | null;
  expectedLow: number | null;
  expectedHigh: number | null;
  sourceLabel: string;
  serviceRadarCheckId: string | null;
  createdAt: string | null;
  readinessStage: QuoteProposalReadinessStage;
  readinessScore: number;
  missingFacts: Array<{ key: string; label: string; whyItMatters: string }>;
  persisted: boolean;
  extracted: boolean;
  homeownerConfirmed: boolean;
  proposal: QuoteProposalSummary | null;
  decision: 'UNDECIDED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED';
};

type QuoteEditForm = {
  vendorName: string;
  quoteAmount: string;
  quoteDate: string;
  expirationDate: string;
  serviceLocation: string;
  scopeKind: QuoteProposalSummary['scopeKind'];
  scopeSummary: string;
  notes: string;
};

const CONTEXT_KEYS = [
  'guidanceJourneyId',
  'guidanceStepKey',
  'guidanceSignalIntentFamily',
  'itemId',
  'serviceCategory',
  'vendorName',
  'quoteAmount',
  'quoteComparisonWorkspaceId',
  'serviceRadarCheckId',
  'negotiationShieldCaseId',
] as const;

function toNumberOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
}

function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function toDateInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function buildContextQuery(searchParams: SearchParamSource): string {
  const query = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

function mapRadarCheckToQuote(check: ServicePriceRadarCheckSummary): QuoteCandidate {
  return {
    id: check.id,
    vendorName: check.quoteVendorName || 'Vendor not specified',
    quoteAmount: check.quoteAmount,
    currency: check.quoteCurrency || 'USD',
    serviceCategory: check.serviceCategory || null,
    verdict: check.verdict,
    confidenceScore: check.confidenceScore,
    expectedLow: check.expectedLow,
    expectedHigh: check.expectedHigh,
    sourceLabel: 'Service Price Radar',
    serviceRadarCheckId: check.id,
    createdAt: check.createdAt,
    readinessStage: 'PLANNING_ESTIMATE',
    readinessScore: 0,
    missingFacts: [],
    persisted: false,
    extracted: false,
    homeownerConfirmed: false,
    proposal: null,
    decision: 'UNDECIDED',
  };
}

function mapProposalToQuote(proposal: QuoteProposalSummary): QuoteCandidate {
  return {
    id: proposal.id,
    vendorName: proposal.vendorName,
    quoteAmount: Number(proposal.quoteAmount),
    currency: proposal.currency || 'USD',
    serviceCategory: proposal.serviceCategory,
    verdict: null,
    confidenceScore: null,
    expectedLow: null,
    expectedHigh: null,
    sourceLabel: proposal.extractions?.length ? 'Extracted quote document' : 'Saved proposal',
    serviceRadarCheckId:
      proposal.sourceType === 'SYSTEM_LINKED' ? proposal.sourceReferenceId : null,
    createdAt: proposal.createdAt,
    readinessStage: proposal.readinessStage,
    readinessScore: proposal.readinessScore,
    missingFacts: Array.isArray(proposal.missingFactsJson) ? proposal.missingFactsJson : [],
    persisted: true,
    extracted: Boolean(proposal.extractions?.length),
    homeownerConfirmed: Boolean(proposal.homeownerConfirmedAt),
    proposal,
    decision: proposal.decision,
  };
}

function sortCandidates(quotes: QuoteCandidate[], preferredCategory?: string | null) {
  return [...quotes].sort((a, b) => {
    const aCategoryBoost = preferredCategory && a.serviceCategory === preferredCategory ? 1 : 0;
    const bCategoryBoost = preferredCategory && b.serviceCategory === preferredCategory ? 1 : 0;
    if (aCategoryBoost !== bCategoryBoost) return bCategoryBoost - aCategoryBoost;

    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aDate !== bDate) return bDate - aDate;

    return a.quoteAmount - b.quoteAmount;
  });
}

function formatExpectedRange(quote: QuoteCandidate): string {
  if (typeof quote.expectedLow === 'number' && typeof quote.expectedHigh === 'number') {
    return `${formatMoney(quote.expectedLow, quote.currency)} - ${formatMoney(quote.expectedHigh, quote.currency)} expected`;
  }
  return 'No expected range yet';
}

export default function QuoteComparisonWorkspaceClient() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const searchParams = useSearchParams();
  const defaultCategory = searchParams.get('serviceCategory');
  const defaultVendorName = searchParams.get('vendorName');
  const defaultQuoteAmount = searchParams.get('quoteAmount');
  const guidanceStepKey = searchParams.get('guidanceStepKey');
  const guidanceJourneyId = searchParams.get('guidanceJourneyId');
  const guidanceSignalIntentFamily = searchParams.get('guidanceSignalIntentFamily');
  const itemId = searchParams.get('itemId');
  const contextQuery = buildContextQuery(searchParams);

  React.useEffect(() => {
    if (!propertyId) return;
    track('workflow_started', {
      tool: 'quote-comparison',
      propertyId,
      entryPoint: guidanceJourneyId ? 'guidance' : 'direct',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);
  const isGuidanceContext = Boolean(guidanceJourneyId);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [quotes, setQuotes] = React.useState<QuoteCandidate[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = React.useState<string[]>([]);
  const [manualVendorName, setManualVendorName] = React.useState('');
  const [manualQuoteAmount, setManualQuoteAmount] = React.useState('');
  const [manualScopeKind, setManualScopeKind] = React.useState<'REPAIR' | 'REPLACEMENT' | 'INSTALLATION' | 'MAINTENANCE' | 'INSPECTION' | 'OTHER' | 'UNKNOWN'>('UNKNOWN');
  const [manualScopeSummary, setManualScopeSummary] = React.useState('');
  const [manualServiceLocation, setManualServiceLocation] = React.useState('');
  const [manualLineItem, setManualLineItem] = React.useState('');
  const [manualInclusions, setManualInclusions] = React.useState('');
  const [manualExclusions, setManualExclusions] = React.useState('');
  const [manualWarranty, setManualWarranty] = React.useState('');
  const [manualPayment, setManualPayment] = React.useState('');
  const [manualInputError, setManualInputError] = React.useState<string | null>(null);
  const [savingQuote, setSavingQuote] = React.useState(false);
  const [uploadingQuote, setUploadingQuote] = React.useState(false);
  const [propertyContext, setPropertyContext] = React.useState<PropertyContextEnvelope | null>(null);
  const [comparability, setComparability] = React.useState<QuoteComparabilityResult | null>(null);
  const [decisionWorkspace, setDecisionWorkspace] = React.useState<QuoteComparisonWorkspaceSummary | null>(null);
  const [journeyActionPending, setJourneyActionPending] = React.useState(false);
  const [consentPending, setConsentPending] = React.useState(false);
  const [editingQuote, setEditingQuote] = React.useState<QuoteProposalSummary | null>(null);
  const [editForm, setEditForm] = React.useState<QuoteEditForm | null>(null);
  const [clarificationDrafts, setClarificationDrafts] = React.useState<Record<string, string>>({});
  const [clarificationResponses, setClarificationResponses] = React.useState<Record<string, string>>({});
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(
    searchParams.get('quoteComparisonWorkspaceId')
  );

  const prefilledQuote = React.useMemo<QuoteCandidate | null>(() => {
    const parsedAmount = toNumberOrNull(defaultQuoteAmount);
    if (!parsedAmount) return null;
    return {
      id: 'guidance-prefill',
      vendorName: defaultVendorName?.trim() || 'Current quote',
      quoteAmount: parsedAmount,
      currency: 'USD',
      serviceCategory: defaultCategory || null,
      verdict: null,
      confidenceScore: null,
      expectedLow: null,
      expectedHigh: null,
      sourceLabel: 'Prefilled quote',
      serviceRadarCheckId: null,
      createdAt: null,
      readinessStage: 'PLANNING_ESTIMATE',
      readinessScore: 0,
      missingFacts: [],
      persisted: false,
      extracted: false,
      homeownerConfirmed: false,
      proposal: null,
      decision: 'UNDECIDED',
    };
  }, [defaultCategory, defaultQuoteAmount, defaultVendorName]);

  const loadQuotes = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [checks, context, workspaceResult] = await Promise.all([
        listServicePriceRadarChecks(propertyId, 24),
        getProjectComplianceContext(propertyId, 'QUOTE_COMPARISON'),
        getOrCreateQuoteComparisonWorkspace(propertyId, {
          serviceCategory: (defaultCategory as ServicePriceRadarCheckSummary['serviceCategory']) || null,
          inventoryItemId: itemId,
          guidanceJourneyId,
          guidanceStepKey,
          guidanceSignalIntentFamily,
        }),
      ]);
      setPropertyContext(context);
      setWorkspaceId(workspaceResult.workspace.id);
      const [savedWorkspace, comparisonResult] = await Promise.all([
        getQuoteComparisonWorkspace(propertyId, workspaceResult.workspace.id),
        getQuoteComparability(propertyId, workspaceResult.workspace.id),
      ]);
      setComparability(comparisonResult);
      setDecisionWorkspace(savedWorkspace);

      const mappedChecks = checks.map(mapRadarCheckToQuote);
      const savedQuotes = (savedWorkspace.quotes ?? []).map(mapProposalToQuote);
      const merged = prefilledQuote
        ? [prefilledQuote, ...savedQuotes, ...mappedChecks]
        : [...savedQuotes, ...mappedChecks];

      // Deduplicate by id, then sort by category relevance and recency.
      const dedupedMap = new Map<string, QuoteCandidate>();
      for (const quote of merged) {
        dedupedMap.set(quote.id, quote);
      }
      const nextQuotes = sortCandidates(Array.from(dedupedMap.values()), defaultCategory);
      setQuotes(nextQuotes);
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load quote candidates.');
      setQuotes(prefilledQuote ? [prefilledQuote] : []);
      setPropertyContext(null);
      setComparability(null);
      setDecisionWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [
    defaultCategory,
    prefilledQuote,
    propertyId,
    itemId,
    guidanceJourneyId,
    guidanceStepKey,
    guidanceSignalIntentFamily,
  ]);

  React.useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  React.useEffect(() => {
    if (quotes.length === 0) {
      setSelectedQuoteIds([]);
      return;
    }

    setSelectedQuoteIds((previous) => {
      const existing = previous.filter((id) => quotes.some((quote) => quote.id === id));
      if (existing.length > 0) return existing.slice(0, 3);

      return quotes.slice(0, 2).map((quote) => quote.id);
    });
  }, [quotes]);

  const selectedQuotes = React.useMemo(
    () => quotes.filter((quote) => selectedQuoteIds.includes(quote.id)),
    [quotes, selectedQuoteIds]
  );

  const comparisonSpread = React.useMemo(() => {
    if (selectedQuotes.length < 2) return null;
    const amounts = selectedQuotes.map((quote) => quote.quoteAmount);
    const low = Math.min(...amounts);
    const high = Math.max(...amounts);
    return {
      low,
      high,
      spread: high - low,
    };
  }, [selectedQuotes]);

  const toggleSelection = (quoteId: string) => {
    setSelectedQuoteIds((previous) => {
      if (previous.includes(quoteId)) {
        return previous.filter((id) => id !== quoteId);
      }
      if (previous.length >= 3) {
        return previous;
      }
      return [...previous, quoteId];
    });
  };

  const addManualQuote = async () => {
    const parsedAmount = toNumberOrNull(manualQuoteAmount);
    if (!manualVendorName.trim()) {
      setManualInputError('Vendor name is required.');
      return;
    }
    if (!parsedAmount) {
      setManualInputError('Enter a valid quote amount greater than 0.');
      return;
    }

    if (!workspaceId) {
      setManualInputError('The quote workspace is still loading.');
      return;
    }
    setSavingQuote(true);
    try {
      const proposal = await createQuoteProposal(propertyId, workspaceId, {
        vendorName: manualVendorName.trim(),
        quoteAmount: parsedAmount,
        serviceCategory: (defaultCategory as ServicePriceRadarCheckSummary['serviceCategory']) || null,
        quoteDate: new Date().toISOString(),
        scopeKind: manualScopeKind,
        scopeSummary: manualScopeSummary.trim() || null,
        serviceLocation: manualServiceLocation.trim() || null,
        lineItems: manualLineItem.trim()
          ? [{ description: manualLineItem.trim(), kind: 'OTHER', total: parsedAmount }]
          : [],
        terms: [
          ...(manualInclusions.trim() ? [{ type: 'INCLUSION' as const, value: manualInclusions.trim(), included: true }] : []),
          ...(manualExclusions.trim() ? [{ type: 'EXCLUSION' as const, value: manualExclusions.trim(), included: false }] : []),
          ...(manualWarranty.trim() ? [{ type: 'WARRANTY' as const, value: manualWarranty.trim() }] : []),
          ...(manualPayment.trim() ? [{ type: 'PAYMENT' as const, value: manualPayment.trim() }] : []),
        ],
      });
      const manualQuote = mapProposalToQuote(proposal);
      setQuotes((previous) => sortCandidates([manualQuote, ...previous], defaultCategory));
      setSelectedQuoteIds((previous) => [manualQuote.id, ...previous].slice(0, 3));
      setManualVendorName('');
      setManualQuoteAmount('');
      setManualScopeKind('UNKNOWN');
      setManualScopeSummary('');
      setManualServiceLocation('');
      setManualLineItem('');
      setManualInclusions('');
      setManualExclusions('');
      setManualWarranty('');
      setManualPayment('');
      setManualInputError(null);
      setComparability(await getQuoteComparability(propertyId, workspaceId));
    } catch (saveError: any) {
      setManualInputError(saveError?.message || 'Unable to save this quote.');
    } finally {
      setSavingQuote(false);
    }
  };

  const uploadQuoteDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !workspaceId) return;
    setUploadingQuote(true);
    setManualInputError(null);
    try {
      const analyzed = await api.analyzeDocument(file, propertyId, false);
      if (!('data' in analyzed)) {
        throw new Error(analyzed.error?.message || analyzed.message || 'Document analysis failed.');
      }
      const documentId = analyzed.data?.document?.id;
      if (!documentId) throw new Error('Document analysis did not return a saved document.');
      const proposal = await createQuoteProposalFromDocument(propertyId, workspaceId, documentId);
      const extractedQuote = mapProposalToQuote(proposal);
      setQuotes((previous) => sortCandidates([extractedQuote, ...previous], defaultCategory));
      setSelectedQuoteIds((previous) => [extractedQuote.id, ...previous].slice(0, 3));
      setComparability(await getQuoteComparability(propertyId, workspaceId));
    } catch (uploadError: any) {
      setManualInputError(uploadError?.message || 'Unable to analyze this quote document.');
    } finally {
      setUploadingQuote(false);
    }
  };

  const confirmExtractedQuote = async (quoteId: string) => {
    if (!workspaceId) return;
    try {
      const proposal = await confirmQuoteProposal(propertyId, workspaceId, quoteId);
      const confirmed = mapProposalToQuote(proposal);
      setQuotes((previous) => previous.map((quote) => quote.id === quoteId ? confirmed : quote));
      setComparability(await getQuoteComparability(propertyId, workspaceId));
    } catch (confirmError: any) {
      setError(confirmError?.message || 'Unable to confirm extracted facts.');
    }
  };

  const openQuoteEditor = (proposal: QuoteProposalSummary) => {
    setEditingQuote(proposal);
    setEditForm({
      vendorName: proposal.vendorName,
      quoteAmount: String(Number(proposal.quoteAmount)),
      quoteDate: toDateInput(proposal.quoteDate),
      expirationDate: toDateInput(proposal.expirationDate),
      serviceLocation: proposal.serviceLocation ?? '',
      scopeKind: proposal.scopeKind,
      scopeSummary: proposal.scopeSummary ?? '',
      notes: proposal.notes ?? '',
    });
  };

  const saveQuoteEdits = async () => {
    if (!workspaceId || !editingQuote || !editForm) return;
    const amount = toNumberOrNull(editForm.quoteAmount);
    if (!editForm.vendorName.trim() || !amount) {
      setError('Provider name and a valid total are required.');
      return;
    }
    setJourneyActionPending(true);
    setError(null);
    try {
      await updateQuoteProposal(propertyId, workspaceId, editingQuote.id, {
        vendorName: editForm.vendorName.trim(),
        quoteAmount: amount,
        quoteDate: editForm.quoteDate ? new Date(`${editForm.quoteDate}T12:00:00Z`).toISOString() : null,
        expirationDate: editForm.expirationDate
          ? new Date(`${editForm.expirationDate}T12:00:00Z`).toISOString()
          : null,
        serviceLocation: editForm.serviceLocation.trim() || null,
        scopeKind: editForm.scopeKind,
        scopeSummary: editForm.scopeSummary.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      setEditingQuote(null);
      setEditForm(null);
      await loadQuotes();
    } catch (editError: any) {
      setError(editError?.message || 'Unable to update this proposal.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const removeQuote = async (quote: QuoteCandidate) => {
    if (!workspaceId || !quote.persisted) return;
    if (!window.confirm(`Delete ${quote.vendorName}'s proposal and its extracted facts? This cannot be undone.`)) {
      return;
    }
    setJourneyActionPending(true);
    setError(null);
    try {
      await deleteQuoteProposal(propertyId, workspaceId, quote.id);
      await loadQuotes();
    } catch (deleteError: any) {
      setError(deleteError?.message || 'Unable to delete this proposal.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const changeDisposition = async (
    quote: QuoteCandidate,
    decision: 'REJECTED' | 'UNDECIDED',
  ) => {
    if (!workspaceId) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await setQuoteDisposition(propertyId, workspaceId, quote.id, decision);
      await loadQuotes();
    } catch (dispositionError: any) {
      setError(dispositionError?.message || 'Unable to update this proposal decision.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const askForClarification = async (quoteId: string) => {
    if (!workspaceId) return;
    const question = clarificationDrafts[quoteId]?.trim();
    if (!question) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await createQuoteClarification(propertyId, workspaceId, quoteId, question);
      setClarificationDrafts((current) => ({ ...current, [quoteId]: '' }));
      await loadQuotes();
    } catch (clarificationError: any) {
      setError(clarificationError?.message || 'Unable to save this clarification.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const answerClarification = async (
    quoteId: string,
    clarificationId: string,
  ) => {
    if (!workspaceId) return;
    const response = clarificationResponses[clarificationId]?.trim();
    if (!response) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await resolveQuoteClarification(
        propertyId,
        workspaceId,
        quoteId,
        clarificationId,
        response,
      );
      setClarificationResponses((current) => ({ ...current, [clarificationId]: '' }));
      await loadQuotes();
    } catch (clarificationError: any) {
      setError(clarificationError?.message || 'Unable to resolve this clarification.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const addCandidateToDecision = async (quote: QuoteCandidate) => {
    if (!workspaceId) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await createQuoteProposal(propertyId, workspaceId, {
        vendorName: quote.vendorName,
        quoteAmount: quote.quoteAmount,
        serviceCategory: quote.serviceCategory as ServicePriceRadarCheckSummary['serviceCategory'] | null,
        quoteDate: quote.createdAt,
        sourceType: quote.serviceRadarCheckId ? 'SYSTEM_LINKED' : 'MANUAL',
        sourceReferenceId: quote.serviceRadarCheckId,
      });
      await loadQuotes();
    } catch (candidateError: any) {
      setError(candidateError?.message || 'Unable to add this quote to the decision.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const chooseProposal = async (quoteId: string) => {
    if (!workspaceId) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      const workspace = await selectQuoteForDecision(propertyId, workspaceId, quoteId);
      setDecisionWorkspace(workspace);
      await loadQuotes();
    } catch (selectionError: any) {
      setError(selectionError?.message || 'Unable to select this proposal.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const beginNegotiation = async () => {
    const selected = decisionWorkspace?.selectedQuote;
    if (!workspaceId || !selected) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await createNegotiationShieldCase(propertyId, {
        scenarioType: 'CONTRACTOR_QUOTE_REVIEW',
        title: `Review ${selected.vendorName} proposal`,
        description: selected.serviceLabelRaw || 'Negotiation preparation for the selected service quote.',
        sourceType: 'MANUAL',
        quoteDecisionWorkspaceId: workspaceId,
        initialInput: {
          inputType: 'CONTRACTOR_QUOTE',
          structuredData: {
            vendorName: selected.vendorName,
            quoteAmount: Number(selected.quoteAmount),
            currency: selected.currency,
            serviceCategory: selected.serviceCategory,
            quoteComparisonWorkspaceId: workspaceId,
          },
        },
      });
      await loadQuotes();
    } catch (negotiationError: any) {
      setError(negotiationError?.message || 'Unable to start negotiation preparation.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const prepareFinalTerms = async () => {
    if (!workspaceId || !decisionWorkspace?.selectedQuote) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await createPriceFinalizationDraft(propertyId, {
        quoteComparisonWorkspaceId: workspaceId,
        sourceType: 'QUOTE_COMPARISON',
        guidanceJourneyId,
        guidanceStepKey,
        guidanceSignalIntentFamily,
      });
      await loadQuotes();
    } catch (finalizationError: any) {
      setError(finalizationError?.message || 'Unable to prepare final terms.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const closeDecision = async (outcome: 'DECLINED' | 'DEFERRED') => {
    if (!workspaceId) return;
    setJourneyActionPending(true);
    setError(null);
    try {
      await transitionServiceQuoteDecision(propertyId, workspaceId, {
        toStage: 'CLOSED',
        outcome,
        reason: outcome === 'DECLINED'
          ? 'The homeowner declined the current proposals.'
          : 'The homeowner deferred this service quote decision.',
      });
      await loadQuotes();
    } catch (closeError: any) {
      setError(closeError?.message || 'Unable to close this decision.');
    } finally {
      setJourneyActionPending(false);
    }
  };

  const outcomeMeasurementConsented = Boolean(
    decisionWorkspace?.outcomeMeasurementConsentedAt
    && !decisionWorkspace.outcomeMeasurementConsentRevokedAt,
  );

  const setOutcomeMeasurementConsent = async (consented: boolean) => {
    if (!workspaceId) return;
    setConsentPending(true);
    setError(null);
    try {
      const workspace = await updateServiceQuoteOutcomeConsent(
        propertyId,
        workspaceId,
        {
          consented,
          finalPrice: consented,
          changeOrders: consented,
          policyVersion: 'service-quote-outcomes-v1',
        },
      );
      setDecisionWorkspace(workspace);
    } catch (consentError: any) {
      setError(consentError?.message || 'Unable to update outcome-sharing consent.');
    } finally {
      setConsentPending(false);
    }
  };

  const backHref = isGuidanceContext
    ? buildGuidanceOverviewHref({
        propertyId,
        journeyId: guidanceJourneyId,
        stepKey: guidanceStepKey,
        inventoryItemId: itemId,
        issueType: searchParams.get('issueType'),
      })
    : `/dashboard/properties/${propertyId}`;
  const trust = pricingLoopTrust({
    confidenceLabel: 'Comparison is gated by scope completeness and homeowner confirmation',
    freshnessLabel: 'Updates as new Service Price Radar checks are created',
    sourceLabel: 'Saved proposals + quote-document extraction provenance + Service Price Radar history',
  });
  const decisionOpen = !decisionWorkspace || decisionWorkspace.outcome === 'OPEN';
  const proposalControlsLocked =
    !decisionOpen ||
    Boolean(
      decisionWorkspace &&
      ['FINALIZATION', 'BOOKING', 'SCHEDULED', 'COMPLETED', 'CLOSED'].includes(
        decisionWorkspace.journeyStage
      )
    );

  return (
    <>
    <CompareTemplate
      backHref={backHref}
      backLabel={isGuidanceContext ? 'Back to guidance' : 'Back to property'}
      title="Service Quote Decision"
      subtitle="Review, compare, negotiate, record final terms, and track booking in one decision."
      rail={<HomeToolsRail propertyId={propertyId} context="quote-comparison" currentToolId="quote-comparison" />}
      trust={trust}
      priorityAction={undefined}
      summary={
        <div className="space-y-3">
          <PropertyContextStatusNotice context={propertyContext} title="Quote comparison context" />
          {decisionWorkspace ? (
            <ScenarioInputCard
              title="Decision journey"
              subtitle="One workspace identity is preserved across every stage."
              badge={
                <StatusChip tone={decisionWorkspace.outcome === 'OPEN' ? 'info' : 'good'}>
                  {formatEnumLabel(decisionWorkspace.outcome)}
                </StatusChip>
              }
            >
              <div className="flex flex-wrap gap-2">
                {[
                  'QUOTE_INTAKE',
                  'PRICE_REVIEW',
                  'SCOPE_REVIEW',
                  'COMPARISON',
                  'NEGOTIATION',
                  'FINALIZATION',
                  'BOOKING',
                  'COMPLETED',
                  'CLOSED',
                ].map((stage) => (
                  <span
                    key={stage}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      decisionWorkspace.journeyStage === stage
                        ? 'border-black bg-black text-white'
                        : 'border-black/10 bg-white text-slate-500'
                    }`}
                  >
                    {formatEnumLabel(stage)}
                  </span>
                ))}
              </div>
              {decisionWorkspace.transitions?.length ? (
                <p className="mb-0 text-xs text-slate-500">
                  Latest: {decisionWorkspace.transitions.at(-1)?.reason || formatEnumLabel(decisionWorkspace.journeyStage)}
                </p>
              ) : null}
            </ScenarioInputCard>
          ) : null}
          {selectedQuotes[0] ? (
            <CapabilityDiscoveryAnchor
              anchor="QUOTE_ANALYSIS_RESULT"
              propertyId={propertyId}
              entityId={selectedQuotes[0].serviceRadarCheckId ?? selectedQuotes[0].id}
              journeyId={guidanceJourneyId || undefined}
            />
          ) : null}
          <ResultHeroCard
            eyebrow="Compare"
            title="Quote Decision Snapshot"
            value={selectedQuotes.length}
            status={
              <StatusChip tone={comparability?.status === 'COMPARABLE' ? 'good' : 'info'}>
                {comparability ? formatEnumLabel(comparability.status) : 'Checking readiness'}
              </StatusChip>
            }
            summary={
              comparability?.reasons[0] ??
              (comparisonSpread
                ? `Price spread: ${formatMoney(comparisonSpread.spread)}. Scope comparability is not established yet.`
                : 'Add at least two complete proposals and confirm extracted facts.')
            }
          />
        </div>
      }
      compareContent={
        <div className="space-y-4">
          {decisionWorkspace && (decisionWorkspace.transitions?.length ?? 0) > 1 ? (
            <div
              className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
              role="status"
            >
              <p className="mb-1 font-semibold">Welcome back to this quote decision</p>
              <p className="mb-0">
                Your proposals, questions, selected option, and linked next steps were saved.
                Continue at {formatEnumLabel(decisionWorkspace.journeyStage).toLowerCase()}.
              </p>
            </div>
          ) : null}

          {['INSURANCE', 'ATTORNEY', 'FINANCE'].includes(defaultCategory ?? '') ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
              This generic service-quote workflow does not evaluate regulated insurance, legal, or financial advice.
              Use the appropriate specialist workflow instead.
            </div>
          ) : null}

          {!decisionOpen ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" role="status">
              This decision is closed. Its proposals and evidence remain available as a read-only record.
            </div>
          ) : null}

          {decisionOpen ? (
          <ScenarioInputCard
            title="How would you like to start?"
            subtitle="Choose the path that matches what you have. You can add another proposal later."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <a href="#upload-quote" className="rounded-xl border border-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-black">
                <span className="block font-semibold">Upload a quote</span>
                <span className="mt-1 block text-xs text-slate-600">Use a PDF or photo when you have one. Extracted facts stay reviewable.</span>
              </a>
              <a href="#manual-quote" className="rounded-xl border border-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-black">
                <span className="block font-semibold">Enter a quote</span>
                <span className="mt-1 block text-xs text-slate-600">Record provider, price, scope, exclusions, warranty, and payment terms.</span>
              </a>
              <Link
                href={`/dashboard/properties/${propertyId}/tools/service-price-radar${contextQuery}`}
                className="rounded-xl border border-black/10 p-3 focus:outline-none focus:ring-2 focus:ring-black"
              >
                <span className="block font-semibold">Plan a budget</span>
                <span className="mt-1 block text-xs text-slate-600">Use a planning range when you do not have a provider quote yet.</span>
              </Link>
            </div>
          </ScenarioInputCard>
          ) : null}

          <ScenarioInputCard
            title="Candidate Quotes"
            subtitle="Select up to 3 proposals. Price is contextual only until scope and terms are comparison ready."
            badge={<StatusChip tone="info">{quotes.length} quotes</StatusChip>}
          >
            {loading ? (
              <p className="mb-0 text-sm text-slate-600">Loading quote candidates...</p>
            ) : quotes.length === 0 ? (
              <p className="mb-0 text-sm text-slate-600">
                No proposals are saved yet. Choose upload, manual entry, or budget planning above.
              </p>
            ) : (
              <div className="space-y-2.5">
                {quotes.map((quote) => {
                  const isSelected = selectedQuoteIds.includes(quote.id);
                  const disableSelection =
                    proposalControlsLocked ||
                    quote.decision === 'REJECTED' ||
                    (!isSelected && selectedQuoteIds.length >= 3);
                  const proposal = quote.proposal;
                  const evidence = proposal ? buildProposalEvidence(proposal) : [];
                  const knownFacts = proposal ? buildKnownFacts(proposal) : [];
                  const openClarifications = proposal?.clarifications?.filter(
                    (clarification) => clarification.status === 'OPEN'
                  ) ?? [];
                  return (
                    <article
                      key={quote.id}
                      className={`rounded-xl border p-3 ${
                        quote.decision === 'REJECTED' ? 'border-slate-200 bg-slate-50 opacity-80' : 'border-black/10'
                      }`}
                      aria-label={`${quote.vendorName} proposal`}
                    >
                      <CompactEntityRow
                        title={quote.vendorName}
                        subtitle={`${formatMoney(quote.quoteAmount, quote.currency)} · ${quote.sourceLabel}`}
                        meta={formatExpectedRange(quote)}
                        status={
                          <StatusChip tone={quote.readinessStage === 'COMPARISON_READY' ? 'good' : 'info'}>
                            {formatEnumLabel(quote.readinessStage)}
                          </StatusChip>
                        }
                        trailing={
                          <div className="flex flex-col gap-1">
                            <Button
                              type="button"
                              variant={isSelected ? 'default' : 'outline'}
                              className="min-h-[36px] px-3 text-xs"
                              onClick={() => toggleSelection(quote.id)}
                              disabled={disableSelection}
                            >
                              {isSelected ? 'Selected' : 'Select'}
                            </Button>
                            {quote.persisted && !quote.homeownerConfirmed ? (
                              <Button
                                type="button"
                              variant="outline"
                              className="min-h-[36px] px-3 text-xs"
                              disabled={proposalControlsLocked || journeyActionPending}
                              onClick={() => confirmExtractedQuote(quote.id)}
                              >
                                Review and confirm
                              </Button>
                            ) : null}
                            {!quote.persisted ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-[36px] px-3 text-xs"
                                disabled={proposalControlsLocked || journeyActionPending}
                                onClick={() => addCandidateToDecision(quote)}
                              >
                                Add to decision
                              </Button>
                            ) : null}
                            {quote.persisted &&
                            quote.decision !== 'REJECTED' &&
                            quote.readinessStage === 'COMPARISON_READY' &&
                            comparability?.status === 'COMPARABLE' ? (
                              <Button
                                type="button"
                                variant={decisionWorkspace?.selectedQuoteId === quote.id ? 'default' : 'outline'}
                                className="min-h-[36px] px-3 text-xs"
                                disabled={proposalControlsLocked || journeyActionPending}
                                onClick={() => chooseProposal(quote.id)}
                              >
                                {decisionWorkspace?.selectedQuoteId === quote.id ? 'Accepted for review' : 'Accept for final review'}
                              </Button>
                            ) : null}
                          </div>
                        }
                      />
                      {proposal ? (
                        <div className="mt-3 space-y-3 border-t border-black/5 pt-3">
                          {isProposalStale(proposal) ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900" role="status">
                              This quote may be stale or expired. Reconfirm the price and terms before accepting it.
                            </div>
                          ) : null}

                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-medium">Quote readiness</span>
                              <span>{proposal.readinessScore}%</span>
                            </div>
                            <Progress value={proposal.readinessScore} aria-label={`${proposal.vendorName} quote readiness`} />
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Evidence dimensions">
                            {evidence.map((dimension) => (
                              <div key={dimension.key} className="rounded-lg border border-black/10 p-2">
                                <p className="mb-0 text-[11px] font-medium uppercase tracking-wide text-slate-500">{dimension.label}</p>
                                <p className="mb-0 text-sm font-semibold">{dimension.value}</p>
                                <p className="mb-0 mt-1 text-xs text-slate-600">{dimension.detail}</p>
                              </div>
                            ))}
                          </div>

                          <div className="grid gap-3 md:grid-cols-3">
                            <section aria-labelledby={`known-${quote.id}`}>
                              <h3 id={`known-${quote.id}`} className="text-sm font-semibold">What we know</h3>
                              {knownFacts.length ? (
                                <ul className="mt-1 space-y-1 pl-4 text-xs text-slate-600">
                                  {knownFacts.map((fact) => <li key={fact}>{fact}</li>)}
                                </ul>
                              ) : (
                                <p className="mb-0 mt-1 text-xs text-slate-600">Only a planning amount is recorded.</p>
                              )}
                            </section>
                            <section aria-labelledby={`missing-${quote.id}`}>
                              <h3 id={`missing-${quote.id}`} className="text-sm font-semibold">What is missing</h3>
                              {quote.missingFacts.length ? (
                                <ul className="mt-1 space-y-1 pl-4 text-xs text-slate-600">
                                  {quote.missingFacts.map((fact) => <li key={fact.key}>{fact.label}</li>)}
                                </ul>
                              ) : (
                                <p className="mb-0 mt-1 text-xs text-slate-600">No required comparison facts are missing.</p>
                              )}
                            </section>
                            <section aria-labelledby={`why-${quote.id}`}>
                              <h3 id={`why-${quote.id}`} className="text-sm font-semibold">Why it matters</h3>
                              {quote.missingFacts.length ? (
                                <ul className="mt-1 space-y-1 pl-4 text-xs text-slate-600">
                                  {quote.missingFacts.map((fact) => <li key={fact.key}>{fact.whyItMatters}</li>)}
                                </ul>
                              ) : (
                                <p className="mb-0 mt-1 text-xs text-slate-600">Complete scope helps prevent a cheaper-looking quote from hiding omitted work.</p>
                              )}
                            </section>
                          </div>

                          {openClarifications.length ? (
                            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
                              <p className="mb-0 text-xs font-semibold text-blue-950">Open clarification questions</p>
                              {openClarifications.map((clarification) => (
                                <div key={clarification.id} className="space-y-1">
                                  <p className="mb-0 text-xs text-blue-900">{clarification.question}</p>
                                  <div className="flex flex-col gap-1 sm:flex-row">
                                    <input
                                      aria-label={`Answer: ${clarification.question}`}
                                      value={clarificationResponses[clarification.id] ?? ''}
                                      onChange={(event) => setClarificationResponses((current) => ({
                                        ...current,
                                        [clarification.id]: event.target.value,
                                      }))}
                                      placeholder="Record the provider's answer"
                                      className="h-9 flex-1 rounded-lg border border-blue-200 bg-white px-2 text-xs"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="min-h-[36px] text-xs"
                                      disabled={proposalControlsLocked || journeyActionPending || !(clarificationResponses[clarification.id]?.trim())}
                                      onClick={() => answerClarification(quote.id, clarification.id)}
                                    >
                                      Resolve
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="space-y-1">
                            <label htmlFor={`clarify-${quote.id}`} className="text-xs font-medium">
                              Ask for clarification
                            </label>
                            <div className="flex flex-col gap-1 sm:flex-row">
                              <Textarea
                                id={`clarify-${quote.id}`}
                                value={clarificationDrafts[quote.id] ?? ''}
                                onChange={(event) => setClarificationDrafts((current) => ({
                                  ...current,
                                  [quote.id]: event.target.value,
                                }))}
                                placeholder="Example: Does this include permits, disposal, and cleanup?"
                                className="min-h-[72px] flex-1 text-xs"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                disabled={proposalControlsLocked || journeyActionPending || !(clarificationDrafts[quote.id]?.trim())}
                                onClick={() => askForClarification(quote.id)}
                              >
                                Save question
                              </Button>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2" aria-label={`${proposal.vendorName} proposal controls`}>
                            <Button type="button" variant="outline" disabled={proposalControlsLocked || journeyActionPending} onClick={() => openQuoteEditor(proposal)}>
                              Edit facts
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={proposalControlsLocked || journeyActionPending}
                              onClick={() => changeDisposition(quote, quote.decision === 'REJECTED' ? 'UNDECIDED' : 'REJECTED')}
                            >
                              {quote.decision === 'REJECTED' ? 'Restore proposal' : 'Reject proposal'}
                            </Button>
                            <Button type="button" variant="outline" disabled={proposalControlsLocked || journeyActionPending} onClick={() => removeQuote(quote)}>
                              Delete proposal
                            </Button>
                          </div>
                        </div>
                      ) : quote.missingFacts.length > 0 ? (
                        <p className="mb-0 mt-2 text-xs text-slate-500">
                          Needed next: {quote.missingFacts.slice(0, 3).map((fact) => fact.label).join(', ')}
                        </p>
                      ) : null}
                    </article>
                  );
                })}
                {selectedQuoteIds.length >= 3 ? (
                  <p className="mb-0 text-xs text-slate-500">
                    Max 3 quotes selected. Deselect one to add another.
                  </p>
                ) : null}
              </div>
            )}
          </ScenarioInputCard>

          {decisionWorkspace?.selectedQuote ? (
            <ScenarioInputCard
              title="Continue this decision"
              subtitle={`${decisionWorkspace.selectedQuote.vendorName} is selected. Each next stage remains linked to workspace ${decisionWorkspace.id.slice(0, 8)}.`}
              badge={<StatusChip tone="good">{formatEnumLabel(decisionWorkspace.journeyStage)}</StatusChip>}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={journeyActionPending || Boolean(decisionWorkspace.negotiationCase)}
                  onClick={beginNegotiation}
                >
                  {decisionWorkspace.negotiationCase ? 'Negotiation linked' : 'Prepare negotiation'}
                </Button>
                <Button
                  type="button"
                  disabled={journeyActionPending || Boolean(decisionWorkspace.priceFinalization)}
                  onClick={prepareFinalTerms}
                >
                  {decisionWorkspace.priceFinalization ? 'Final terms linked' : 'Prepare final terms'}
                </Button>
              </div>
              {decisionWorkspace.negotiationCase ? (
                <p className="mb-0 text-xs text-slate-600">
                  Negotiation: {decisionWorkspace.negotiationCase.title} · {formatEnumLabel(decisionWorkspace.negotiationCase.status)}
                </p>
              ) : null}
              {decisionWorkspace.priceFinalization ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span>
                    Final terms: {formatEnumLabel(decisionWorkspace.priceFinalization.status)}
                  </span>
                  <Link
                    href={`/dashboard/properties/${propertyId}/tools/price-finalization?quoteComparisonWorkspaceId=${workspaceId}&priceFinalizationId=${decisionWorkspace.priceFinalization.id}`}
                    className="font-medium underline"
                  >
                    Review linked terms
                  </Link>
                </div>
              ) : null}
              {decisionWorkspace.booking ? (
                <p className="mb-0 text-xs text-slate-600">
                  Booking {decisionWorkspace.booking.bookingNumber}: {formatEnumLabel(decisionWorkspace.booking.status)}
                </p>
              ) : null}
            </ScenarioInputCard>
          ) : null}

          {decisionOpen ? (
          <>
          <div id="upload-quote" className="scroll-mt-24">
          <ScenarioInputCard
            title="Upload a Quote Document"
            subtitle="Analyze a PDF or image, keep extraction provenance, then confirm the extracted facts."
          >
            <label className="inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5">
              {uploadingQuote ? 'Analyzing quote…' : 'Choose quote document'}
              <input
                type="file"
                accept=".pdf,image/*"
                className="sr-only"
                disabled={uploadingQuote || !workspaceId}
                onChange={uploadQuoteDocument}
              />
            </label>
          </ScenarioInputCard>
          </div>

          <div id="manual-quote" className="scroll-mt-24">
          <ScenarioInputCard
            title="Add Quote Manually"
            subtitle="Vendor and total create an incomplete proposal. Add scope and terms before comparison."
            actions={
              <ActionPriorityRow
                primaryAction={
                  <Button type="button" onClick={addManualQuote} disabled={savingQuote}>
                    {savingQuote ? 'Saving…' : 'Add manual quote'}
                  </Button>
                }
              />
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Vendor name</span>
                <input
                  value={manualVendorName}
                  onChange={(event) => setManualVendorName(event.target.value)}
                  placeholder="Example HVAC Co."
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Work type</span>
                <select
                  value={manualScopeKind}
                  onChange={(event) => setManualScopeKind(event.target.value as typeof manualScopeKind)}
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                >
                  <option value="UNKNOWN">Choose work type</option>
                  <option value="REPAIR">Repair</option>
                  <option value="REPLACEMENT">Replacement</option>
                  <option value="INSTALLATION">Installation</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="INSPECTION">Inspection</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Service location</span>
                <input
                  value={manualServiceLocation}
                  onChange={(event) => setManualServiceLocation(event.target.value)}
                  placeholder="Attic, kitchen, exterior…"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Scope summary</span>
                <input
                  value={manualScopeSummary}
                  onChange={(event) => setManualScopeSummary(event.target.value)}
                  placeholder="What work will the provider perform?"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Primary line item</span>
                <input
                  value={manualLineItem}
                  onChange={(event) => setManualLineItem(event.target.value)}
                  placeholder="Example: Replace 3-ton attic air handler"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Included work</span>
                <input
                  value={manualInclusions}
                  onChange={(event) => setManualInclusions(event.target.value)}
                  placeholder="Equipment, labor, cleanup…"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Excluded work</span>
                <input
                  value={manualExclusions}
                  onChange={(event) => setManualExclusions(event.target.value)}
                  placeholder="Permits, electrical upgrades…"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Warranty</span>
                <input
                  value={manualWarranty}
                  onChange={(event) => setManualWarranty(event.target.value)}
                  placeholder="Parts and labor coverage"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Payment terms</span>
                <input
                  value={manualPayment}
                  onChange={(event) => setManualPayment(event.target.value)}
                  placeholder="Deposit and balance timing"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Quote amount (USD)</span>
                <input
                  value={manualQuoteAmount}
                  onChange={(event) => setManualQuoteAmount(event.target.value)}
                  placeholder="2450.00"
                  inputMode="decimal"
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm"
                />
              </label>
            </div>
            {manualInputError ? (
              <p className="mb-0 text-xs text-rose-600">{manualInputError}</p>
            ) : null}
          </ScenarioInputCard>
          </div>
          </>
          ) : null}

          <ScenarioInputCard
            title="Your data and privacy"
            subtitle="You control the proposals and questions stored in this decision."
          >
            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
              <p className="mb-0"><strong className="text-slate-900">Saved:</strong> quote facts, uploaded-document links, confirmations, questions, and decision history.</p>
              <p className="mb-0"><strong className="text-slate-900">Not assumed:</strong> manual or extracted facts are not treated as verified market evidence.</p>
              <p className="mb-0"><strong className="text-slate-900">Your controls:</strong> edit, delete, reject, restore, defer, or close before final terms lock the proposal.</p>
            </div>
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={outcomeMeasurementConsented}
                disabled={consentPending || !workspaceId}
                onChange={(event) => void setOutcomeMeasurementConsent(event.target.checked)}
              />
              <span>
                <strong className="block text-slate-900">Help improve future price guidance</strong>
                Voluntarily share the final price and material change-order totals after completed work.
                Estimates, contractor notes, and quote text are never included. You can turn this off at any
                time to stop future capture; this choice does not affect recommendations or booking.
                {consentPending ? <span className="mt-1 block text-xs">Saving your choice…</span> : null}
              </span>
            </label>
          </ScenarioInputCard>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}

          <ActionPriorityRow
            secondaryActions={
              <div className="flex w-full flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={loadQuotes}>
                  Refresh quotes
                </Button>
                <Link
                  href={`/dashboard/properties/${propertyId}/tools/service-price-radar${contextQuery}`}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-black/10 px-3 text-sm hover:bg-black/5"
                >
                  Check another quote
                </Link>
                {decisionWorkspace?.outcome === 'OPEN' ? (
                  <>
                    <Button type="button" variant="outline" disabled={journeyActionPending} onClick={() => closeDecision('DEFERRED')}>
                      Defer decision
                    </Button>
                    <Button type="button" variant="outline" disabled={journeyActionPending} onClick={() => closeDecision('DECLINED')}>
                      Decline proposals
                    </Button>
                  </>
                ) : null}
              </div>
            }
          />
        </div>
      }
      footer={null}
    />
    <Dialog
      open={Boolean(editingQuote)}
      onOpenChange={(open) => {
        if (!open) {
          setEditingQuote(null);
          setEditForm(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit quote facts</DialogTitle>
          <DialogDescription>
            Changes invalidate prior confirmation and comparison readiness so the updated facts can be reviewed again.
          </DialogDescription>
        </DialogHeader>
        {editForm ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Provider name</span>
              <input
                autoFocus
                value={editForm.vendorName}
                onChange={(event) => setEditForm({ ...editForm, vendorName: event.target.value })}
                className="h-10 w-full rounded-lg border border-black/10 px-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Quote total</span>
              <input
                inputMode="decimal"
                value={editForm.quoteAmount}
                onChange={(event) => setEditForm({ ...editForm, quoteAmount: event.target.value })}
                className="h-10 w-full rounded-lg border border-black/10 px-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Quote date</span>
              <input
                type="date"
                value={editForm.quoteDate}
                onChange={(event) => setEditForm({ ...editForm, quoteDate: event.target.value })}
                className="h-10 w-full rounded-lg border border-black/10 px-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Expiration date</span>
              <input
                type="date"
                value={editForm.expirationDate}
                onChange={(event) => setEditForm({ ...editForm, expirationDate: event.target.value })}
                className="h-10 w-full rounded-lg border border-black/10 px-3"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Work type</span>
              <select
                value={editForm.scopeKind}
                onChange={(event) => setEditForm({ ...editForm, scopeKind: event.target.value as QuoteProposalSummary['scopeKind'] })}
                className="h-10 w-full rounded-lg border border-black/10 bg-white px-3"
              >
                {['UNKNOWN', 'REPAIR', 'REPLACEMENT', 'INSTALLATION', 'MAINTENANCE', 'INSPECTION', 'OTHER'].map((kind) => (
                  <option key={kind} value={kind}>{formatEnumLabel(kind)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Service location</span>
              <input
                value={editForm.serviceLocation}
                onChange={(event) => setEditForm({ ...editForm, serviceLocation: event.target.value })}
                className="h-10 w-full rounded-lg border border-black/10 px-3"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Scope summary</span>
              <Textarea
                value={editForm.scopeSummary}
                onChange={(event) => setEditForm({ ...editForm, scopeSummary: event.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Notes</span>
              <Textarea
                value={editForm.notes}
                onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { setEditingQuote(null); setEditForm(null); }}>
            Cancel
          </Button>
          <Button type="button" disabled={proposalControlsLocked || journeyActionPending} onClick={saveQuoteEdits}>
            {journeyActionPending ? 'Saving…' : 'Save and re-check'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
