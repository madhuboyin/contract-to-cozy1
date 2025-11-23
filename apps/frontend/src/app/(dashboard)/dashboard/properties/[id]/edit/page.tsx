'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Define the shape of all form data fields, using strings for inputs, matching the new/page.tsx model
interface PropertyFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;

  // Layer 1
  propertyType: string;
  yearBuilt: string;
  
  // Layer 2
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
  
  // Layer 2 - Safety (Booleans)
  hasSmokeDetectors: boolean;
  hasCoDetectors: boolean;
  hasSecuritySystem: boolean;
  hasFireExtinguisher: boolean;
  
  // Layer 2 - Exterior (Booleans)
  hasIrrigation: boolean;
  hasDrainageIssues: boolean;
}

// Helper Constants (Copied from new/page.tsx for dependency reduction)
const PROPERTY_TYPE_OPTIONS = ['SINGLE_FAMILY', 'TOWNHOME', 'CONDO', 'APARTMENT', 'MULTI_UNIT', 'INVESTMENT_PROPERTY'];
const OWNERSHIP_OPTIONS = ['OWNER_OCCUPIED', 'RENTED_OUT'];
const HEATING_OPTIONS = ['HVAC', 'FURNACE', 'HEAT_PUMP', 'RADIATORS', 'UNKNOWN'];
const COOLING_OPTIONS = ['CENTRAL_AC', 'WINDOW_AC', 'UNKNOWN'];
const WATER_HEATER_OPTIONS = ['TANK', 'TANKLESS', 'HEAT_PUMP', 'SOLAR', 'UNKNOWN'];
const ROOF_OPTIONS = ['SHINGLE', 'TILE', 'FLAT', 'METAL', 'UNKNOWN'];


