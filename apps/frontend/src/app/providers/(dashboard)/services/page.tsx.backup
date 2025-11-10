// apps/frontend/src/app/providers/(dashboard)/services/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';
import { Service } from '@/types';

// Service Categories and Types
const SERVICE_CATEGORIES = [
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'HANDYMAN', label: 'Handyman' },
];

const INSPECTION_TYPES = [
  { value: 'HOME_INSPECTION', label: 'Home Inspection' },
  { value: 'PEST_INSPECTION', label: 'Pest Inspection' },
  { value: 'RADON_TESTING', label: 'Radon Testing' },
  { value: 'MOLD_INSPECTION', label: 'Mold Inspection' },
  { value: 'WELL_SEPTIC_INSPECTION', label: 'Well & Septic Inspection' },
  { value: 'ROOF_INSPECTION', label: 'Roof Inspection' },
  { value: 'FOUNDATION_INSPECTION', label: 'Foundation Inspection' },
  { value: 'ELECTRICAL_INSPECTION', label: 'Electrical Inspection' },
  { value: 'PLUMBING_INSPECTION', label: 'Plumbing Inspection' },
];

const HANDYMAN_TYPES = [
  { value: 'MINOR_REPAIRS', label: 'Minor Repairs' },
  { value: 'FIXTURE_INSTALLATION', label: 'Fixture Installation' },
  { value: 'FURNITURE_ASSEMBLY', label: 'Furniture Assembly' },
  { value: 'DRYWALL_REPAIR', label: 'Drywall Repair' },
  { value: 'DOOR_WINDOW_REPAIR', label: 'Door & Window Repair' },
  { value: 'DECK_FENCE_REPAIR', label: 'Deck & Fence Repair' },
  { value: 'GENERAL_MAINTENANCE', label: 'General Maintenance' },
  { value: 'PAINTING_TOUCHUP', label: 'Painting & Touch-up' },
  { value: 'CAULKING_SEALING', label: 'Caulking & Sealing' },
];

const PRICE_UNITS = [
  { value: 'flat rate', label: 'Flat Rate' },
  { value: 'per hour', label: 'Per Hour' },
  { value: 'per sqft', label: 'Per Square Foot' },
];

// Using Service type from @/types

interface ServiceFormData {
  category: string;
  inspectionType?: string;
  handymanType?: string;
  name: string;
  description: string;
  basePrice: string;
  priceUnit: string;
  minimumCharge?: string;
  estimatedDuration?: string;
  isActive: boolean;
}

