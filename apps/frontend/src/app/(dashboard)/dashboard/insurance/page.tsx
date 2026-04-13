// apps/frontend/src/app/(dashboard)/dashboard/insurance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, Plus, Loader2, Shield, Trash2, Edit, X, Upload, CalendarDays, ChevronDown, MoreHorizontal, Sparkles, ShieldCheck, Save } from 'lucide-react';
import { differenceInCalendarDays, format, isPast, isValid, parseISO } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'; 
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InsurancePolicy, CreateInsurancePolicyInput, UpdateInsurancePolicyInput, Property, APIResponse, APIError, Document, DocumentType, DocumentUploadInput } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import OnboardingReturnBanner from '@/components/onboarding/OnboardingReturnBanner';
import { useConfirmDestructiveAction } from '@/components/system/ConfirmDestructiveActionDialog';
import {
  CoverageModalHeader,
  COVERAGE_MODAL_CONTENT_CLASS,
  COVERAGE_MODAL_DATE_INPUT_CLASS,
  COVERAGE_MODAL_FORM_CLASS,
  COVERAGE_MODAL_INPUT_CLASS,
  COVERAGE_MODAL_LABEL_CLASS,
  COVERAGE_MODAL_SELECT_TRIGGER_CLASS,
  COVERAGE_MODAL_TWO_COL_GRID_CLASS,
} from '@/components/shared/coverage-modal-chrome';
// NEW IMPORTS for Table structure
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobilePageIntro,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePropertyContext } from '@/lib/property/PropertyContext';

// Placeholder for "None" option, necessary to avoid Radix UI error on value=""
const SELECT_NONE_VALUE = '__NONE__';

function sanitizeReturnTo(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/dashboard/')) return null;
  return raw;
}

function propertyIdFromDashboardPath(path: string | null): string | undefined {
  if (!path) return undefined;
  const match = path.match(/\/dashboard\/properties\/([^/?]+)/);
  return match?.[1];
}

const POLICY_EXPIRING_SOON_DAYS = 60;
const COMMON_INSURANCE_CARRIERS = [
  'State Farm',
  'Allstate',
  'Liberty Mutual',
  'Progressive',
  'GEICO',
  'USAA',
  'Farmers Insurance',
  'Nationwide',
  'Travelers',
  'American Family Insurance',
];

type PolicyStatusLevel = 'active' | 'expiringSoon' | 'expired';