export default function EditPropertyPage() {
  const params = useParams();
  const router = useRouter();
  const propertyId = params.id as string;

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
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
    
    // Initializing all new fields
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

  useEffect(() => {
    loadProperty();
  }, [propertyId]);

  const loadProperty = async () => {
    try {
      const response = await api.getProperty(propertyId);
      if (response.success) {
        const prop = response.data;
        setProperty(prop);
        
        // Populate ALL fields from the API response
        setFormData({
          name: prop.name || '',
          address: prop.address,
          city: prop.city,
          state: prop.state,
          zipCode: prop.zipCode,
          isPrimary: prop.isPrimary,
          
          // Layer 1 fields
          propertyType: prop.propertyType || '',
          yearBuilt: prop.yearBuilt?.toString() || '',
          
          // Layer 2 fields - ensure numbers/enums are safely converted to form strings
          propertySize: prop.propertySize?.toString() || '',
          ownershipType: prop.ownershipType || '',
          occupantsCount: prop.occupantsCount?.toString() || '',
          heatingType: prop.heatingType || '',
          coolingType: prop.coolingType || '',
          waterHeaterType: prop.waterHeaterType || '',
          roofType: prop.roofType || '',
          hvacInstallYear: prop.hvacInstallYear?.toString() || '',
          waterHeaterInstallYear: prop.waterHeaterInstallYear?.toString() || '',
          roofReplacementYear: prop.roofReplacementYear?.toString() || '',
          
          // Booleans (handle null/undefined from API)
          hasSmokeDetectors: prop.hasSmokeDetectors ?? false,
          hasCoDetectors: prop.hasCoDetectors ?? false,
          hasSecuritySystem: prop.hasSecuritySystem ?? false,
          hasFireExtinguisher: prop.hasFireExtinguisher ?? false,
          hasIrrigation: prop.hasIrrigation ?? false,
          hasDrainageIssues: prop.hasDrainageIssues ?? false,
        });
      } else {
        setError('Property not found');
      }
    } catch (error) {
      console.error('Failed to load property:', error);
      setError('Failed to load property');
    } finally {
      setLoading(false);
    }
  };

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
    // Note: Validation is slightly relaxed on edit page compared to create, 
    // but mandatory fields like address still need to be checked if edited/cleared.
    if (!formData.address.trim()) return 'Street Address is required.';
    if (!formData.city.trim()) return 'City is required.';
    if (!formData.state.trim() || formData.state.length !== 2) return 'State must be 2 characters (e.g., NJ).';
    if (!/^\d{5}$/.test(formData.zipCode)) return 'ZIP code must be 5 digits.';
    if (formData.propertyType && !PROPERTY_TYPE_OPTIONS.includes(formData.propertyType)) return 'Invalid Property Type selected.';
    if (formData.yearBuilt && !/^\d{4}$/.test(formData.yearBuilt)) return 'Year Built must be a 4-digit year.';
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
    
    // Prepare the payload for API update. Only send fields that exist in the form data.
    const payload = {
      name: formData.name.trim() || undefined,
      address: formData.address.trim(),
      city: formData.city.trim(),
      state: formData.state.trim().toUpperCase(),
      zipCode: formData.zipCode.trim(),
      isPrimary: formData.isPrimary,
      
      // Layer 1 & 2 fields - Convert/Sanitize. Use || undefined to treat empty strings as null in API
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
      
      // Booleans are passed directly
      hasSmokeDetectors: formData.hasSmokeDetectors,
      hasCoDetectors: formData.hasCoDetectors,
      hasSecuritySystem: formData.hasSecuritySystem,
      hasFireExtinguisher: formData.hasFireExtinguisher,
      hasIrrigation: formData.hasIrrigation,
      hasDrainageIssues: formData.hasDrainageIssues,
      
      // Omit empty fields where possible (Backend handles PATCH by only looking at defined keys)
    };

    setSubmitting(true);
    try {
      const response = await api.updateProperty(propertyId, payload);

      if (response.success) {
        alert('Property updated successfully!');
        router.push('/dashboard/properties');
      } else {
        setError(response.message || 'Failed to update property');
      }
    } catch (error) {
      console.error('Failed to update property:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Helper Components for UI Reusability (Copied from new/page.tsx) ---
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
  // -------------------------------------------------------------------------


  // --- UI Sections ---
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

      {/* Address Fields */}
      <div>
        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">Street Address *</label>
        <input type="text" id="address" name="address" value={formData.address} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">City *</label>
          <input type="text" id="city" name="city" value={formData.city} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-2">State *</label>
          <input type="text" id="state" name="state" value={formData.state} onChange={handleChange} maxLength={2} required className="w-full px-3 py-2 border border-gray-300 rounded-md uppercase" />
        </div>

        <div>
          <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-2">ZIP Code *</label>
          <input type="text" id="zipCode" name="zipCode" value={formData.zipCode} onChange={handleChange} maxLength={5} pattern="\d{5}" required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
        </div>
      </div>
      
      {/* New Basic Fields: Property Type, Year Built */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SelectInput 
          label="Property Type" 
          name="propertyType" 
          value={formData.propertyType} 
          options={PROPERTY_TYPE_OPTIONS} 
        />
        
        <div>
          <label htmlFor="yearBuilt" className="block text-sm font-medium text-gray-700 mb-2">
            Year Built
          </label>
          <input
            type="number"
            id="yearBuilt"
            name="yearBuilt"
            value={formData.yearBuilt}
            onChange={handleChange}
            placeholder="e.g., 1995"
            maxLength={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
  
  const AdvancedDetailsAccordion = (
    <div className="border border-gray-200 rounded-lg mt-6">
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full flex justify-between items-center p-4 text-left bg-gray-50 hover:bg-gray-100 transition duration-150 rounded-t-lg"
      >
        <div className="flex flex-col">
          <span className="text-lg font-semibold text-gray-800">Advanced Property Details</span>
          <span className="text-sm text-gray-500">
            Edit details for Property Health Score & Maintenance
          </span>
        </div>
        {showAdvanced ? <ChevronUp className="w-5 h-5 text-gray-600" /> : <ChevronDown className="w-5 h-5 text-gray-600" />}
      </button>

      {showAdvanced && (
        <div className="p-6 space-y-8 bg-white border-t border-gray-200">

          {/* Section: General Details */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-blue-700">General Details</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
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
          
          {/* Section: Systems Snapshot */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-blue-700">Systems & Age Snapshot</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <SelectInput label="Heating Type" name="heatingType" value={formData.heatingType} options={HEATING_OPTIONS} />
              <SelectInput label="Cooling Type" name="coolingType" value={formData.coolingType} options={COOLING_OPTIONS} />
              <SelectInput label="Water Heater Type" name="waterHeaterType" value={formData.waterHeaterType} options={WATER_HEATER_OPTIONS} />
            </div>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label htmlFor="hvacInstallYear" className="block text-sm font-medium text-gray-700 mb-2">
                  HVAC Installation Year
                </label>
                <input
                  type="number"
                  id="hvacInstallYear"
                  name="hvacInstallYear"
                  value={formData.hvacInstallYear}
                  onChange={handleChange}
                  placeholder="e.g., 2018"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="waterHeaterInstallYear" className="block text-sm font-medium text-gray-700 mb-2">
                  Water Heater Installation Year
                </label>
                <input
                  type="number"
                  id="waterHeaterInstallYear"
                  name="waterHeaterInstallYear"
                  value={formData.waterHeaterInstallYear}
                  onChange={handleChange}
                  placeholder="e.g., 2022"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>
          
          {/* Section: Structure */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-blue-700">Structure</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <SelectInput label="Roof Type" name="roofType" value={formData.roofType} options={ROOF_OPTIONS} />
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
                  placeholder="e.g., 2010"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>

          {/* Section: Safety */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-blue-700">Safety Checks</h3>
            <div className="grid grid-cols-2 gap-4">
              <BooleanInput label="Smoke Detectors available" name="hasSmokeDetectors" checked={formData.hasSmokeDetectors} />
              <BooleanInput label="CO Detectors available" name="hasCoDetectors" checked={formData.hasCoDetectors} />
              <BooleanInput label="Security System installed" name="hasSecuritySystem" checked={formData.hasSecuritySystem} />
              <BooleanInput label="Fire Extinguisher available" name="hasFireExtinguisher" checked={formData.hasFireExtinguisher} />
            </div>
          </div>
          
          {/* Section: Exterior */}
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-blue-700">Exterior & Utilities</h3>
            <div className="grid grid-cols-2 gap-4">
              <BooleanInput label="Lawn / Irrigation System present" name="hasIrrigation" checked={formData.hasIrrigation} />
              <BooleanInput label="Known Drainage Issues" name="hasDrainageIssues" checked={formData.hasDrainageIssues} />
              {/* Lot size input omitted for brevity, similar to other numerical inputs */}
            </div>
          </div>

        </div>
      )}
    </div>
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900 flex items-center mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Properties
        </button>
        
        <h1 className="text-2xl font-bold text-gray-900">Add New Property</h1>
        <p className="mt-1 text-sm text-gray-600">
          Start with the basics to get immediate service access, then unlock your full Property Health Score with advanced details.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
        {BasicAddressFields}
        
        {AdvancedDetailsAccordion}

        {/* Primary property checkbox (from original requirements) */}
        <div className="flex items-start pt-4 border-t border-gray-200">
          <div className="flex items-center h-5">
            <input
              type="checkbox"
              id="isPrimary"
              name="isPrimary"
              checked={formData.isPrimary}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
          </div>
          <div className="ml-3">
            <label htmlFor="isPrimary" className="text-sm font-medium text-gray-700">
              Set as primary property
            </label>
            <p className="text-sm text-gray-500">
              Your primary property will be selected by default when booking services
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Property & Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}