// apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx
'use client';

import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import {
  ActionPriorityRow,
  MobileCard,
  MobilePageIntro,
  ReadOnlySummaryBlock,
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

  const SelectInput = ({ label, name, value, options, required = false }: { 
    label: string, 
    name: keyof PropertyFormData, 
    value: string, 
    options: string[], 
    required?: boolean 
  }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => handleSelectChange(name, e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="">Select {label}</option>
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
    <div className="flex items-center">
      <input
        type="checkbox"
        id={name}
        name={name}
        checked={checked}
        onChange={handleChange}
        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
      />
      <label htmlFor={name} className="ml-3 text-sm font-medium text-gray-700">
        {label}
      </label>
    </div>
  );

  const BasicAddressFields = (
    <div className="space-y-5">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
          Property Name <span className="text-gray-500 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Main Home, Investment Property"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
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
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-2">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
          />
        </div>
      </div>

      <div>
        <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-2">
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
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SelectInput 
          label="Property Type" 
          name="propertyType" 
          value={formData.propertyType} 
          options={PROPERTY_TYPE_OPTIONS}
          required
        />

        <div>
          <label htmlFor="yearBuilt" className="block text-sm font-medium text-gray-700 mb-2">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="isPrimary"
          name="isPrimary"
          checked={formData.isPrimary}
          onChange={handleChange}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="isPrimary" className="ml-3 text-sm font-medium text-gray-700">
          This is my primary residence
        </label>
      </div>
    </div>
  );

  const ApplianceInputList = (
    <div className="border-t border-gray-200 pt-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-3">
            Major Appliance Ages
        </h3>
        
        <div className="space-y-4">
            {majorAppliances.map((app) => (
                <div key={app.id} className="flex gap-4 items-center bg-gray-50 p-3 rounded-md border border-gray-200">
                    
                    {/* Appliance Type Select */}
                    <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Appliance Type</label>
                        <select
                            value={app.type}
                            onChange={(e) => handleApplianceChange(app.id, 'type', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                        >
                            <option value="" disabled>Select Appliance</option>
                            {MAJOR_APPLIANCE_OPTIONS.map(option => (
                                <option key={option} value={option}>
                                    {option.replace(/_/g, ' ')}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Install Year Input */}
                    <div className="w-24">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Install Year</label>
                        <input
                            type="text"
                            value={app.installYear}
                            onChange={(e) => handleApplianceChange(app.id, 'installYear', e.target.value)}
                            placeholder="YYYY"
                            pattern="\d{4}"
                            maxLength={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    {/* Remove Button */}
                    <button
                        type="button"
                        onClick={() => removeAppliance(app.id)}
                        className="p-2 text-red-600 hover:text-red-800 transition-colors self-end mb-0.5"
                        aria-label="Remove appliance"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            ))}
        </div>
        
        <button
            type="button"
            onClick={addAppliance}
            className="w-full px-4 py-2 border border-dashed border-blue-400 text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
        >
            + Add Appliance
        </button>
        <p className="text-xs text-gray-500 mt-2">
            Providing this information improves the accuracy of your Health and Risk Scores.
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
  ].filter(Boolean).length + majorAppliances.filter((asset) => asset.type && asset.installYear).length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8">
      <MobilePageIntro
        title="Add New Property"
        subtitle="Tell us about your property to unlock personalized insights, scores, and planning tools."
        className="mb-4"
      />

      {error && (
        <MobileCard className="mb-4 border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </MobileCard>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <ReadOnlySummaryBlock
          title="Setup Summary"
          columns={2}
          items={[
            {
              label: 'Required fields',
              value: `${completedRequired} / ${requiredProgress.length}`,
              emphasize: true,
            },
            {
              label: 'Advanced signals',
              value: optionalSignalCount,
            },
            {
              label: 'Appliances added',
              value: majorAppliances.filter((asset) => asset.type && asset.installYear).length,
            },
            {
              label: 'Primary residence',
              value: formData.isPrimary ? 'Yes' : 'No',
            },
          ]}
        />

        <ScenarioInputCard
          title="Property Basics"
          subtitle="Required fields to create your property profile."
          badge={<StatusChip tone="needsAction">Required</StatusChip>}
        >
          {BasicAddressFields}
        </ScenarioInputCard>

        <ScenarioInputCard
          title="Advanced Property Details"
          subtitle="Optional details that improve score accuracy and recommendations."
          badge={<StatusChip tone="info">Optional</StatusChip>}
          actions={
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex min-h-[40px] w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              <span>{showAdvanced ? 'Hide advanced details' : 'Show advanced details'}</span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          }
        >
          {showAdvanced ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900">Risk & System Details</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label htmlFor="propertySize" className="mb-2 block text-sm font-medium text-gray-700">Square Footage (sqft)</label>
                    <input type="number" id="propertySize" name="propertySize" value={formData.propertySize} onChange={handleChange} placeholder="e.g., 2500" className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label htmlFor="hvacInstallYear" className="mb-2 block text-sm font-medium text-gray-700">HVAC Install Year</label>
                    <input type="text" id="hvacInstallYear" name="hvacInstallYear" value={formData.hvacInstallYear} onChange={handleChange} placeholder="e.g., 2018" pattern="\d{4}" maxLength={4} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label htmlFor="waterHeaterInstallYear" className="mb-2 block text-sm font-medium text-gray-700">Water Heater Install Year</label>
                    <input type="text" id="waterHeaterInstallYear" name="waterHeaterInstallYear" value={formData.waterHeaterInstallYear} onChange={handleChange} placeholder="e.g., 2020" pattern="\d{4}" maxLength={4} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label htmlFor="roofReplacementYear" className="mb-2 block text-sm font-medium text-gray-700">Roof Replacement Year</label>
                    <input type="text" id="roofReplacementYear" name="roofReplacementYear" value={formData.roofReplacementYear} onChange={handleChange} placeholder="e.g., 2010" pattern="\d{4}" maxLength={4} className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <SelectInput label="Heating Type" name="heatingType" value={formData.heatingType} options={HEATING_OPTIONS} />
                  <SelectInput label="Cooling Type" name="coolingType" value={formData.coolingType} options={COOLING_OPTIONS} />
                  <SelectInput label="Roof Type" name="roofType" value={formData.roofType} options={ROOF_OPTIONS} />
                  <SelectInput label="Water Heater Type" name="waterHeaterType" value={formData.waterHeaterType} options={WATER_HEATER_OPTIONS} />
                </div>
              </div>

              <div className="space-y-4 border-t border-gray-200 pt-5">
                <h3 className="text-sm font-semibold text-gray-900">Safety & Usage</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SelectInput label="Ownership Status" name="ownershipType" value={formData.ownershipType} options={OWNERSHIP_OPTIONS} />
                  <div>
                    <label htmlFor="occupantsCount" className="mb-2 block text-sm font-medium text-gray-700">Number of Occupants</label>
                    <input type="number" id="occupantsCount" name="occupantsCount" value={formData.occupantsCount} onChange={handleChange} placeholder="e.g., 4" className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 border-t border-gray-200 pt-5 sm:grid-cols-2 lg:grid-cols-3">
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
              Keep this collapsed for a fast setup, or expand to include systems, safety, and appliance details.
            </p>
          )}
        </ScenarioInputCard>

        <MobileCard className="border-slate-200/80 bg-white p-4">
          <ActionPriorityRow
            primaryAction={
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] w-full rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Creating Property...' : 'Create Property'}
              </button>
            }
            secondaryActions={
              <button
                type="button"
                onClick={handleSkipNow}
                className="min-h-[40px] rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-900 transition-colors hover:bg-yellow-100"
              >
                Skip for now
              </button>
            }
          />
          <p className="mt-2 text-xs text-slate-500">You can complete advanced fields later from Edit Property.</p>
        </MobileCard>
      </form>
    </div>
  );
}