export default function ProviderServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<ServiceFormData>({
    category: 'INSPECTION',
    name: '',
    description: '',
    basePrice: '',
    priceUnit: 'flat rate',
    isActive: true,
  });

  // Fetch services on load
  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await api.getMyServices();
      
      if (response.success) {
        setServices(response.data);
      }
    } catch (err: any) {
      console.error('Error fetching services:', err);
      setError('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value;
    setFormData(prev => ({
      ...prev,
      category,
      inspectionType: category === 'INSPECTION' ? '' : undefined,
      handymanType: category === 'HANDYMAN' ? '' : undefined,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Service name is required');
      return false;
    }

    if (!formData.description.trim() || formData.description.length < 10) {
      setError('Description must be at least 10 characters');
      return false;
    }

    if (!formData.basePrice || parseFloat(formData.basePrice) <= 0) {
      setError('Base price must be greater than 0');
      return false;
    }

    if (formData.category === 'INSPECTION' && !formData.inspectionType) {
      setError('Please select an inspection type');
      return false;
    }

    if (formData.category === 'HANDYMAN' && !formData.handymanType) {
      setError('Please select a handyman type');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);

      // Prepare data for API
      const serviceData = {
        category: formData.category,
        ...(formData.category === 'INSPECTION' && { inspectionType: formData.inspectionType }),
        ...(formData.category === 'HANDYMAN' && { handymanType: formData.handymanType }),
        name: formData.name,
        description: formData.description,
        basePrice: parseFloat(formData.basePrice),
        priceUnit: formData.priceUnit,
        ...(formData.minimumCharge && { minimumCharge: parseFloat(formData.minimumCharge) }),
        ...(formData.estimatedDuration && { estimatedDuration: parseInt(formData.estimatedDuration) }),
        isActive: formData.isActive,
      };

      const response = await api.createService(serviceData);

      if (response.success) {
        setSuccess('Service added successfully!');
        setShowAddModal(false);
        resetForm();
        fetchServices(); // Refresh the list
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Error adding service:', err);
      setError(err.response?.data?.message || 'Failed to add service');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: 'INSPECTION',
      name: '',
      description: '',
      basePrice: '',
      priceUnit: 'flat rate',
      isActive: true,
    });
    setError(null);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    resetForm();
  };

  const toggleServiceStatus = async (serviceId: string, currentStatus: boolean) => {
    try {
      await api.updateService(serviceId, {
        isActive: !currentStatus,
      });
      
      // Update local state
      setServices(prev =>
        prev.map(service =>
          service.id === serviceId ? { ...service, isActive: !currentStatus } : service
        )
      );
      
      setSuccess(`Service ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error toggling service status:', err);
      setError('Failed to update service status');
      setTimeout(() => setError(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}
      
      {error && !showAddModal && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Services</h1>
          <p className="mt-2 text-gray-600">Manage the services you offer to homeowners</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          + Add Service
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading services...</p>
        </div>
      )}

      {/* Services Grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.length === 0 ? (
            <div className="col-span-2 text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-600">No services added yet. Click "Add Service" to get started.</p>
            </div>
          ) : (
            services.map((service) => (
              <div key={service.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-semibold text-gray-900">{service.name}</h3>
                      {service.isActive ? (
                        <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {service.category === 'INSPECTION' ? 'Inspection' : 'Handyman'} • {service.inspectionType || service.handymanType}
                    </p>
                    <p className="mt-3 text-sm text-gray-700">{service.description}</p>
                    <div className="mt-4 flex items-center space-x-4 text-sm">
                      <span className="font-semibold text-gray-900">
                        ${service.basePrice} <span className="font-normal text-gray-600">{service.priceUnit}</span>
                      </span>
                      {service.estimatedDuration && (
                        <span className="text-gray-600">
                          ~{service.estimatedDuration} min
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="mt-4 flex items-center space-x-3">
                  <button
                    onClick={() => toggleServiceStatus(service.id, service.isActive)}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {service.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button className="text-sm text-gray-600 hover:text-gray-700 font-medium">
                    Edit
                  </button>
                  <button className="text-sm text-red-600 hover:text-red-700 font-medium">
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add Service Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={handleCloseModal}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Add New Service</h2>
                  <button
                    onClick={handleCloseModal}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-6 py-4 space-y-6">
                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                {/* Service Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Category *
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleCategoryChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    {SERVICE_CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Inspection Type or Handyman Type */}
                {formData.category === 'INSPECTION' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Inspection Type *
                    </label>
                    <select
                      name="inspectionType"
                      value={formData.inspectionType || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select inspection type...</option>
                      {INSPECTION_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {formData.category === 'HANDYMAN' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Handyman Type *
                    </label>
                    <select
                      name="handymanType"
                      value={formData.handymanType || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select handyman type...</option>
                      {HANDYMAN_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Service Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Complete Home Inspection"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Describe what's included in this service..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum 10 characters ({formData.description.length}/10)
                  </p>
                </div>

                {/* Pricing Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Base Price */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Base Price *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">$</span>
                      <input
                        type="number"
                        name="basePrice"
                        value={formData.basePrice}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>

                  {/* Price Unit */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price Unit *
                    </label>
                    <select
                      name="priceUnit"
                      value={formData.priceUnit}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {PRICE_UNITS.map(unit => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Optional Fields Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Minimum Charge */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Charge (optional)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-gray-500">$</span>
                      <input
                        type="number"
                        name="minimumCharge"
                        value={formData.minimumCharge || ''}
                        onChange={handleInputChange}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Estimated Duration */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estimated Duration (minutes)
                    </label>
                    <input
                      type="number"
                      name="estimatedDuration"
                      value={formData.estimatedDuration || ''}
                      onChange={handleInputChange}
                      placeholder="e.g., 120"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Active Status */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label className="ml-2 block text-sm text-gray-700">
                    Make this service active immediately
                  </label>
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Adding Service...' : 'Add Service'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
