'use client';

import { useEffect, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileCheck2,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  compareRefinanceLoanEstimates,
  deleteSavedRefinanceLoanEstimateComparison,
  exportLoanEstimateComparisonMarkdown,
  exportLoanEstimateHandoffMarkdown,
  extractRefinanceLoanEstimate,
  getSavedRefinanceLoanEstimateComparisons,
  saveRefinanceLoanEstimateComparison,
  type LoanEstimateMetric,
  type RefinanceLoanEstimateComparison,
  type RefinanceLoanEstimateInput,
  type RefinanceLoanEstimateExtraction,
  type SavedRefinanceLoanEstimateComparison,
} from './mortgageRefinanceRadarApi';

type OfferDraft = {
  id: string;
  lenderName: string;
  loanAmountUsd: string;
  loanTermYears: string;
  loanType: RefinanceLoanEstimateInput['loanType'];
  noteRatePct: string;
  aprPct: string;
  monthlyPrincipalAndInterestUsd: string;
  loanCostsUsd: string;
  lenderCreditsUsd: string;
  discountPointsPct: string;
  discountPointsUsd: string;
  cashToCloseUsd: string;
  fiveYearTotalPaidUsd: string;
  fiveYearPrincipalPaidUsd: string;
  issuedDate: string;
  rateLockStatus: NonNullable<
    RefinanceLoanEstimateInput['rateLockStatus']
  >;
  rateLockExpirationDate: string;
};

const METRIC_LABELS: Record<LoanEstimateMetric, string> = {
  APR: 'Lowest APR',
  MONTHLY_PRINCIPAL_AND_INTEREST: 'Lowest P&I',
  NET_LOAN_COSTS: 'Lowest net costs',
  CASH_TO_CLOSE: 'Lowest cash to close',
  FIVE_YEAR_BORROWING_COST: 'Lowest 5-year cost',
};

let nextOfferNumber = 3;

function blankOffer(number: number): OfferDraft {
  return {
    id: `draft-${Date.now()}-${number}`,
    lenderName: '',
    loanAmountUsd: '',
    loanTermYears: '30',
    loanType: 'FIXED',
    noteRatePct: '',
    aprPct: '',
    monthlyPrincipalAndInterestUsd: '',
    loanCostsUsd: '',
    lenderCreditsUsd: '',
    discountPointsPct: '',
    discountPointsUsd: '',
    cashToCloseUsd: '',
    fiveYearTotalPaidUsd: '',
    fiveYearPrincipalPaidUsd: '',
    issuedDate: '',
    rateLockStatus: 'UNKNOWN',
    rateLockExpirationDate: '',
  };
}

function toDraft(offer: RefinanceLoanEstimateInput): OfferDraft {
  return {
    id: offer.id,
    lenderName: offer.lenderName,
    loanAmountUsd: String(offer.loanAmountUsd),
    loanTermYears: String(offer.loanTermYears),
    loanType: offer.loanType,
    noteRatePct: String(offer.noteRatePct),
    aprPct: String(offer.aprPct),
    monthlyPrincipalAndInterestUsd: String(
      offer.monthlyPrincipalAndInterestUsd,
    ),
    loanCostsUsd: String(offer.loanCostsUsd),
    lenderCreditsUsd: String(offer.lenderCreditsUsd),
    discountPointsPct:
      offer.discountPointsPct == null ? '' : String(offer.discountPointsPct),
    discountPointsUsd:
      offer.discountPointsUsd == null ? '' : String(offer.discountPointsUsd),
    cashToCloseUsd: String(offer.cashToCloseUsd),
    fiveYearTotalPaidUsd:
      offer.fiveYearTotalPaidUsd == null
        ? ''
        : String(offer.fiveYearTotalPaidUsd),
    fiveYearPrincipalPaidUsd:
      offer.fiveYearPrincipalPaidUsd == null
        ? ''
        : String(offer.fiveYearPrincipalPaidUsd),
    issuedDate: offer.issuedDate ?? '',
    rateLockStatus: offer.rateLockStatus ?? 'UNKNOWN',
    rateLockExpirationDate: offer.rateLockExpirationDate ?? '',
  };
}

