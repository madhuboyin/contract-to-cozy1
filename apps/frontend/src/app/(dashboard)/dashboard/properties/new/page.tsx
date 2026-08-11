// apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx
'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { CalendarCheck2, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  MobileCard,
  MobilePageIntro,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import { AddressAutocomplete } from '@/components/property/AddressAutocomplete';
import PropertyOwnershipResponsibilitySection, {
  type OccupancyStatus,
  type OwnershipForm,
  type PropertyUse,
} from '@/components/property/PropertyOwnershipResponsibilitySection';
import type { OutdoorSpaceType } from '@/types';
import {
  DWELLING_TYPE_LABELS,
  DWELLING_TYPE_OPTIONS,
  OUTDOOR_SPACE_TYPE_OPTIONS,
  defaultResponsibilityParties,
  mapResponsibilitiesToPayload,
  normalizeOutdoorSpaceTypes,
  type ResponsibilityParties,
} from '@/lib/property/propertyContextForm';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

// NEW: Structured data type for appliance inputs
interface ApplianceInput {
  id: number; // Unique ID for keying/deletion
  type: string; // Appliance type from MAJOR_APPLIANCE_OPTIONS
  installYear: string; // The year it was installed (YYYY)
}

interface PropertyFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;
  dwellingType: string;
  ownershipForm: string;
  propertyUse: string;
  occupancyStatus: string;
  yearBuilt: string;
  propertySize: string;
  responsibilities: ResponsibilityParties;
  outdoorSpaceTypes: OutdoorSpaceType[];
  heatingType: string;
  coolingType: string;
  waterHeaterType: string;
  roofType: string;
  hvacInstallYear: string;
  waterHeaterInstallYear: string;
  roofReplacementYear: string;
  hasSmokeDetectors: boolean | null;
  hasCoDetectors: boolean | null;
  hasSecuritySystem: boolean | null;
  hasFireExtinguisher: boolean | null;
  hasIrrigation: boolean;
  hasDrainageIssues: boolean;
  hasPrivateOutdoorSpace: boolean;
  hasLawn: boolean;
  hasTreesOrShrubs: boolean;
  hasDriveway: boolean;
  // REMOVED: applianceAges: string; (Managed internally by majorAppliances state)
}

type SystemYearAnswer = 'UNANSWERED' | 'ORIGINAL' | 'REPLACED' | 'UNKNOWN';
type SystemYearKey = 'hvacInstallYear' | 'waterHeaterInstallYear' | 'roofReplacementYear';
type SystemYearAnswers = Record<SystemYearKey, SystemYearAnswer>;

const HEATING_OPTIONS = ['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'UNKNOWN'];
const COOLING_OPTIONS = ['CENTRAL_AC', 'WINDOW_AC', 'UNKNOWN'];
const WATER_HEATER_OPTIONS = ['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN'];
const ROOF_OPTIONS = ['SHINGLE', 'TILE', 'FLAT', 'METAL', 'UNKNOWN'];

// NEW: Canonical list of major appliances for the Select input
const MAJOR_APPLIANCE_OPTIONS = [
    'DISHWASHER',
    'REFRIGERATOR',
    'OVEN_RANGE',
    'WASHER_DRYER',
    'MICROWAVE_HOOD',
    'WATER_SOFTENER',
];
const MAX_PROPERTY_PHOTO_SIZE_MB = 10;
const ALLOWED_PROPERTY_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function openCozyChat() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('cozy-chat-open', { detail: { surface: 'PROPERTIES_NEW_PAGE' } }));
}