function getPolicyStatusMeta(expiryDateISO: string): {
  status: PolicyStatusLevel;
  tone: 'good' | 'elevated' | 'danger' | 'info';
  label: string;
  daysRemaining: number | null;
  expiryDate: Date | null;
  expiryLine: string;
  helperLine: string;
} {
  const expiryDate = parseISO(expiryDateISO);
  if (!isValid(expiryDate)) {
    return {
      status: 'active',
      tone: 'info',
      label: 'Unknown',
      daysRemaining: null,
      expiryDate: null,
      expiryLine: 'Renewal unavailable',
      helperLine: 'Check policy details.',
    };
  }

  const daysRemaining = differenceInCalendarDays(expiryDate, new Date());

  if (daysRemaining < 0) {
    const daysAgo = Math.abs(daysRemaining);
    return {
      status: 'expired',
      tone: 'danger',
      label: 'Expired',
      daysRemaining,
      expiryDate,
      expiryLine: `Expired ${format(expiryDate, 'MMM dd, yyyy')}`,
      helperLine: `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`,
    };
  }

  if (daysRemaining <= POLICY_EXPIRING_SOON_DAYS) {
    return {
      status: 'expiringSoon',
      tone: 'elevated',
      label: 'Renewing Soon',
      daysRemaining,
      expiryDate,
      expiryLine: `Renews ${format(expiryDate, 'MMM dd, yyyy')}`,
      helperLine: daysRemaining === 0 ? 'Renews today' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`,
    };
  }

  return {
    status: 'active',
    tone: 'good',
    label: 'Active',
    daysRemaining,
    expiryDate,
    expiryLine: `Renews ${format(expiryDate, 'MMM dd, yyyy')}`,
    helperLine: `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`,
  };
}

function openCozyChat() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('cozy-chat-open'));
}

// --- Document Type Constants for UI ---
const DOCUMENT_TYPES: DocumentType[] = [
    'INSPECTION_REPORT',
    'ESTIMATE',
    'INVOICE',
    'CONTRACT',
    'PERMIT',
    'PHOTO',
    'VIDEO',
    'INSURANCE_CERTIFICATE',
    'LICENSE',
    'OTHER',
];

// --- Document Upload Modal Component ---
interface DocumentUploadModalProps {
  parentEntityId: string; 
  parentEntityType: 'property' | 'warranty' | 'policy';
  onUploadSuccess: () => void;
  onClose: () => void;
}

const DocumentUploadModal = ({ parentEntityId, parentEntityType, onUploadSuccess, onClose }: DocumentUploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DocumentType>('OTHER');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) {
      toast({ title: "Error", description: "Please select a file and provide a name.", variant: "destructive" });
      return;
    }
    
    setIsUploading(true);
    
    const inputData: DocumentUploadInput = {
        name,
        type,
        description: description || undefined,
    };
    
    // Dynamically assign the correct parent ID
    if (parentEntityType === 'warranty') {
        inputData.warrantyId = parentEntityId;
    } else if (parentEntityType === 'policy') {
        inputData.policyId = parentEntityId;
    } else if (parentEntityType === 'property') {
        inputData.propertyId = parentEntityId;
    }
    
    const res = await api.uploadDocument(file, inputData);

    if (res.success) {
      toast({ title: 'Document Uploaded', description: `"${res.data.name}" linked successfully.` });
      onUploadSuccess();
    } else {
      toast({
        title: 'Upload Failed',
        description: res && typeof res === 'object' && 'message' in res ? (res as {message: string}).message : 'Operation failed',
        variant: 'destructive'
      });
    }
    setIsUploading(false);
  };
  
  const title = `Upload Document for ${parentEntityType.charAt(0).toUpperCase() + parentEntityType.slice(1)}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      
      <div className="grid gap-2">
        <Label htmlFor="file">File to Upload *</Label>
        <Input 
          id="file" 
          type="file" 
          onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} 
          required 
          disabled={isUploading}
        />
        {file && <p className="text-xs text-muted-foreground">Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="grid content-start gap-2">
          <Label htmlFor="name">Document Name *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required disabled={isUploading} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="type">Document Type</Label>
           <Select 
            value={type} 
            onValueChange={(v) => setType(v as DocumentType)}
            disabled={isUploading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TYPES.map(dt => (
                <SelectItem key={dt} value={dt}>
                  {/* Convert DOCUMENT_TYPE_ENUM_NAME to "Document Type Enum Name" for display */}
                  {dt.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Description (Optional)</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={isUploading} />
      </div>

      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
          <X className="w-4 h-4 mr-2" /> Cancel
        </Button>
        <Button type="submit" disabled={isUploading || !file || !name}>
          {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />} 
          Upload & Save
        </Button>
      </DialogFooter>
    </form>
  );
};


// --- Insurance Policy Form Component ---
interface PolicyFormProps {
  initialData?: InsurancePolicy;
  properties: Property[];
  providerSuggestions: string[];
  prefill?: {
    propertyId?: string;
    coverageType?: string;
  };
  onSave: (data: CreateInsurancePolicyInput | UpdateInsurancePolicyInput) => Promise<void>;
  onClose: () => void;
  isSubmitting: boolean;
}

const PolicyForm = ({ initialData, properties, providerSuggestions, prefill, onSave, onClose, isSubmitting }: PolicyFormProps) => {
  const buildInitialFormData = useCallback((): CreateInsurancePolicyInput | UpdateInsurancePolicyInput => ({
    carrierName: initialData?.carrierName || '',
    policyNumber: initialData?.policyNumber || '',
    coverageType: initialData?.coverageType || prefill?.coverageType || 'Homeowner',
    premiumAmount: initialData?.premiumAmount ?? undefined,
    startDate: initialData?.startDate ? format(parseISO(initialData.startDate), 'yyyy-MM-dd') : '',
    expiryDate: initialData?.expiryDate ? format(parseISO(initialData.expiryDate), 'yyyy-MM-dd') : '',
    propertyId: initialData?.propertyId || prefill?.propertyId || undefined,
  }), [initialData, prefill]);

  const [formData, setFormData] = useState<CreateInsurancePolicyInput | UpdateInsurancePolicyInput>(buildInitialFormData);

  useEffect(() => {
    setFormData(buildInitialFormData());
  }, [buildInitialFormData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: id === 'premiumAmount' ? (value ? Number(value) : undefined) : value,
    }));
  };

  const handleSelectChange = (key: keyof (CreateInsurancePolicyInput), value: string) => {
    setFormData(prev => ({ ...prev, [key]: value === SELECT_NONE_VALUE ? undefined : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData as CreateInsurancePolicyInput | UpdateInsurancePolicyInput);
  };

  const title = initialData ? `Edit Policy: ${initialData.carrierName}` : 'Add Insurance Policy';
  const selectedPropertyId = formData.propertyId || SELECT_NONE_VALUE;
  const prefilledPropertyMissingFromOptions =
    !!formData.propertyId && !properties.some((property) => property.id === formData.propertyId);
  const coverageLengthLabel = useMemo(() => {
    if (!formData.startDate || !formData.expiryDate) return null;

    const start = parseISO(formData.startDate);
    const end = parseISO(formData.expiryDate);
    if (!isValid(start) || !isValid(end)) return null;

    const days = differenceInCalendarDays(end, start);
    if (days <= 0) return null;

    const months = Math.round(days / 30.4375);
    if (months >= 12 && months % 12 === 0) {
      const years = months / 12;
      return `${years} year${years === 1 ? '' : 's'}`;
    }
    if (months >= 2) {
      return `${months} months`;
    }
    return `${days} day${days === 1 ? '' : 's'}`;
  }, [formData.expiryDate, formData.startDate]);

  const modalTitle = initialData ? 'Edit Policy' : 'Add Policy';
  const saveLabel = initialData ? 'Save Changes' : 'Save Policy';

  return (
    <form onSubmit={handleSubmit} className={cn(COVERAGE_MODAL_FORM_CLASS, 'flex h-full max-h-[92vh] flex-col')}>
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3 sm:hidden">
        <button type="button" onClick={onClose} className="min-h-[40px] px-1 text-sm font-medium text-[#6B7280]">
          Cancel
        </button>
        <p className="text-base font-semibold text-[#111827]">{modalTitle}</p>
        <span className="w-[58px]" aria-hidden="true" />
      </div>

      <div className={cn(COVERAGE_MODAL_CONTENT_CLASS, 'flex-1 space-y-5 overflow-y-auto pb-6')}>
        <CoverageModalHeader
          icon={<Shield className="h-[18px] w-[18px]" />}
          iconClassName="insurance-icon"
          title={title}
          subtitle="We'll remind you before renewal."
        />

        <div className="rounded-2xl border border-sky-200/80 bg-[linear-gradient(145deg,#eff6ff,#f8fafc)] px-3.5 py-3">
          <p className="text-sm font-semibold text-[#111827]">Add Policy</p>
          <p className="mt-0.5 text-xs text-[#4B5563]">Track coverage once and get proactive renewal reminders.</p>
        </div>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#4B5563]">Policy Details</h3>
          <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
            <div className="grid gap-2">
              <Label htmlFor="carrierName" className={COVERAGE_MODAL_LABEL_CLASS}>
                Provider *
              </Label>
              <Input
                id="carrierName"
                list="insurance-provider-suggestions"
                value={formData.carrierName}
                onChange={handleChange}
                required
                placeholder="Search or enter provider"
                className={COVERAGE_MODAL_INPUT_CLASS}
              />
              <datalist id="insurance-provider-suggestions">
                {providerSuggestions.slice(0, 12).map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
              {providerSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {providerSuggestions.slice(0, 4).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, carrierName: provider }))}
                      className="rounded-full border border-[#D1D5DB] bg-white px-2.5 py-1 text-[11px] font-medium text-[#374151] transition-colors hover:border-[#0D9488] hover:text-[#0D9488]"
                    >
                      {provider}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={COVERAGE_MODAL_TWO_COL_GRID_CLASS}>
              <div className="grid content-start gap-2">
                <Label htmlFor="policyNumber" className={COVERAGE_MODAL_LABEL_CLASS}>
                  Policy number *
                </Label>
                <Input
                  id="policyNumber"
                  value={formData.policyNumber}
                  onChange={handleChange}
                  required
                  placeholder="e.g. HO-123456789"
                  className={COVERAGE_MODAL_INPUT_CLASS}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="premiumAmount" className={COVERAGE_MODAL_LABEL_CLASS}>
                  Cost ($) *
                </Label>
                <Input
                  id="premiumAmount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.premiumAmount ?? ''}
                  onChange={handleChange}
                  required
                  placeholder="e.g. 1,200"
                  className={COVERAGE_MODAL_INPUT_CLASS}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#4B5563]">Coverage Period</h3>
          <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
            <div className={COVERAGE_MODAL_TWO_COL_GRID_CLASS}>
              <div className="grid content-start gap-2">
                <Label htmlFor="startDate" className={COVERAGE_MODAL_LABEL_CLASS}>
                  Start date *
                </Label>
                <div className="date-input-wrapper relative">
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={handleChange}
                    required
                    className={COVERAGE_MODAL_DATE_INPUT_CLASS}
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                </div>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="expiryDate" className={COVERAGE_MODAL_LABEL_CLASS}>
                  Renewal date *
                </Label>
                <div className="date-input-wrapper relative">
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={handleChange}
                    required
                    className={COVERAGE_MODAL_DATE_INPUT_CLASS}
                  />
                  <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
                </div>
              </div>
            </div>
            {coverageLengthLabel ? (
              <p className="rounded-xl border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2 text-xs font-medium text-[#1D4ED8]">
                Coverage length: {coverageLengthLabel}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#4B5563]">Coverage Target</h3>
          <div className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
            <div className={COVERAGE_MODAL_TWO_COL_GRID_CLASS}>
              <div className="grid content-start gap-2">
                <Label htmlFor="coverageType" className={COVERAGE_MODAL_LABEL_CLASS}>
                  Coverage type
                </Label>
                <Select value={formData.coverageType || SELECT_NONE_VALUE} onValueChange={(v) => handleSelectChange('coverageType', v)}>
                  <SelectTrigger className={COVERAGE_MODAL_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>None / N/A</SelectItem>
                    <SelectItem value="Homeowner">Homeowner</SelectItem>
                    <SelectItem value="Landlord">Landlord</SelectItem>
                    <SelectItem value="Flood">Flood</SelectItem>
                    <SelectItem value="Renter">Renter</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="propertyId" className={COVERAGE_MODAL_LABEL_CLASS}>
                  Property
                </Label>
                <Select value={selectedPropertyId} onValueChange={(v) => handleSelectChange('propertyId', v)}>
                  <SelectTrigger className={COVERAGE_MODAL_SELECT_TRIGGER_CLASS}>
                    <SelectValue placeholder="Not linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SELECT_NONE_VALUE}>Not linked</SelectItem>
                    {prefilledPropertyMissingFromOptions && formData.propertyId && (
                      <SelectItem value={formData.propertyId}>
                        Selected property
                      </SelectItem>
                    )}
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.zipCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-[#E5E7EB] bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-[46px] w-full justify-center sm:h-[40px] sm:w-auto"
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-[48px] w-full justify-center bg-[#0D9488] text-white hover:bg-[#0F766E] sm:h-[40px] sm:w-auto"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saveLabel}
          </Button>
        </div>
      </div>
    </form>
  );
};


// --- Main Page Component ---
export default function InsurancePage() {
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false); 
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | undefined>(undefined);
  
  // NEW STATE for Document Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadingToPolicyId, setUploadingToPolicyId] = useState<string | null>(null);
  const [expandedPolicyIds, setExpandedPolicyIds] = useState<Record<string, boolean>>({});

  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useConfirmDestructiveAction();
  
  // NEW: Navigation Hooks
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId: dashboardSelectedPropertyId } = usePropertyContext();
  const createPrefill = useMemo(() => {
    const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
    const propertyId =
      searchParams.get('propertyId') ||
      dashboardSelectedPropertyId ||
      propertyIdFromDashboardPath(returnTo) ||
      undefined;
    const from = searchParams.get('from');
    const coverageType = searchParams.get('coverageType') || (from === 'coverage-buy' ? 'Homeowner' : undefined);

    if (!propertyId && !coverageType) return undefined;
    return { propertyId, coverageType };
  }, [dashboardSelectedPropertyId, searchParams]);
  const [createModalPrefill, setCreateModalPrefill] = useState<PolicyFormProps['prefill']>(undefined);
  const [openedFromSetup, setOpenedFromSetup] = useState(false); // State to track if the modal opened automatically
  
  const fetchDependencies = useCallback(async () => {
    setIsLoading(true);
    const [policiesRes, propertiesRes] = await Promise.all([
      api.listInsurancePolicies(),
      api.getProperties(),
    ]);

    if (policiesRes.success) {
      setPolicies(policiesRes.data.policies);
    } else {
      toast({
        title: "Error fetching policies",
        description: (policiesRes as APIError).message,
        variant: "destructive",
      });
      setPolicies([]);
    }

    if (propertiesRes.success) {
      setProperties(propertiesRes.data.properties);
    }
    setIsLoading(false);
  }, [toast]); 

  // NEW: Handle initial load based on query parameters
  useEffect(() => {
    fetchDependencies();

    const action = searchParams.get('action');
    const from = searchParams.get('from');
    
    if (action === 'new' && !isAddEditModalOpen) {
        openAddEditModal(undefined, createPrefill);
        
        // Check if navigation originated from the maintenance setup page
        if (from === 'maintenance-setup') {
            setOpenedFromSetup(true);
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDependencies, searchParams, createPrefill, isAddEditModalOpen]);

  const handleSave = async (data: CreateInsurancePolicyInput | UpdateInsurancePolicyInput) => {
    setIsSubmitting(true);
    let res: APIResponse<InsurancePolicy>;
    
    if (editingPolicy) {
      res = await api.updateInsurancePolicy(editingPolicy.id, data as UpdateInsurancePolicyInput);
    } else {
      res = await api.createInsurancePolicy(data as CreateInsurancePolicyInput);
    }

    if (res.success) {
      toast({
        title: editingPolicy ? 'Policy Updated' : 'Policy Created',
        description: `${res.data.carrierName}'s policy was saved successfully.`,
      });
      
      // NEW: Conditional redirection after successful creation
      if (!editingPolicy && openedFromSetup) {
          router.push('/dashboard/maintenance-setup'); // Navigate back to setup page
      } else {
          await fetchDependencies(); // Refresh list to show new/updated item
          closeAddEditModal();
      }
    } else {
      toast({
        title: 'Operation Failed',
        description: (res as APIError).message,
        variant: 'destructive',
      });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (policyId: string) => {
    const confirmed = await requestConfirmation({
      title: 'Delete this insurance policy?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete policy',
    });
    if (!confirmed) {
      return;
    }

    setIsLoading(true);
    const res = await api.deleteInsurancePolicy(policyId);

    if (res.success) {
      toast({ title: 'Policy Deleted', description: 'The insurance policy record was removed.' });
      await fetchDependencies(); // Refresh list to remove deleted item
    } else {
      toast({ title: 'Deletion Failed', description: (res as APIError).message, variant: 'destructive' });
      setIsLoading(false);
    }
  };
  
  // Handlers for Add/Edit Modal
  const openAddEditModal = (policy?: InsurancePolicy, prefillOverride?: PolicyFormProps['prefill']) => {
    setEditingPolicy(policy);
    setCreateModalPrefill(!policy ? (prefillOverride ?? createPrefill) : undefined);
    setOpenedFromSetup(false); // Reset for manual opens
    setIsAddEditModalOpen(true);
  };
  
  const closeAddEditModal = () => {
    const wasOpenedFromSetup = openedFromSetup;
    setIsAddEditModalOpen(false);
    setEditingPolicy(undefined);
    setCreateModalPrefill(undefined);
    setOpenedFromSetup(false);

    if (wasOpenedFromSetup) {
        // If canceled after being opened from maintenance-setup, navigate back.
        router.push('/dashboard/maintenance-setup');
    } else if (searchParams.has('action') || searchParams.has('from')) {
        // Otherwise, clean up the URL without navigating away from the current page.
        router.replace('/dashboard/insurance', { scroll: false });
    }
  };
  
  // Handlers for Document Upload Modal
  const openUploadModal = (policyId: string) => {
    setUploadingToPolicyId(policyId);
    setIsUploadModalOpen(true);
  };
  
  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    setUploadingToPolicyId(null);
  };

  const handleAddEditDialogOpenChange = (open: boolean) => {
    if (open) {
      setIsAddEditModalOpen(true);
      return;
    }
    closeAddEditModal();
  };

  const handleUploadDialogOpenChange = (open: boolean) => {
    if (open) {
      setIsUploadModalOpen(true);
      return;
    }
    closeUploadModal();
  };

  const togglePolicyDetails = (policyId: string) => {
    setExpandedPolicyIds((prev) => ({
      ...prev,
      [policyId]: !prev[policyId],
    }));
  };

  const askCozyDockVisible = !isAddEditModalOpen && !isUploadModalOpen;


  const sortedPolicies = useMemo(() => {
    return [...policies].sort((a, b) => {
        const dateA = parseISO(a.expiryDate).getTime();
        const dateB = parseISO(b.expiryDate).getTime();
        return dateA - dateB;
    });
  }, [policies]);

  const policyStatusMeta = useMemo(
    () =>
      sortedPolicies.map((policy) => ({
        policy,
        meta: getPolicyStatusMeta(policy.expiryDate),
      })),
    [sortedPolicies]
  );

  const expiredPolicyCount = useMemo(
    () => policyStatusMeta.filter(({ meta }) => meta.status === 'expired').length,
    [policyStatusMeta]
  );
  const expiringSoonPolicyCount = useMemo(
    () => policyStatusMeta.filter(({ meta }) => meta.status === 'expiringSoon').length,
    [policyStatusMeta]
  );
  const activePolicyCount = useMemo(
    () => policyStatusMeta.filter(({ meta }) => meta.status === 'active').length,
    [policyStatusMeta]
  );
  const nextRenewal = useMemo(() => {
    const nextUpcoming = policyStatusMeta.find(({ meta }) => meta.expiryDate && meta.daysRemaining !== null && meta.daysRemaining >= 0);
    return nextUpcoming?.meta.expiryDate ?? policyStatusMeta[0]?.meta.expiryDate ?? null;
  }, [policyStatusMeta]);
  const providerSuggestions = useMemo(() => {
    const uniqueProviders = new Map<string, string>();
    [...policies.map((policy) => policy.carrierName), ...COMMON_INSURANCE_CARRIERS].forEach((provider) => {
      const normalized = provider?.trim();
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (!uniqueProviders.has(key)) {
        uniqueProviders.set(key, normalized);
      }
    });
    return Array.from(uniqueProviders.values());
  }, [policies]);
  
  const getPropertyInfo = useCallback((propertyId: string | null) => {
      if (!propertyId) return 'General';
      const property = properties.find(p => p.id === propertyId);
      return property ? property.name || property.address : 'N/A';
  }, [properties]);


  return (
    <div className="space-y-5 pb-6 lg:pb-8">
      <OnboardingReturnBanner />
      <MobilePageIntro
        title="My Insurance"
        subtitle="Track policy coverage, renewal timing, and documents in one place."
        action={
          <Dialog open={isAddEditModalOpen} onOpenChange={handleAddEditDialogOpenChange}>
            <Button size="sm" className="min-h-[40px] px-3.5" onClick={() => openAddEditModal(undefined)}>
              <Plus className="w-4 h-4 mr-2" /> Add Policy
            </Button>
            <DialogContent className="modal-container w-[calc(100vw-2rem)] sm:max-w-[700px] gap-0 overflow-hidden p-0 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:max-h-[92vh] max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0">
              <PolicyForm 
                initialData={editingPolicy}
                properties={properties}
                providerSuggestions={providerSuggestions}
                prefill={!editingPolicy ? createModalPrefill : undefined}
                onSave={handleSave}
                onClose={closeAddEditModal}
                isSubmitting={isSubmitting}
              />
            </DialogContent>
          </Dialog>
        }
      />
      
      {isLoading && (
        <div className="text-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
          <p className="text-gray-500 mt-2">Loading policies...</p>
        </div>
      )}

      {!isLoading && sortedPolicies.length === 0 && (
        <>
          <div className="md:hidden">
            <EmptyStateCard
              title="No policies yet"
              description="Add your first policy to track renewals, premiums, and insurance documents."
              action={
                <Button className="min-h-[40px]" onClick={() => openAddEditModal(undefined)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add first policy
                </Button>
              }
            />
          </div>
          <Card className="hidden py-10 text-center md:block">
            <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <CardTitle>No Policies Found</CardTitle>
            <CardDescription>Click &quot;Add Policy&quot; to create your first policy record.</CardDescription>
          </Card>
        </>
      )}

      {!isLoading && sortedPolicies.length > 0 && (
        <>
          <div className="space-y-3 md:hidden">
            <MobileCard variant="compact" className="space-y-3 border-slate-200/80 bg-white shadow-sm">
              <div className="flex items-center gap-2">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900">Coverage Health</p>
                  <p className="text-xs text-slate-500">60-day renewal watch</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200/90 bg-[linear-gradient(135deg,rgba(37,99,235,0.06),rgba(245,158,11,0.08),rgba(239,68,68,0.06))]">
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-indigo-700">Active</p>
                  <p className="text-lg font-semibold text-slate-900">{activePolicyCount}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-amber-700">Renewing</p>
                  <p className="text-lg font-semibold text-slate-900">{expiringSoonPolicyCount}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-rose-700">Expired</p>
                  <p className="text-lg font-semibold text-slate-900">{expiredPolicyCount}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600">
                Next renewal: <span className="font-medium text-slate-900">{nextRenewal ? format(nextRenewal, 'MMM dd, yyyy') : 'N/A'}</span>
              </p>
            </MobileCard>

            {policyStatusMeta.map(({ policy, meta }) => {
              const propertyInfo = getPropertyInfo(policy.propertyId);
              const coverageLine = policy.coverageType || 'General Coverage';
              const metadataLine = `${policy.policyNumber ? `Policy #${policy.policyNumber}` : 'Policy unlisted'} • ${propertyInfo}`;
              const expanded = Boolean(expandedPolicyIds[policy.id]);

              return (
                <Collapsible
                  key={policy.id}
                  open={expanded}
                  onOpenChange={() => togglePolicyDetails(policy.id)}
                >
                  <MobileCard
                    variant="compact"
                    className={cn(
                      'overflow-hidden border-slate-200/80 bg-white p-0 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.45)]',
                      meta.status === 'expired' && 'border-rose-200/90',
                      meta.status === 'expiringSoon' && 'border-amber-200/90'
                    )}
                  >
                    <div className="space-y-2.5 px-4 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold uppercase tracking-[0.06em] text-slate-800">
                            {policy.carrierName}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xl font-semibold leading-tight text-slate-900">
                            {coverageLine}
                          </p>
                        </div>
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                      </div>

                      <div className="space-y-0.5">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            meta.status === 'expired'
                              ? 'text-rose-700'
                              : meta.status === 'expiringSoon'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          )}
                        >
                          {meta.expiryLine}
                        </p>
                        <p className="text-xs text-slate-500">{meta.helperLine}</p>
                      </div>

                      <p className="truncate text-sm text-slate-600">{metadataLine}</p>
                    </div>

                    <div className="mt-3 grid grid-cols-[1fr_1fr_auto_auto] items-center border-t border-slate-200/80 px-1.5 py-1">
                      <Button
                        variant="ghost"
                        className="min-h-[40px] justify-start gap-1.5 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => openAddEditModal(policy)}
                      >
                        <Edit className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-[40px] justify-start gap-1.5 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        onClick={() => openUploadModal(policy.id)}
                      >
                        <Upload className="h-4 w-4" />
                        Docs
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                            aria-label="More policy actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openUploadModal(policy.id)}>
                            <Upload className="h-4 w-4" />
                            Upload document
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-rose-700 focus:text-rose-700"
                            onClick={() => handleDelete(policy.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete policy
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          aria-label={expanded ? 'Collapse policy details' : 'Expand policy details'}
                        >
                          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent className="border-t border-slate-200/80 bg-slate-50/70">
                      <div className="space-y-2.5 px-4 py-3">
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Policy #</p>
                          <p className="font-medium text-slate-800">{policy.policyNumber || 'N/A'}</p>
                        </div>
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Property</p>
                          <p className="font-medium text-slate-800">{propertyInfo}</p>
                        </div>
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Premium</p>
                          <p className="font-medium text-slate-800">${policy.premiumAmount.toFixed(2)}</p>
                        </div>
                        <div className="grid grid-cols-[108px_1fr] gap-2 text-sm">
                          <p className="text-slate-500">Started</p>
                          <p className="font-medium text-slate-800">
                            {isValid(parseISO(policy.startDate)) ? format(parseISO(policy.startDate), 'MMM dd, yyyy') : 'N/A'}
                          </p>
                        </div>
                        {meta.status !== 'active' ? (
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                            <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500">Cozy Insight</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {meta.status === 'expired'
                                ? 'This policy appears lapsed. Add a replacement policy to keep protection current.'
                                : 'Renewal is coming up soon. Review premium and coverage before the renewal date.'}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </CollapsibleContent>
                  </MobileCard>
                </Collapsible>
              );
            })}
          </div>

          <div className="hidden rounded-md border bg-white overflow-x-auto md:block">
            <Table className="w-full table-auto">
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                <TableHead>Policy #</TableHead>
                <TableHead className="hidden lg:table-cell">Coverage Type</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-center">Expires</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedPolicies.map(policy => {
                const expired = isPast(parseISO(policy.expiryDate));
                const statusClass = expired ? 'text-red-600' : 'text-green-600';
                
                return (
                  <TableRow key={policy.id} className={expired ? 'bg-red-50/50 hover:bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {policy.carrierName}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(parseISO(policy.startDate), 'MMM dd, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                        {policy.policyNumber || 'N/A'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                      {policy.coverageType || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm">
                        {getPropertyInfo(policy.propertyId)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                        ${policy.premiumAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className={statusClass}>
                          {format(parseISO(policy.expiryDate), 'MMM dd, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded-full",
                        expired ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      )}>
                        {expired ? 'Expired' : 'Active'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center space-x-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-500 hover:text-green-600"
                            onClick={() => openUploadModal(policy.id)}
                            title="Upload Document"
                          >
                            <Upload className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-500 hover:text-blue-600"
                            onClick={() => openAddEditModal(policy)}
                            title="Edit Policy"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-500 hover:text-red-600"
                            onClick={() => handleDelete(policy.id)}
                            title="Delete Policy"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {askCozyDockVisible && (
        <div
          data-chat-collision-zone="true"
          className="fixed inset-x-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 md:hidden"
        >
          <button
            type="button"
            onClick={openCozyChat}
            className="flex w-full items-center justify-between rounded-2xl border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(34,197,94,0.2),transparent_45%),linear-gradient(120deg,#0f172a,#111827)] px-4 py-3 text-left text-white shadow-[0_22px_48px_-30px_rgba(15,23,42,0.95)]"
            aria-label="Ask Cozy about your insurance"
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-base font-medium">Ask Cozy about your insurance</span>
            </span>
            <ChevronDown className="-rotate-90 h-5 w-5 text-white/80" />
          </button>
        </div>
      )}

      <div className="md:hidden">
        <BottomSafeAreaReserve size="floatingAction" />
      </div>
      
      {/* Document Upload Dialog (for Insurance Policies) */}
      <Dialog open={isUploadModalOpen} onOpenChange={handleUploadDialogOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          {uploadingToPolicyId && (
            <DocumentUploadModal 
              parentEntityId={uploadingToPolicyId}
              parentEntityType="policy"
              onUploadSuccess={() => {
                  fetchDependencies(); 
                  closeUploadModal();
              }}
              onClose={closeUploadModal}
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </div>
  );
}