function currency(value: number | null): string {
  if (value == null) return 'Add page 3 values';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function lockLabel(offer: RefinanceLoanEstimateInput): string {
  if (offer.rateLockStatus === 'LOCKED') {
    return offer.rateLockExpirationDate
      ? `Locked through ${offer.rateLockExpirationDate}`
      : 'Locked; expiration missing';
  }
  if (offer.rateLockStatus === 'NOT_LOCKED') return 'Not locked';
  return 'Lock status unknown';
}

function numberValue(value: string, label: string): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) {
    throw new Error(`${label} is required for every offer.`);
  }
  return parsed;
}

function optionalNumberValue(value: string, label: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return parsed;
}

function toInput(offer: OfferDraft): RefinanceLoanEstimateInput {
  const fiveYearTotal = offer.fiveYearTotalPaidUsd.trim();
  const fiveYearPrincipal = offer.fiveYearPrincipalPaidUsd.trim();
  const discountPointsPct = optionalNumberValue(
    offer.discountPointsPct,
    'Discount points percentage',
  );
  const discountPointsUsd = optionalNumberValue(
    offer.discountPointsUsd,
    'Discount points amount',
  );
  if (Boolean(fiveYearTotal) !== Boolean(fiveYearPrincipal)) {
    throw new Error(
      `Enter both page 3 five-year values for ${offer.lenderName || 'each lender'}, or leave both blank.`,
    );
  }
  return {
    id: offer.id,
    lenderName: offer.lenderName.trim() || 'Unnamed lender',
    loanAmountUsd: numberValue(offer.loanAmountUsd, 'Loan amount'),
    loanTermYears: numberValue(offer.loanTermYears, 'Loan term'),
    loanType: offer.loanType,
    noteRatePct: numberValue(offer.noteRatePct, 'Note rate'),
    aprPct: numberValue(offer.aprPct, 'APR'),
    monthlyPrincipalAndInterestUsd: numberValue(
      offer.monthlyPrincipalAndInterestUsd,
      'Monthly principal and interest',
    ),
    loanCostsUsd: numberValue(offer.loanCostsUsd, 'Loan costs'),
    lenderCreditsUsd: numberValue(offer.lenderCreditsUsd, 'Lender credits'),
    ...(discountPointsPct != null ? { discountPointsPct } : {}),
    ...(discountPointsUsd != null ? { discountPointsUsd } : {}),
    cashToCloseUsd: numberValue(offer.cashToCloseUsd, 'Cash to close'),
    ...(fiveYearTotal
      ? {
          fiveYearTotalPaidUsd: Number(fiveYearTotal),
          fiveYearPrincipalPaidUsd: Number(fiveYearPrincipal),
        }
      : {}),
    ...(offer.issuedDate ? { issuedDate: offer.issuedDate } : {}),
    rateLockStatus: offer.rateLockStatus,
    ...(offer.rateLockStatus === 'LOCKED' && offer.rateLockExpirationDate
      ? { rateLockExpirationDate: offer.rateLockExpirationDate }
      : {}),
  };
}

