// apps/frontend/src/app/(dashboard)/dashboard/properties/new/page.tsx
'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { ChevronDown, ChevronUp } from 'lucide-react';

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

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
}

const PROPERTY_TYPE_OPTIONS = ['SINGLE_FAMILY', 'TOWNHOME', 'CONDO', 'APARTMENT', 'MULTI_UNIT', 'INVESTMENT_PROPERTY'];
const OWNERSHIP_OPTIONS = ['OWNER_OCCUPIED', 'RENTED_OUT'];
const HEATING_OPTIONS = ['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'UNKNOWN'];
const COOLING_OPTIONS = ['CENTRAL_AC', 'WINDOW_AC', 'UNKNOWN'];
const WATER_HEATER_OPTIONS = ['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN'];
const ROOF_OPTIONS = ['SHINGLE', 'TILE', 'FLAT', 'METAL', 'UNKNOWN'];

export default function NewPropertyPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

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
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const target = e.target as HTMLInputElement;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? target.checked : value,
    }));
  };
  
  const handleSelectChange = (name: keyof PropertyFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateBasicFields = () => {
    if (!formData.address.trim()) return 'Street Address is required.';
    if (!formData.city.trim()) return 'City is required.';
    if (!formData.state.trim() || formData.state.length !== 2) return 'State must be 2 characters (e.g., NJ).';
    if (!/^\d{5}$/.test(formData.zipCode)) return 'ZIP code must be 5 digits.';
    if (!formData.propertyType) return 'Property Type is required.';
    if (!/^\d{4}$/.test(formData.yearBuilt)) return 'Year Built must be a 4-digit year.';
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
    };

    setSubmitting(true);
    try {
      const response = await api.createProperty(payload);

      if (response.success) {
        // Clear skip flag on successful property creation
        localStorage.removeItem(PROPERTY_SETUP_SKIPPED_KEY);
        alert('Property created successfully! You can now complete the Advanced Profile for a full health score.');
        router.push('/dashboard/properties');
      } else {
        setError(response.message || 'Failed to create property');
      }
    } catch (error: any) {
      console.error('Failed to create property:', error);
      setError(error.message || 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // NEW: Handle skip action
  const handleSkip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Skip button clicked');
    localStorage.setItem(PROPERTY_SETUP_SKIPPED_KEY, 'true');
    console.log('Navigating to dashboard...');
    window.location.href = '/dashboard'; // Use direct navigation for reliability
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
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-3">Property Basics (Required)</h2>
      
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

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Add New Property</h1>
        <p className="mt-2 text-gray-600">
          Tell us about your property to get personalized maintenance insights and property health scores.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          {BasicAddressFields}
        </div>

        {/* Advanced Section (collapsed by default) */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <span className="text-lg font-semibold text-gray-900">Advanced Property Details</span>
              <span className="text-sm text-gray-500 font-normal">(Optional - for better health score)</span>
            </div>
            {showAdvanced ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
          </button>

          {showAdvanced && (
            <div className="p-6 space-y-8 bg-white border-t border-gray-200">
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-blue-700">General Details</h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <label htmlFor="propertySize" className="block text-sm font-medium text-gray-700 mb-2">
                      Square Footage
                    </label>
                    <input
                      type="number"
                      id="propertySize"
                      name="propertySize"
                      value={formData.propertySize}
                      onChange={handleChange}
                      placeholder="e.g., 2500"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <SelectInput 
                    label="Ownership Type" 
                    name="ownershipType" 
                    value={formData.ownershipType} 
                    options={OWNERSHIP_OPTIONS}
                  />
                  
                  <div>
                    <label htmlFor="occupantsCount" className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Occupants
                    </label>
                    <input
                      type="number"
                      id="occupantsCount"
                      name="occupantsCount"
                      value={formData.occupantsCount}
                      onChange={handleChange}
                      placeholder="e.g., 4"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold text-blue-700">Systems</h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <SelectInput label="Heating Type" name="heatingType" value={formData.heatingType} options={HEATING_OPTIONS} />
                  <SelectInput label="Cooling Type" name="coolingType" value={formData.coolingType} options={COOLING_OPTIONS} />
                  <SelectInput label="Water Heater Type" name="waterHeaterType" value={formData.waterHeaterType} options={WATER_HEATER_OPTIONS} />
                  <SelectInput label="Roof Type" name="roofType" value={formData.roofType} options={ROOF_OPTIONS} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold text-blue-700">Installation Years</h3>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                  <div>
                    <label htmlFor="hvacInstallYear" className="block text-sm font-medium text-gray-700 mb-2">
                      HVAC Install Year
                    </label>
                    <input
                      type="number"
                      id="hvacInstallYear"
                      name="hvacInstallYear"
                      value={formData.hvacInstallYear}
                      onChange={handleChange}
                      placeholder="2018"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="waterHeaterInstallYear" className="block text-sm font-medium text-gray-700 mb-2">
                      Water Heater Install Year
                    </label>
                    <input
                      type="number"
                      id="waterHeaterInstallYear"
                      name="waterHeaterInstallYear"
                      value={formData.waterHeaterInstallYear}
                      onChange={handleChange}
                      placeholder="2019"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="roofReplacementYear" className="block text-sm font-medium text-gray-700 mb-2">
                      Roof Replacement Year
                    </label>
                    <input
                      type="number"
                      id="roofReplacementYear"
                      name="roofReplacementYear"
                      value={formData.roofReplacementYear}
                      onChange={handleChange}
                      placeholder="2020"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold text-blue-700">Safety Features</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <BooleanInput label="Has Smoke Detectors" name="hasSmokeDetectors" checked={formData.hasSmokeDetectors} />
                  <BooleanInput label="Has CO Detectors" name="hasCoDetectors" checked={formData.hasCoDetectors} />
                  <BooleanInput label="Has Security System" name="hasSecuritySystem" checked={formData.hasSecuritySystem} />
                  <BooleanInput label="Has Fire Extinguisher" name="hasFireExtinguisher" checked={formData.hasFireExtinguisher} />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold text-blue-700">Exterior</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <BooleanInput label="Has Irrigation System" name="hasIrrigation" checked={formData.hasIrrigation} />
                  <BooleanInput label="Has Drainage Issues" name="hasDrainageIssues" checked={formData.hasDrainageIssues} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between bg-white rounded-lg shadow-md p-6">
          <button
            type="button"
            onClick={handleSkip}
            className="px-6 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Skip for Now
          </button>
          
          <button
            type="submit"
            disabled={submitting}
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating Property...' : 'Create Property'}
          </button>
        </div>
      </form>
    </div>
  );
}