export default function NewPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [systemYearAnswers, setSystemYearAnswers] = useState<SystemYearAnswers>({
    hvacInstallYear: 'UNANSWERED',
    waterHeaterInstallYear: 'UNANSWERED',
    roofReplacementYear: 'UNANSWERED',
  });

  // NEW STATE: Structured input for appliances (empty array initially)
  const [majorAppliances, setMajorAppliances] = useState<ApplianceInput[]>([]);
  const [propertyPhotoFile, setPropertyPhotoFile] = useState<File | null>(null);
  const [propertyPhotoPreviewUrl, setPropertyPhotoPreviewUrl] = useState<string | null>(null);
  const propertyPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState<PropertyFormData>({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    isPrimary: false,
    dwellingType: '',
    ownershipForm: '',
    propertyUse: '',
    occupancyStatus: '',
    yearBuilt: '',
    propertySize: '',
    // A new property does not establish who handles every system. Capture the
    // relevant responsibility when the homeowner reaches that workflow.
    responsibilities: defaultResponsibilityParties('UNKNOWN'),
    outdoorSpaceTypes: [],
    heatingType: '',
    coolingType: '',
    waterHeaterType: '',
    roofType: '',
    hvacInstallYear: '',
    waterHeaterInstallYear: '',
    roofReplacementYear: '',
    hasSmokeDetectors: null,
    hasCoDetectors: null,
    hasSecuritySystem: null,
    hasFireExtinguisher: null,
    hasIrrigation: false,
    hasDrainageIssues: false,
    hasPrivateOutdoorSpace: false,
    hasLawn: false,
    hasTreesOrShrubs: false,
    hasDriveway: false,
    // REMOVED: applianceAges: '',
  });

  useEffect(() => {
    return () => {
      if (propertyPhotoPreviewUrl) URL.revokeObjectURL(propertyPhotoPreviewUrl);
    };
  }, [propertyPhotoPreviewUrl]);

  useEffect(() => {
    const confirmedOriginalYear = /^\d{4}$/.test(formData.yearBuilt) ? formData.yearBuilt : '';
    setFormData((previous) => {
      const next = { ...previous };
      let changed = false;
      (Object.keys(systemYearAnswers) as SystemYearKey[]).forEach((key) => {
        if (systemYearAnswers[key] === 'ORIGINAL' && next[key] !== confirmedOriginalYear) {
          next[key] = confirmedOriginalYear;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [formData.yearBuilt, systemYearAnswers]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const target = e.target as (HTMLInputElement | HTMLTextAreaElement);

    setFormData(prev => ({
      ...prev,
      // Handle checkbox change correctly, assuming other types are strings
      [name]: type === 'checkbox' ? (target as HTMLInputElement).checked : value,
    }));
  };
  
  const handleSelectChange = (name: keyof PropertyFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const setSystemYearAnswer = (key: SystemYearKey, answer: SystemYearAnswer) => {
    setSystemYearAnswers((previous) => ({ ...previous, [key]: answer }));
    setFormData((previous) => ({
      ...previous,
      [key]: answer === 'ORIGINAL' && /^\d{4}$/.test(previous.yearBuilt)
        ? previous.yearBuilt
        : '',
    }));
  };

  const confirmAllSystemsOriginal = () => {
    if (!/^\d{4}$/.test(formData.yearBuilt)) return;
    setSystemYearAnswers({
      hvacInstallYear: 'ORIGINAL',
      waterHeaterInstallYear: 'ORIGINAL',
      roofReplacementYear: 'ORIGINAL',
    });
    setFormData((previous) => ({
      ...previous,
      hvacInstallYear: previous.yearBuilt,
      waterHeaterInstallYear: previous.yearBuilt,
      roofReplacementYear: previous.yearBuilt,
    }));
  };

  const handleOutdoorSpaceTypeChange = (type: OutdoorSpaceType, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      outdoorSpaceTypes: checked
        ? Array.from(new Set([...prev.outdoorSpaceTypes, type]))
        : prev.outdoorSpaceTypes.filter(existing => existing !== type),
    }));
  };
  
  // NEW: Appliance management helpers
  const addAppliance = () => {
    setMajorAppliances(prev => [
        ...prev,
        { id: Date.now(), type: '', installYear: '' }
    ]);
  };

  const removeAppliance = (id: number) => {
    setMajorAppliances(prev => prev.filter(app => app.id !== id));
  };

  const handleApplianceChange = (id: number, field: keyof Omit<ApplianceInput, 'id'>, value: string) => {
    setMajorAppliances(prev => prev.map(app => 
        app.id === id ? { ...app, [field]: value } : app
    ));
  };

  const clearPropertyPhoto = () => {
    if (propertyPhotoPreviewUrl) URL.revokeObjectURL(propertyPhotoPreviewUrl);
    setPropertyPhotoPreviewUrl(null);
    setPropertyPhotoFile(null);
    if (propertyPhotoInputRef.current) {
      propertyPhotoInputRef.current.value = '';
    }
  };

  const handlePropertyPhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_PROPERTY_PHOTO_TYPES.includes(file.type)) {
      setError('Invalid photo type. Upload JPG, PNG, WEBP, or HEIC.');
      if (propertyPhotoInputRef.current) propertyPhotoInputRef.current.value = '';
      return;
    }

    if (file.size > MAX_PROPERTY_PHOTO_SIZE_MB * 1024 * 1024) {
      setError(`Photo must be under ${MAX_PROPERTY_PHOTO_SIZE_MB}MB.`);
      if (propertyPhotoInputRef.current) propertyPhotoInputRef.current.value = '';
      return;
    }

    setError('');
    if (propertyPhotoPreviewUrl) URL.revokeObjectURL(propertyPhotoPreviewUrl);
    setPropertyPhotoFile(file);
    setPropertyPhotoPreviewUrl(URL.createObjectURL(file));
  };


  const validateBasicFields = () => {
    if (!formData.address.trim()) return 'Street Address is required.';
    if (!formData.city.trim()) return 'City is required.';
    if (!formData.state.trim() || formData.state.length !== 2) return 'State must be 2 characters (e.g., NJ).';
    if (!/^\d{5}$/.test(formData.zipCode)) return 'ZIP code must be 5 digits.';
    if (!formData.dwellingType) return 'Home type is required.';
    if (!formData.ownershipForm) return 'Choose how this home is owned.';
    if (!formData.propertyUse) return 'Choose how this home is used.';
    if (!formData.occupancyStatus) return 'Choose who lives here now.';
    if (!/^\d{4}$/.test(formData.yearBuilt)) return 'Year Built must be a 4-digit year.';
    for (const [field, label] of [
      ['hvacInstallYear', 'HVAC installation year'],
      ['waterHeaterInstallYear', 'Water heater installation year'],
      ['roofReplacementYear', 'Roof installation or replacement year'],
    ] as const) {
      const value = formData[field];
      if (value && !/^\d{4}$/.test(value)) return `${label} must be a 4-digit year.`;
      if (value && Number(value) < Number(formData.yearBuilt)) {
        return `${label} cannot be earlier than the year the home was built.`;
      }
    }

    // NEW: Validate structured appliance inputs
    for (const app of majorAppliances) {
        if (app.type && !/^\d{4}$/.test(app.installYear)) {
            return `Appliance "${app.type.replace(/_/g, ' ')}" must have a valid 4-digit installation year.`;
        }
    }

    // REMOVED: Old JSON validation logic is gone.

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const basicError = validateBasicFields();
    if (basicError) {
      setError(basicError);
      return;
    }
    
    const majorAppliancesPayload = majorAppliances
      .filter(app => app.type && app.installYear)
      .map(app => ({
        type: app.type.toUpperCase(),
        installYear: parseInt(app.installYear)
      }));

    const payload = {
      name: formData.name.trim() || undefined,
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim().toUpperCase(),
      zipCode: formData.zipCode.trim(),
      isPrimary: formData.isPrimary,
      
      dwellingType: formData.dwellingType as any,
      ownershipForm: formData.ownershipForm as any,
      propertyUse: formData.propertyUse as any,
      occupancyStatus: formData.occupancyStatus as any,
      yearBuilt: parseInt(formData.yearBuilt) || undefined,
      propertySize: parseInt(formData.propertySize) || undefined,
      heatingType: formData.heatingType || undefined,
      coolingType: formData.coolingType || undefined,
      waterHeaterType: formData.waterHeaterType || undefined,
      roofType: formData.roofType || undefined,
      hvacInstallYear: parseInt(formData.hvacInstallYear) || undefined,
      waterHeaterInstallYear: parseInt(formData.waterHeaterInstallYear) || undefined,
      roofReplacementYear: parseInt(formData.roofReplacementYear) || undefined,
      
      hasSmokeDetectors: formData.hasSmokeDetectors ?? undefined,
      hasCoDetectors: formData.hasCoDetectors ?? undefined,
      hasSecuritySystem: formData.hasSecuritySystem ?? undefined,
      hasFireExtinguisher: formData.hasFireExtinguisher ?? undefined,
      hasIrrigation: formData.hasIrrigation,
      hasDrainageIssues: formData.hasDrainageIssues,
      exteriorProfile: {
        hasPrivateOutdoorSpace: formData.hasPrivateOutdoorSpace,
        outdoorSpaceTypes: normalizeOutdoorSpaceTypes(formData.hasPrivateOutdoorSpace, formData.outdoorSpaceTypes),
        hasLawn: formData.hasLawn,
        hasTreesOrShrubs: formData.hasTreesOrShrubs,
        hasDriveway: formData.hasDriveway,
        hasIrrigation: formData.hasIrrigation,
        hasDrainageIssues: formData.hasDrainageIssues,
      },
      responsibilities: mapResponsibilitiesToPayload(formData.responsibilities),

      majorAppliances: majorAppliancesPayload.length > 0 ? majorAppliancesPayload : undefined,
    };

    setSubmitting(true);
    try {
      const response = await api.createProperty(payload);

      if (response.success) {
        localStorage.removeItem(PROPERTY_SETUP_SKIPPED_KEY);
        const createdPropertyId = response.data?.id;

        if (createdPropertyId && propertyPhotoFile) {
          try {
            const uploadResponse = await api.uploadDocument(propertyPhotoFile, {
              type: 'PHOTO',
              name: propertyPhotoFile.name || 'Property Photo',
              propertyId: createdPropertyId,
            });

            if (uploadResponse.success && uploadResponse.data?.id) {
              await api.updateProperty(createdPropertyId, {
                coverPhotoDocumentId: uploadResponse.data.id,
              });
            }
          } catch (uploadError: unknown) {
            console.error('Property photo upload failed:', uploadError);
            toast({
              title: 'Property saved, photo upload failed',
              description: 'You can add a property photo later from Documents.',
              variant: 'destructive',
            });
          }
        }

        toast({ title: 'Property created successfully!' });
        router.push(createdPropertyId ? `/dashboard/properties/${createdPropertyId}` : '/dashboard/properties');
      } else {
        setError(response.message || 'Failed to create property');
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipNow = () => {
    localStorage.setItem(PROPERTY_SETUP_SKIPPED_KEY, 'true');

    // Use both methods to be absolutely sure
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 100);
  };

  const inputBaseClass =
    'min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] placeholder:text-slate-400 focus:border-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-500/20';
  const selectBaseClass =
    'min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] focus:border-teal-500/40 focus:outline-none focus:ring-2 focus:ring-teal-500/20';

  const SelectInput = ({ label, name, value, options, required = false, placeholder, optionLabels }: {
    label: string, 
    name: keyof PropertyFormData, 
    value: string, 
    options: readonly string[],
    required?: boolean,
    placeholder?: string,
    optionLabels?: Record<string, string>,
  }) => (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => handleSelectChange(name, e.target.value)}
        required={required}
        className={selectBaseClass}
      >
        <option value="">{placeholder || `Select ${label}`}</option>
        {options.map(option => (
          <option key={option} value={option}>
            {optionLabels?.[option] ?? option.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
  
  const BooleanInput = ({ label, name, checked }: { 
    label: string, 
    name: keyof PropertyFormData, 
    checked: boolean 
  }) => (
    <label
      htmlFor={name}
      className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5"
    >
      <span className="pr-2 text-sm font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        id={name}
        name={name}
        checked={checked}
        onChange={handleChange}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
      />
    </label>
  );

  const OptionalBooleanInput = ({
    label,
    name,
    value,
  }: {
    label: string;
    name: 'hasSmokeDetectors' | 'hasCoDetectors' | 'hasSecuritySystem' | 'hasFireExtinguisher';
    value: boolean | null;
  }) => (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{label}</legend>
      <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
        {([
          { label: 'Yes', value: true },
          { label: 'No', value: false },
          { label: 'Not sure', value: null },
        ] as const).map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => setFormData((current) => ({ ...current, [name]: option.value }))}
            className={`min-h-[40px] rounded-md px-2 py-2 text-xs font-semibold transition ${
              value === option.value
                ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  const BasicAddressFields = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-slate-700">
          Property Label <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Main Home, Rental, Office"
          className={inputBaseClass}
        />
      </div>

      <AddressAutocomplete
        value={formData}
        onChange={(address) => setFormData((previous) => ({ ...previous, ...address }))}
        inputClassName={inputBaseClass}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_106px] gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
        <div className="space-y-1.5">
          <label htmlFor="city" className="block text-sm font-medium text-slate-700">
            City <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="city"
            name="city"
            value={formData.city}
            onChange={handleChange}
            required
            placeholder="Princeton Junction"
            autoComplete="address-level2"
            className={inputBaseClass}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="state" className="block text-sm font-medium text-slate-700">
            State <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="state"
            name="state"
            value={formData.state}
            onChange={handleChange}
            required
            placeholder="NJ"
            maxLength={2}
            className={`${inputBaseClass} `}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="zipCode" className="block text-sm font-medium text-slate-700">
            ZIP Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="zipCode"
            name="zipCode"
            value={formData.zipCode}
            onChange={handleChange}
            required
            placeholder="08550"
            pattern="\d{5}"
            maxLength={5}
            inputMode="numeric"
            autoComplete="postal-code"
            className={inputBaseClass}
          />
        </div>

        <SelectInput
          label="Home type"
          name="dwellingType"
          value={formData.dwellingType}
          options={DWELLING_TYPE_OPTIONS}
          required
          placeholder="Select home type"
          optionLabels={DWELLING_TYPE_LABELS}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="yearBuilt" className="block text-sm font-medium text-slate-700">
            Year Built <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="yearBuilt"
            name="yearBuilt"
            value={formData.yearBuilt}
            onChange={handleChange}
            required
            placeholder="2020"
            pattern="\d{4}"
            maxLength={4}
            inputMode="numeric"
            autoComplete="off"
            className={inputBaseClass}
          />
        </div>
        <label
          htmlFor="isPrimary"
          className="flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5"
        >
          <input
            type="checkbox"
            id="isPrimary"
            name="isPrimary"
            checked={formData.isPrimary}
            onChange={handleChange}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-sm font-medium text-slate-800">This is my primary residence</span>
        </label>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Property Photo</p>
            <p className="text-xs text-slate-500">Optional. Used as the property cover image.</p>
          </div>
          {propertyPhotoFile ? <StatusChip tone="good">Ready</StatusChip> : <StatusChip tone="info">Optional</StatusChip>}
        </div>

        {propertyPhotoPreviewUrl ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img
              src={propertyPhotoPreviewUrl}
              alt="Property photo preview"
              className="h-40 w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        ) : null}

        <input
          ref={propertyPhotoInputRef}
          type="file"
          accept={ALLOWED_PROPERTY_PHOTO_TYPES.join(',')}
          className="hidden"
          onChange={handlePropertyPhotoChange}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => propertyPhotoInputRef.current?.click()}
            className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            {propertyPhotoFile ? 'Change Photo' : 'Upload Photo'}
          </button>
          {propertyPhotoFile ? (
            <button
              type="button"
              onClick={clearPropertyPhoto}
              className="min-h-[40px] rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50"
            >
              Remove
            </button>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">JPG, PNG, WEBP, or HEIC (max {MAX_PROPERTY_PHOTO_SIZE_MB}MB).</p>
      </div>
    </div>
  );

  const ApplianceInputList = (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Major Appliances</h3>
          <StatusChip tone="info">{majorAppliances.filter((asset) => asset.type && asset.installYear).length} tracked</StatusChip>
        </div>

        <div className="space-y-2.5">
            {majorAppliances.map((app) => (
                <div
                  key={app.id}
                  className="space-y-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_112px_auto] sm:items-end sm:gap-2.5 sm:space-y-0"
                >
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium tracking-normal text-slate-500">Appliance</label>
                        <select
                            value={app.type}
                            onChange={(e) => handleApplianceChange(app.id, 'type', e.target.value)}
                            className={selectBaseClass}
                        >
                            <option value="" disabled>Select Appliance</option>
                            {MAJOR_APPLIANCE_OPTIONS.map(option => (
                                <option key={option} value={option}>
                                    {option.replace(/_/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium tracking-normal text-slate-500">Install Year</label>
                        <input
                            type="text"
                            value={app.installYear}
                            onChange={(e) => handleApplianceChange(app.id, 'installYear', e.target.value)}
                            placeholder="YYYY"
                            pattern="\d{4}"
                            maxLength={4}
                            inputMode="numeric"
                            autoComplete="off"
                            className={inputBaseClass}
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => removeAppliance(app.id)}
                        className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 sm:mb-0.5"
                        aria-label="Remove appliance"
                    >
                        Remove
                    </button>
                </div>
            ))}
        </div>
        
        <button
            type="button"
            onClick={addAppliance}
            className="w-full min-h-[42px] rounded-xl border border-dashed border-teal-300 bg-white px-3 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
        >
            + Add appliance
        </button>
        <p className="text-xs text-slate-500">
            Optional, but helps improve home health and risk recommendations.
        </p>
    </div>
  );

  const requiredProgress = [
    Boolean(formData.address.trim()),
    Boolean(formData.city.trim()),
    Boolean(formData.state.trim()),
    Boolean(formData.zipCode.trim()),
    Boolean(formData.dwellingType),
    Boolean(formData.ownershipForm),
    Boolean(formData.propertyUse),
    Boolean(formData.occupancyStatus),
    Boolean(formData.yearBuilt),
  ];
  const completedRequired = requiredProgress.filter(Boolean).length;

  const completedApplianceCount = majorAppliances.filter((asset) => asset.type && asset.installYear).length;
  const optionalSignalCount = [
    formData.propertySize,
    formData.heatingType,
    formData.coolingType,
    formData.waterHeaterType,
    formData.roofType,
    Object.values(formData.responsibilities).some((party) => party !== 'UNKNOWN') ? 'RESPONSIBILITY' : null,
    formData.hvacInstallYear,
    formData.waterHeaterInstallYear,
    formData.roofReplacementYear,
    propertyPhotoFile ? 'PHOTO' : null,
  ].filter(Boolean).length + completedApplianceCount;
  const requiredCompletionRatio = completedRequired / requiredProgress.length;
  const requiredRemaining = requiredProgress.length - completedRequired;

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-3">
        <Link
          href="/dashboard/properties"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <MobilePageIntro
        title="Add property"
        subtitle="Unlock insights and planning tools."
        className="mb-4"
      />

      {error && (
        <MobileCard className="mb-4 border-red-200 bg-red-50 p-3.5">
          <p className="text-sm text-red-800">{error}</p>
        </MobileCard>
      )}

      <form id="add-property-form" onSubmit={handleSubmit} className="space-y-4">
        <MobileCard
          variant="compact"
          className="overflow-hidden border-slate-200/90 bg-[linear-gradient(145deg,#f8fbfb,#edf7f6)] shadow-[0_18px_36px_-32px_rgba(15,23,42,0.5)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-0 text-xl font-semibold tracking-tight text-slate-900">Setup Progress</p>
              <p className="mb-0 mt-1 text-sm text-slate-600">
                {requiredRemaining === 0
                  ? 'Required details complete.'
                  : `${requiredRemaining} required field${requiredRemaining === 1 ? '' : 's'} left`}
              </p>
            </div>
            <StatusChip tone={requiredRemaining === 0 ? 'good' : 'needsAction'}>
              {completedRequired} / {requiredProgress.length}
            </StatusChip>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-300"
              style={{ width: `${Math.max(requiredCompletionRatio * 100, 8)}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200/90 bg-white/80 px-3 py-2.5">
            <div>
              <p className="mb-0 text-[11px] tracking-normal text-slate-500">Required info</p>
              <p className="mb-0 mt-1 text-base font-semibold text-slate-900">{completedRequired} / {requiredProgress.length}</p>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <p className="mb-0 text-[11px] tracking-normal text-slate-500">Optional details</p>
              <p className="mb-0 mt-1 text-base font-semibold text-slate-900">{optionalSignalCount}</p>
            </div>
          </div>
          <p className="mb-0 mt-2 text-xs text-slate-500">
            {completedApplianceCount > 0
              ? `${completedApplianceCount} appliance${completedApplianceCount === 1 ? '' : 's'} added for richer insights.`
              : 'Add optional system and appliance details anytime.'}
          </p>
        </MobileCard>

        <ScenarioInputCard
          title="Property Basics"
          subtitle="Required details to create your property profile."
          badge={<StatusChip tone="needsAction">Required</StatusChip>}
        >
          {BasicAddressFields}
        </ScenarioInputCard>

        <ScenarioInputCard
          title="Advanced Details"
          subtitle="Optional details for better planning recommendations."
          badge={<StatusChip tone="info">Optional</StatusChip>}
          actions={
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex min-h-[42px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <span>{showAdvanced ? 'Hide advanced details' : 'Add advanced details'}</span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          }
        >
          {showAdvanced ? (
            <div className="space-y-6">
              <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="mb-0 text-base font-semibold text-slate-900">Systems</h3>
                    <p className="mb-0 mt-1 text-sm text-slate-600">
                      Confirm when major systems were installed. We only save a year after you choose an answer.
                    </p>
                  </div>
                  {/^\d{4}$/.test(formData.yearBuilt) && (
                    <button
                      type="button"
                      onClick={confirmAllSystemsOriginal}
                      className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      <CalendarCheck2 className="mr-2 h-4 w-4" />
                      All are original — use {formData.yearBuilt}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="propertySize" className="block text-sm font-medium text-slate-700">Property Size (sqft)</label>
                    <input type="number" id="propertySize" name="propertySize" value={formData.propertySize} onChange={handleChange} placeholder="e.g., 2500" inputMode="numeric" className={inputBaseClass} />
                  </div>
                  <SelectInput label="Heating Type" name="heatingType" value={formData.heatingType} options={HEATING_OPTIONS} />
                  <SelectInput label="Cooling Type" name="coolingType" value={formData.coolingType} options={COOLING_OPTIONS} />
                  <SelectInput label="Roof Type" name="roofType" value={formData.roofType} options={ROOF_OPTIONS} />
                  <SelectInput label="Water Heater Type" name="waterHeaterType" value={formData.waterHeaterType} options={WATER_HEATER_OPTIONS} />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  {([
                    ['hvacInstallYear', 'HVAC', 'When the heating or central cooling system was installed.'],
                    ['waterHeaterInstallYear', 'Water heater', 'When the current water heater was installed.'],
                    ['roofReplacementYear', 'Roof', 'When the roof was installed or last replaced.'],
                  ] as const).map(([key, label, description]) => {
                    const answer = systemYearAnswers[key];
                    return (
                      <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="min-h-[62px]">
                          <p className="mb-0 font-semibold text-slate-900">{label}</p>
                          <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">{description}</p>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={`${label} installation timing`}>
                          {([
                            ['ORIGINAL', 'Original'],
                            ['REPLACED', 'Later'],
                            ['UNKNOWN', 'Not sure'],
                          ] as const).map(([value, choiceLabel]) => {
                            const selected = answer === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setSystemYearAnswer(key, value)}
                                className={`min-h-[38px] rounded-lg border px-2 text-xs font-semibold transition-colors ${
                                  selected
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50'
                                }`}
                              >
                                {choiceLabel}
                              </button>
                            );
                          })}
                        </div>

                        {answer === 'ORIGINAL' && (
                          <div className="mt-3 flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-900">
                            <Check className="h-4 w-4 shrink-0" />
                            {formData.yearBuilt
                              ? <span><strong>{formData.yearBuilt}</strong> · confirmed as original</span>
                              : <span>Add the property year built first.</span>}
                          </div>
                        )}

                        {answer === 'REPLACED' && (
                          <div className="mt-3 space-y-1.5">
                            <label htmlFor={key} className="block text-xs font-medium text-slate-700">
                              Approximate install year
                            </label>
                            <input
                              type="text"
                              id={key}
                              name={key}
                              value={formData[key]}
                              onChange={handleChange}
                              placeholder="YYYY"
                              pattern="\d{4}"
                              maxLength={4}
                              inputMode="numeric"
                              autoComplete="off"
                              className={inputBaseClass}
                            />
                          </div>
                        )}

                        {answer === 'UNKNOWN' && (
                          <p className="mb-0 mt-3 min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-500">
                            We’ll keep this unknown and ask again only when the year affects a recommendation.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              <div className="space-y-5">
                <PropertyOwnershipResponsibilitySection
                  idPrefix="new-property"
                  ownershipForm={formData.ownershipForm}
                  propertyUse={formData.propertyUse}
                  occupancyStatus={formData.occupancyStatus}
                  responsibilities={formData.responsibilities}
                  onOwnershipFormChange={(value: OwnershipForm) => handleSelectChange('ownershipForm', value)}
                  onPropertyUseChange={(value: PropertyUse) => handleSelectChange('propertyUse', value)}
                  onOccupancyStatusChange={(value: OccupancyStatus) => handleSelectChange('occupancyStatus', value)}
                  onResponsibilitiesChange={(responsibilities) => setFormData((previous) => ({ ...previous, responsibilities }))}
                />

                <div id="exterior" className="grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-3 sm:grid-cols-2">
                  <BooleanInput label="Private outdoor space" name="hasPrivateOutdoorSpace" checked={formData.hasPrivateOutdoorSpace} />
                  <BooleanInput label="Lawn" name="hasLawn" checked={formData.hasLawn} />
                  <BooleanInput label="Trees or shrubs" name="hasTreesOrShrubs" checked={formData.hasTreesOrShrubs} />
                  <BooleanInput label="Driveway" name="hasDriveway" checked={formData.hasDriveway} />
                </div>

                {formData.hasPrivateOutdoorSpace && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Outdoor space types">
                    {OUTDOOR_SPACE_TYPE_OPTIONS.map((type) => (
                      <label key={type} className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                        <span className="pr-2 text-sm font-medium text-slate-700">{type.replace(/_/g, ' ')}</span>
                        <input
                          type="checkbox"
                          checked={formData.outdoorSpaceTypes.includes(type)}
                          onChange={(event) => handleOutdoorSpaceTypeChange(type, event.target.checked)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </label>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-3 sm:grid-cols-2">
                  <OptionalBooleanInput label="Smoke detectors" name="hasSmokeDetectors" value={formData.hasSmokeDetectors} />
                  <OptionalBooleanInput label="CO detectors" name="hasCoDetectors" value={formData.hasCoDetectors} />
                  <OptionalBooleanInput label="Security system" name="hasSecuritySystem" value={formData.hasSecuritySystem} />
                  <OptionalBooleanInput label="Fire extinguisher" name="hasFireExtinguisher" value={formData.hasFireExtinguisher} />
                  <BooleanInput label="Has Irrigation System" name="hasIrrigation" checked={formData.hasIrrigation} />
                  <BooleanInput label="Has Drainage Issues" name="hasDrainageIssues" checked={formData.hasDrainageIssues} />
                </div>
              </div>

              {ApplianceInputList}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Add systems, safety, and appliance details when you want richer recommendations.
            </p>
          )}
        </ScenarioInputCard>

        <MobileCard className="hidden border-slate-200/80 bg-white p-4 md:block">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] w-full rounded-xl bg-[#0D9488] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating Property...' : 'Create Property'}
            </button>
            <button
              type="button"
              onClick={handleSkipNow}
              className="min-h-[42px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
            >
              Skip for now
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Complete advanced details later from Edit Property.</p>
        </MobileCard>
      </form>

      <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:hidden">
        <div
          data-chat-collision-zone="true"
          className="space-y-2 rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-[0_22px_48px_-30px_rgba(15,23,42,0.92)] backdrop-blur"
        >
          <button
            type="button"
            onClick={openCozyChat}
            className="flex min-h-[42px] w-full items-center justify-between rounded-xl border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(20,184,166,0.2),transparent_45%),linear-gradient(120deg,#0f172a,#111827)] px-3 py-2 text-left text-white"
            aria-label="Ask Cozy about adding your property"
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium">Ask Cozy about your home setup</span>
            </span>
            <ChevronRight className="h-4 w-4 text-white/75" />
          </button>

          <button
            type="submit"
            form="add-property-form"
            disabled={submitting}
            className="min-h-[46px] w-full rounded-xl bg-[#0D9488] px-5 py-2.5 text-base font-semibold text-white transition-colors hover:bg-[#0F766E] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Creating Property...' : 'Create Property'}
          </button>

          <div className="flex items-center justify-between gap-3 px-1">
            <button
              type="button"
              onClick={handleSkipNow}
              className="min-h-[36px] rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
            >
              Skip for now
            </button>
            <p className="text-right text-xs text-slate-500">Complete advanced details later.</p>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <BottomSafeAreaReserve size="floatingAction" />
      </div>
    </div>
  );
}