function OfferFields({
  offer,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  offer: OfferDraft;
  index: number;
  canRemove: boolean;
  onChange: (next: OfferDraft) => void;
  onRemove: () => void;
}) {
  const set = (field: keyof OfferDraft, value: string) =>
    onChange({ ...offer, [field]: value });
  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
  return (
    <fieldset className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700/80">
      <legend className="px-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
        Offer {index + 1}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Lender label
          <input
            value={offer.lenderName}
            onChange={(event) => set('lenderName', event.target.value)}
            placeholder="e.g. Local credit union"
            className={inputClass}
          />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Loan type
          <select
            value={offer.loanType}
            onChange={(event) => set('loanType', event.target.value)}
            className={inputClass}
          >
            <option value="FIXED">Fixed</option>
            <option value="ARM">ARM</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Term (years)
          <input
            type="number"
            min="5"
            max="50"
            value={offer.loanTermYears}
            onChange={(event) => set('loanTermYears', event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Date issued
          <input
            type="date"
            value={offer.issuedDate}
            onChange={(event) => set('issuedDate', event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Rate-lock status
          <select
            value={offer.rateLockStatus}
            onChange={(event) => {
              const rateLockStatus = event.target
                .value as OfferDraft['rateLockStatus'];
              onChange({
                ...offer,
                rateLockStatus,
                rateLockExpirationDate:
                  rateLockStatus === 'LOCKED'
                    ? offer.rateLockExpirationDate
                    : '',
              });
            }}
            className={inputClass}
          >
            <option value="UNKNOWN">Confirm with lender</option>
            <option value="NOT_LOCKED">Not locked</option>
            <option value="LOCKED">Locked</option>
          </select>
        </label>
        <label className="text-xs text-slate-600 dark:text-slate-300">
          Lock expiration
          <input
            type="date"
            value={offer.rateLockExpirationDate}
            disabled={offer.rateLockStatus !== 'LOCKED'}
            onChange={(event) =>
              set('rateLockExpirationDate', event.target.value)
            }
            className={inputClass}
          />
        </label>
        {[
          ['loanAmountUsd', 'Loan amount ($)'],
          ['noteRatePct', 'Note rate (%)'],
          ['aprPct', 'APR (%)'],
          ['monthlyPrincipalAndInterestUsd', 'Monthly P&I ($)'],
          ['loanCostsUsd', 'Loan costs ($)'],
          ['lenderCreditsUsd', 'Lender credits ($)'],
          ['discountPointsPct', 'Discount points (%)'],
          ['discountPointsUsd', 'Discount points ($)'],
          ['cashToCloseUsd', 'Cash to close ($)'],
          ['fiveYearTotalPaidUsd', 'In 5 years — total paid ($)'],
          ['fiveYearPrincipalPaidUsd', 'In 5 years — principal paid ($)'],
        ].map(([field, label]) => (
          <label
            key={field}
            className="text-xs text-slate-600 dark:text-slate-300"
          >
            {label}
            <input
              type="number"
              min="0"
              step={field.includes('Pct') ? '0.001' : '1'}
              value={offer[field as keyof OfferDraft]}
              onChange={(event) =>
                set(field as keyof OfferDraft, event.target.value)
              }
              className={inputClass}
            />
          </label>
        ))}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Remove offer
        </button>
      )}
    </fieldset>
  );
}

export function LoanEstimateComparisonCard({
  propertyId,
}: {
  propertyId: string;
}) {
  const [offers, setOffers] = useState<OfferDraft[]>([
    blankOffer(1),
    blankOffer(2),
  ]);
  const [comparison, setComparison] =
    useState<RefinanceLoanEstimateComparison | null>(null);
  const [savedComparisons, setSavedComparisons] = useState<
    SavedRefinanceLoanEstimateComparison[]
  >([]);
  const [saveLabel, setSaveLabel] = useState('');
  const [extraction, setExtraction] =
    useState<RefinanceLoanEstimateExtraction | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [handoffExporting, setHandoffExporting] = useState(false);
  const [handoffOfferId, setHandoffOfferId] = useState('');
  const [handoffChecks, setHandoffChecks] = useState({
    figuresVerified: false,
    sameLoanRequestConfirmed: false,
    manualSharingUnderstood: false,
  });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSavedRefinanceLoanEstimateComparisons(propertyId)
      .then((items) => {
        if (active) setSavedComparisons(items);
      })
      .catch(() => {
        if (active) {
          setMessage('Saved Loan Estimate comparisons could not be loaded.');
        }
      });
    return () => {
      active = false;
    };
  }, [propertyId]);

  async function compare() {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const nextComparison = await compareRefinanceLoanEstimates(
        propertyId,
        offers.map(toInput),
      );
      setComparison(nextComparison);
      setHandoffOfferId('');
      setHandoffChecks({
        figuresVerified: false,
        sameLoanRequestConfirmed: false,
        manualSharingUnderstood: false,
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Loan Estimates could not be compared.',
      );
    } finally {
      setRunning(false);
    }
  }

  async function extractDocuments(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (files.length > 3) {
      setError('Upload one PDF or up to three image pages.');
      return;
    }
    const acceptedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
    ];
    if (files.some((file) => !acceptedTypes.includes(file.type))) {
      setError('Choose PDF, JPEG, PNG, or WEBP Loan Estimate pages.');
      return;
    }
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      setError('Each Loan Estimate file must be 10 MB or smaller.');
      return;
    }
    if (
      files.some((file) => file.type === 'application/pdf') &&
      files.length > 1
    ) {
      setError('Upload one PDF or up to three image pages, not a mixed batch.');
      return;
    }
    setExtracting(true);
    setError(null);
    setMessage(null);
    setUploadedFileName(files.map((file) => file.name).join(' · '));
    try {
      setExtraction(await extractRefinanceLoanEstimate(propertyId, files));
    } catch (caught) {
      setExtraction(null);
      setError(
        caught instanceof Error
          ? caught.message
          : 'The Loan Estimate could not be read.',
      );
    } finally {
      setExtracting(false);
    }
  }

  function applyExtraction() {
    if (!extraction) return;
    const fields = extraction.fields;
    const targetIndex = offers.findIndex(
      (offer) =>
        !offer.noteRatePct &&
        !offer.aprPct &&
        !offer.monthlyPrincipalAndInterestUsd,
    );
    const base =
      targetIndex >= 0
        ? offers[targetIndex]
        : offers.length < 4
          ? blankOffer(nextOfferNumber++)
          : null;
    if (!base) {
      setError(
        'The comparison already has four offers. Remove one before applying this extraction.',
      );
      return;
    }
    const value = (field: { value: unknown }) =>
      field.value == null ? '' : String(field.value);
    const reviewedDraft: OfferDraft = {
      ...base,
      loanAmountUsd: value(fields.loanAmountUsd),
      loanTermYears:
        fields.loanTermYears.value == null
          ? base.loanTermYears
          : value(fields.loanTermYears),
      loanType: fields.loanType.value ?? base.loanType,
      noteRatePct: value(fields.noteRatePct),
      aprPct: value(fields.aprPct),
      monthlyPrincipalAndInterestUsd: value(
        fields.monthlyPrincipalAndInterestUsd,
      ),
      loanCostsUsd: value(fields.loanCostsUsd),
      lenderCreditsUsd: value(fields.lenderCreditsUsd),
      discountPointsPct: value(fields.discountPointsPct),
      discountPointsUsd: value(fields.discountPointsUsd),
      cashToCloseUsd: value(fields.cashToCloseUsd),
      fiveYearTotalPaidUsd: value(fields.fiveYearTotalPaidUsd),
      fiveYearPrincipalPaidUsd: value(fields.fiveYearPrincipalPaidUsd),
      issuedDate:
        fields.issuedDate.value == null
          ? base.issuedDate
          : value(fields.issuedDate),
    };
    setOffers((current) =>
      targetIndex >= 0
        ? current.map((offer, index) =>
            index === targetIndex ? reviewedDraft : offer,
          )
        : [...current, reviewedDraft],
    );
    setComparison(null);
    setMessage(
      'Extracted values were added to an editable offer. Review every field against the PDF before comparing.',
    );
  }

  async function saveComparison() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveRefinanceLoanEstimateComparison(propertyId, {
        ...(saveLabel.trim() ? { label: saveLabel.trim() } : {}),
        offers: offers.map(toInput),
      });
      setSavedComparisons((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setSaveLabel('');
      setMessage('Comparison saved for this property.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The comparison could not be saved.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function exportMarkdown() {
    setExporting(true);
    setError(null);
    setMessage(null);
    try {
      const exported = await exportLoanEstimateComparisonMarkdown(
        propertyId,
        offers.map(toInput),
      );
      const url = URL.createObjectURL(
        new Blob([exported.markdown], {
          type: 'text/markdown;charset=utf-8',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage('Markdown comparison exported.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The Markdown comparison could not be exported.',
      );
    } finally {
      setExporting(false);
    }
  }

  async function exportHandoffMarkdown() {
    if (
      !handoffOfferId ||
      !handoffChecks.figuresVerified ||
      !handoffChecks.sameLoanRequestConfirmed ||
      !handoffChecks.manualSharingUnderstood
    ) {
      setError(
        'Select one lender and complete all homeowner confirmations before downloading.',
      );
      return;
    }
    setHandoffExporting(true);
    setError(null);
    setMessage(null);
    try {
      const exported = await exportLoanEstimateHandoffMarkdown(propertyId, {
        offers: offers.map(toInput),
        selectedOfferId: handoffOfferId,
        acknowledgements: {
          figuresVerified: true,
          sameLoanRequestConfirmed: true,
          manualSharingUnderstood: true,
        },
      });
      const url = URL.createObjectURL(
        new Blob([exported.markdown], {
          type: 'text/markdown;charset=utf-8',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage('Lender discussion brief downloaded. Nothing was sent.');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The lender discussion brief could not be downloaded.',
      );
    } finally {
      setHandoffExporting(false);
    }
  }

  function loadSaved(item: SavedRefinanceLoanEstimateComparison) {
    setOffers(item.offers.map(toDraft));
    setComparison(item.comparison);
    setSaveLabel(item.label ?? '');
    setHandoffOfferId('');
    setHandoffChecks({
      figuresVerified: false,
      sameLoanRequestConfirmed: false,
      manualSharingUnderstood: false,
    });
    setError(null);
    setMessage(`Loaded ${item.label ?? 'saved comparison'}.`);
  }

  async function deleteSaved(item: SavedRefinanceLoanEstimateComparison) {
    setDeletingId(item.id);
    setError(null);
    setMessage(null);
    try {
      await deleteSavedRefinanceLoanEstimateComparison(propertyId, item.id);
      setSavedComparisons((current) =>
        current.filter((comparison) => comparison.id !== item.id),
      );
      setPendingDeleteId(null);
      setMessage(`${item.label ?? 'Saved comparison'} was permanently deleted.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The saved comparison could not be deleted.',
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/60">
      <div className="space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <FileSpreadsheet
              className="h-4 w-4 text-blue-600"
              aria-hidden="true"
            />
            Compare official Loan Estimates
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Copy the same fields from each lender&apos;s standardized form. Values
            stay in this comparison and are not saved.
          </p>
        </div>

        <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Prefill from a Loan Estimate
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                Upload one PDF or up to three JPEG, PNG, or WEBP images in page
                order. Files are read in memory and not retained. Scanned PDFs
                and images use local OCR, and every value requires your review.
              </p>
            </div>
            <label className="inline-flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300">
              {extracting ? 'Reading document…' : 'Choose PDF or page images'}
              <input
                type="file"
                accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
                multiple
                disabled={extracting}
                className="sr-only"
                onChange={(event) => {
                  void extractDocuments(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </div>

          {extraction && (
            <div className="mt-3 space-y-3 border-t border-blue-200/70 pt-3 dark:border-blue-900/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                {uploadedFileName} — {extraction.requiredFieldsFound}/
                {extraction.requiredFieldCount} required fields found
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Method:{' '}
                {extraction.extractionMethod !== 'PDF_TEXT'
                  ? `${
                      extraction.extractionMethod === 'PDF_OCR'
                        ? 'Scanned PDF OCR'
                        : 'Image OCR'
                    }${
                      extraction.documentConfidencePct == null
                        ? ''
                        : ` · document confidence ${extraction.documentConfidencePct.toFixed(0)}%`
                    }`
                  : 'PDF text layer'}
                {' · '}
                {extraction.pageCount}{' '}
                {extraction.pageCount === 1 ? 'page' : 'pages'}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                Page check:{' '}
                <span className="font-semibold">
                  {extraction.pageIntegrity
                    ? extraction.pageIntegrity.status
                        .toLowerCase()
                        .replaceAll('_', ' ')
                    : 'unavailable'}
                </span>
                {extraction.pageIntegrity &&
                extraction.pageIntegrity.detectedPages.length > 0
                  ? ` · detected ${extraction.pageIntegrity.detectedPages.join(', ')}`
                  : extraction.pageIntegrity
                    ? ' · no standard page number verified'
                    : ''}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {Object.entries(extraction.fields).map(([key, field]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-2.5 py-2 text-[11px] dark:bg-slate-900/60"
                  >
                    <span className="text-slate-600 dark:text-slate-300">
                      {field.sourceLabel}
                    </span>
                    <span
                      className={
                        field.confidence === 'HIGH'
                          ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                          : field.confidence === 'MEDIUM'
                            ? 'font-semibold text-amber-700 dark:text-amber-300'
                            : 'font-semibold text-slate-500'
                      }
                    >
                      {field.value == null ? 'Not found' : String(field.value)}
                      {' · '}
                      {field.confidence}
                    </span>
                  </div>
                ))}
              </div>
              <ul className="space-y-1 text-[11px] text-amber-800 dark:text-amber-300">
                {extraction.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={applyExtraction}
                className="inline-flex min-h-[38px] items-center rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Apply to editable offer
              </button>
            </div>
          )}
        </div>

        {offers.map((offer, index) => (
          <OfferFields
            key={offer.id}
            offer={offer}
            index={index}
            canRemove={offers.length > 2}
            onChange={(next) => {
              setOffers((current) =>
                current.map((item) =>
                  item.id === offer.id ? next : item,
                ),
              );
              setComparison(null);
            }}
            onRemove={() => {
              setOffers((current) =>
                current.filter((item) => item.id !== offer.id),
              );
              setComparison(null);
            }}
          />
        ))}

        <div className="flex flex-wrap gap-2">
          {offers.length < 4 && (
            <button
              type="button"
              onClick={() => {
                setOffers((current) => [
                  ...current,
                  blankOffer(nextOfferNumber++),
                ]);
                setComparison(null);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add offer
            </button>
          )}
          <button
            type="button"
            onClick={compare}
            disabled={running}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running && (
              <RefreshCw
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            )}
            Compare offers
          </button>
        </div>

        {error && (
          <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-xs text-slate-600 dark:text-slate-300">
            {message}
          </p>
        )}

        {comparison && (
          <div className="space-y-3 border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <div className="overflow-x-auto">
              <table
                className="min-w-[1080px] w-full text-left text-xs"
                aria-label="Official Loan Estimate comparison"
              >
                <thead className="text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="pb-2">Lender</th>
                    <th className="pb-2">Issued / lock</th>
                    <th className="pb-2">Loan amount</th>
                    <th className="pb-2">Rate / APR</th>
                    <th className="pb-2">Monthly P&I</th>
                    <th className="pb-2">Net loan costs</th>
                    <th className="pb-2">Cash to close</th>
                    <th className="pb-2">5-year cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
                  {comparison.offers.map((offer) => (
                    <tr key={offer.id}>
                      <th className="py-3 pr-3 font-semibold">
                        {offer.lenderName}
                        <span className="block font-normal text-slate-500">
                          {offer.loanTermYears}-year {offer.loanType.toLowerCase()}
                        </span>
                      </th>
                      <td className="py-3 pr-3">
                        {offer.issuedDate ?? 'Issue date missing'}
                        <span className="block text-slate-500">
                          {lockLabel(offer)}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.loanAmountUsd)}
                      </td>
                      <td className="py-3 pr-3">
                        {offer.noteRatePct.toFixed(3)}% / {offer.aprPct.toFixed(3)}%
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.monthlyPrincipalAndInterestUsd)}
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.netLoanCostsUsd)}
                        {(offer.discountPointsUsd != null ||
                          offer.discountPointsPct != null) && (
                          <span className="block text-slate-500">
                            Points:{' '}
                            {offer.discountPointsPct != null
                              ? `${offer.discountPointsPct.toFixed(3)}%`
                              : 'percentage missing'}
                            {' / '}
                            {offer.discountPointsUsd != null
                              ? currency(offer.discountPointsUsd)
                              : 'amount missing'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {currency(offer.cashToCloseUsd)}
                      </td>
                      <td className="py-3">
                        {currency(offer.fiveYearBorrowingCostUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {comparison.offers.flatMap((offer) =>
                offer.bestMetrics.map((metric) => (
                  <span
                    key={`${offer.id}-${metric}`}
                    className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  >
                    {offer.lenderName}: {METRIC_LABELS[metric]}
                  </span>
                )),
              )}
            </div>
            {comparison.costTradeoffs.length > 0 && (
              <div className="rounded-xl border border-violet-200/80 bg-violet-50/50 p-3 dark:border-violet-900/60 dark:bg-violet-950/20">
                <h4 className="text-xs font-semibold text-violet-900 dark:text-violet-200">
                  Upfront cost versus monthly payment
                </h4>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  For offers with the same loan amount, product, and term,
                  this shows how long the lower payment takes to recover
                  additional net loan costs. Taxes, insurance, escrow, and
                  future refinancing are not included.
                </p>
                <ul className="mt-2 space-y-2">
                  {comparison.costTradeoffs.map((tradeoff) => (
                    <li
                      key={`${tradeoff.baselineOfferId}-${tradeoff.premiumOfferId}`}
                      className="rounded-lg bg-white/80 p-2.5 text-xs text-slate-700 dark:bg-slate-950/40 dark:text-slate-300"
                    >
                      <span className="font-semibold">
                        {tradeoff.premiumLenderName}
                      </span>{' '}
                      costs {currency(tradeoff.incrementalNetLoanCostsUsd)}
                      {' '}more upfront than {tradeoff.baselineLenderName} and
                      lowers monthly P&I by{' '}
                      {currency(tradeoff.monthlyPaymentSavingsUsd)}. The
                      incremental-cost break-even is about{' '}
                      <span className="font-semibold">
                        {tradeoff.breakEvenMonths} months
                      </span>
                      .
                      {!tradeoff.withinNewLoanTerm && (
                        <span className="mt-1 block font-medium text-amber-700 dark:text-amber-300">
                          That is longer than the new loan term.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {comparison.summary.map((line) => (
                <li key={line}>• {line}</li>
              ))}
              {comparison.offers.flatMap((offer) =>
                offer.cautions.map((caution) => (
                  <li
                    key={`${offer.id}-${caution}`}
                    className="text-amber-700 dark:text-amber-300"
                  >
                    • {offer.lenderName}: {caution}
                  </li>
                )),
              )}
            </ul>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {comparison.disclaimer}
            </p>
            <div className="flex flex-col gap-2 rounded-xl border border-blue-200/70 bg-blue-50/50 p-3 sm:flex-row sm:items-end dark:border-blue-900/60 dark:bg-blue-950/20">
              <label className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                Saved comparison label (optional)
                <input
                  value={saveLabel}
                  maxLength={120}
                  onChange={(event) => setSaveLabel(event.target.value)}
                  placeholder="e.g. July lender quotes"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={exportMarkdown}
                  disabled={exporting}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300"
                >
                  {exporting ? (
                    <RefreshCw
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Export Markdown
                </button>
                <button
                  type="button"
                  onClick={saveComparison}
                  disabled={saving}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Save comparison
                </button>
              </div>
            </div>
            <fieldset className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-3 dark:border-teal-900/60 dark:bg-teal-950/20">
              <legend className="flex items-center gap-1.5 px-1 text-xs font-semibold text-teal-900 dark:text-teal-200">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Prepare a lender discussion brief
              </legend>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Choose one offer to create a Markdown brief for your own review
                and manual sharing. Competitor lender names are excluded.
                ContractToCozy will not send the file, contact a lender, or
                store a recipient.
              </p>
              <label className="mt-3 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Selected lender
                <select
                  value={handoffOfferId}
                  onChange={(event) => setHandoffOfferId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Choose one reviewed offer</option>
                  {comparison.offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.lenderName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 space-y-2">
                {[
                  [
                    'figuresVerified',
                    'I checked the selected figures against the latest official Loan Estimate.',
                  ],
                  [
                    'sameLoanRequestConfirmed',
                    'The offers reflect my intended loan request, or I understand the visible differences.',
                  ],
                  [
                    'manualSharingUnderstood',
                    'I understand this only downloads a file; ContractToCozy will not send it or contact a lender.',
                  ],
                ].map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-start gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={
                        handoffChecks[
                          field as keyof typeof handoffChecks
                        ]
                      }
                      onChange={(event) =>
                        setHandoffChecks((current) => ({
                          ...current,
                          [field]: event.target.checked,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void exportHandoffMarkdown()}
                disabled={
                  handoffExporting ||
                  !handoffOfferId ||
                  !handoffChecks.figuresVerified ||
                  !handoffChecks.sameLoanRequestConfirmed ||
                  !handoffChecks.manualSharingUnderstood
                }
                className="mt-3 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {handoffExporting ? (
                  <RefreshCw
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Download selected-lender brief
              </button>
            </fieldset>
          </div>
        )}

        {savedComparisons.length > 0 && (
          <div className="border-t border-slate-200/70 pt-4 dark:border-slate-700/70">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Saved comparisons
            </h4>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {savedComparisons.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700/80"
                >
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {item.label ?? `Comparison from ${new Date(item.createdAt).toLocaleDateString()}`}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {item.offers.map((offer) => offer.lenderName).join(' · ')}
                  </p>
                  {pendingDeleteId === item.id ? (
                    <div className="mt-2 rounded-lg bg-rose-50 p-2 dark:bg-rose-950/25">
                      <p className="text-[11px] font-medium text-rose-800 dark:text-rose-300">
                        Permanently delete this saved comparison?
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          disabled={deletingId === item.id}
                          className="text-xs font-semibold text-slate-600 disabled:opacity-50 dark:text-slate-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSaved(item)}
                          disabled={deletingId === item.id}
                          className="text-xs font-semibold text-rose-700 disabled:opacity-50 dark:text-rose-300"
                        >
                          {deletingId === item.id ? 'Deleting…' : 'Delete permanently'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-3">
                      <button
                        type="button"
                        onClick={() => loadSaved(item)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300"
                      >
                        Load comparison
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(item.id)}
                        className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
