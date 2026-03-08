// apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx
'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Sparkles } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  BottomSafeAreaReserve,
  MobileCard,
  MobilePageIntro,
  ScenarioInputCard,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';

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
  propertyType: string;
  yearBuilt: string;
  propertySize: string;
  ownershipType: string;
  occupantsCount: string;
  heatingType: string;
  coolingType: string;
  waterHeaterType: string;
  roofType: string;
  hvacInstallYear: string;
  waterHeaterInstallYear: string;
  roofReplacementYear: string;
  hasSmokeDetectors: boolean;
  hasCoDetectors: boolean;
  hasSecuritySystem: boolean;
  hasFireExtinguisher: boolean;
  hasIrrigation: boolean;
  hasDrainageIssues: boolean;
  // REMOVED: applianceAges: string; (Managed internally by majorAppliances state)
}

const PROPERTY_TYPE_OPTIONS = ['SINGLE_FAMILY', 'TOWNHOME', 'CONDO', 'APARTMENT', 'MULTI_UNIT', 'INVESTMENT_PROPERTY'];
const OWNERSHIP_OPTIONS = ['OWNER_OCCUPIED', 'RENTED_OUT'];
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

function openCozyChat() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('cozy-chat-open'));
}

export default function NewPropertyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // NEW STATE: Structured input for appliances (empty array initially)
  const [majorAppliances, setMajorAppliances] = useState<ApplianceInput[]>([]);

  const [formData, setFormData] = useState<PropertyFormData>({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    isPrimary: false,
    propertyType: '',
    yearBuilt: '',
    propertySize: '',
    ownershipType: '',
    occupantsCount: '',
    heatingType: '',
    coolingType: '',
    waterHeaterType: '',
    roofType: '',
    hvacInstallYear: '',
    waterHeaterInstallYear: '',
    roofReplacementYear: '',
    hasSmokeDetectors: false,
    hasCoDetectors: false,
    hasSecuritySystem: false,
    hasFireExtinguisher: false,
    hasIrrigation: false,
    hasDrainageIssues: false,
    // REMOVED: applianceAges: '',
  });

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


  const validateBasicFields = () => {
    if (!formData.address.trim()) return 'Street Address is required.';
    if (!formData.city.trim()) return 'City is required.';
    if (!formData.state.trim() || formData.state.length !== 2) return 'State must be 2 characters (e.g., NJ).';
    if (!/^\d{5}$/.test(formData.zipCode)) return 'ZIP code must be 5 digits.';
    if (!formData.propertyType) return 'Property Type is required.';
    if (!/^\d{4}$/.test(formData.yearBuilt)) return 'Year Built must be a 4-digit year.';

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
    
    // FIXED: Convert structured appliances array to backend's expected homeAssets format
    const homeAssetsPayload = majorAppliances
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
      
      propertyType: formData.propertyType || undefined,
      yearBuilt: parseInt(formData.yearBuilt) || undefined,
      propertySize: parseInt(formData.propertySize) || undefined,
      ownershipType: formData.ownershipType || undefined,
      occupantsCount: parseInt(formData.occupantsCount) || undefined,
      heatingType: formData.heatingType || undefined,
      coolingType: formData.coolingType || undefined,
      waterHeaterType: formData.waterHeaterType || undefined,
      roofType: formData.roofType || undefined,
      hvacInstallYear: parseInt(formData.hvacInstallYear) || undefined,
      waterHeaterInstallYear: parseInt(formData.waterHeaterInstallYear) || undefined,
      roofReplacementYear: parseInt(formData.roofReplacementYear) || undefined,
      
      hasSmokeDetectors: formData.hasSmokeDetectors,
      hasCoDetectors: formData.hasCoDetectors,
      hasSecuritySystem: formData.hasSecuritySystem,
      hasFireExtinguisher: formData.hasFireExtinguisher,
      hasIrrigation: formData.hasIrrigation,
      hasDrainageIssues: formData.hasDrainageIssues,

      // FIXED: Send homeAssets array to backend
      homeAssets: homeAssetsPayload.length > 0 ? homeAssetsPayload : undefined,
    };

    setSubmitting(true);
    try {
      const response = await api.createProperty(payload);

      if (response.success) {
        localStorage.removeItem(PROPERTY_SETUP_SKIPPED_KEY);
        toast({ title: 'Property created successfully!' });
        if (response.data?.id) {
          router.push(`/dashboard/properties/${response.data.id}`);
        } else {
          router.push('/dashboard/properties');
        }
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

  const SelectInput = ({ label, name, value, options, required = false, placeholder }: {
    label: string, 
    name: keyof PropertyFormData, 
    value: string, 
    options: string[], 
    required?: boolean,
    placeholder?: string,
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
            {option.replace(/_/g, ' ')}
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

      <div className="space-y-1.5">
        <label htmlFor="address" className="block text-sm font-medium text-slate-700">
          Street Address <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="address"
          name="address"
          value={formData.address}
          onChange={handleChange}
          required
          placeholder="123 Main St"
          className={inputBaseClass}
        />
      </div>

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
            className={`${inputBaseClass} uppercase`}
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
            className={inputBaseClass}
          />
        </div>

        <SelectInput 
          label="Property Type" 
          name="propertyType" 
          value={formData.propertyType} 
          options={PROPERTY_TYPE_OPTIONS}
          required
          placeholder="Select property type"
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
                        <label className="block text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Appliance</label>
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
                        <label className="block text-xs font-medium uppercase tracking-[0.08em] text-slate-500">Install Year</label>
                        <input
                            type="text"
                            value={app.installYear}
                            onChange={(e) => handleApplianceChange(app.id, 'installYear', e.target.value)}
                            placeholder="YYYY"
                            pattern="\d{4}"
                            maxLength={4}
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
            + Add Appliance
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
    Boolean(formData.propertyType),
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
    formData.occupantsCount,
    formData.ownershipType,
    formData.hvacInstallYear,
    formData.waterHeaterInstallYear,
    formData.roofReplacementYear,
  ].filter(Boolean).length + completedApplianceCount;
  const requiredCompletionRatio = completedRequired / requiredProgress.length;
  const requiredRemaining = requiredProgress.length - completedRequired;

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
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
        title="Add Property"
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
              <p className="mb-0 text-[11px] uppercase tracking-[0.08em] text-slate-500">Required info</p>
              <p className="mb-0 mt-1 text-base font-semibold text-slate-900">{completedRequired} / {requiredProgress.length}</p>
            </div>
            <div className="border-l border-slate-200 pl-3">
              <p className="mb-0 text-[11px] uppercase tracking-[0.08em] text-slate-500">Optional details</p>
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
            <div className="space-y-3.5">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <h3 className="mb-0 text-sm font-semibold text-slate-900">Systems</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="propertySize" className="block text-sm font-medium text-slate-700">Property Size (sqft)</label>
                    <input type="number" id="propertySize" name="propertySize" value={formData.propertySize} onChange={handleChange} placeholder="e.g., 2500" className={inputBaseClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="hvacInstallYear" className="block text-sm font-medium text-slate-700">HVAC Install Year</label>
                    <input type="text" id="hvacInstallYear" name="hvacInstallYear" value={formData.hvacInstallYear} onChange={handleChange} placeholder="e.g., 2018" pattern="\d{4}" maxLength={4} className={inputBaseClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="waterHeaterInstallYear" className="block text-sm font-medium text-slate-700">Water Heater Install Year</label>
                    <input type="text" id="waterHeaterInstallYear" name="waterHeaterInstallYear" value={formData.waterHeaterInstallYear} onChange={handleChange} placeholder="e.g., 2020" pattern="\d{4}" maxLength={4} className={inputBaseClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="roofReplacementYear" className="block text-sm font-medium text-slate-700">Roof Replacement Year</label>
                    <input type="text" id="roofReplacementYear" name="roofReplacementYear" value={formData.roofReplacementYear} onChange={handleChange} placeholder="e.g., 2010" pattern="\d{4}" maxLength={4} className={inputBaseClass} />
                  </div>
                  <SelectInput label="Heating Type" name="heatingType" value={formData.heatingType} options={HEATING_OPTIONS} />
                  <SelectInput label="Cooling Type" name="coolingType" value={formData.coolingType} options={COOLING_OPTIONS} />
                  <SelectInput label="Roof Type" name="roofType" value={formData.roofType} options={ROOF_OPTIONS} />
                  <SelectInput label="Water Heater Type" name="waterHeaterType" value={formData.waterHeaterType} options={WATER_HEATER_OPTIONS} />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                <h3 className="mb-0 text-sm font-semibold text-slate-900">Safety & Usage</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SelectInput label="Ownership Status" name="ownershipType" value={formData.ownershipType} options={OWNERSHIP_OPTIONS} />
                  <div className="space-y-1.5">
                    <label htmlFor="occupantsCount" className="block text-sm font-medium text-slate-700">Occupants</label>
                    <input type="number" id="occupantsCount" name="occupantsCount" value={formData.occupantsCount} onChange={handleChange} placeholder="e.g., 4" className={inputBaseClass} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 border-t border-slate-200 pt-3 sm:grid-cols-2">
                  <BooleanInput label="Has Smoke Detectors" name="hasSmokeDetectors" checked={formData.hasSmokeDetectors} />
                  <BooleanInput label="Has CO Detectors" name="hasCoDetectors" checked={formData.hasCoDetectors} />
                  <BooleanInput label="Has Security System" name="hasSecuritySystem" checked={formData.hasSecuritySystem} />
                  <BooleanInput label="Has Fire Extinguisher" name="hasFireExtinguisher" checked={formData.hasFireExtinguisher} />
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
