'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api/client';

// Fix: Update Service interface to match API response (allow null values)
interface Service {
  id: string;
  category: string;
  inspectionType?: string | null;  // Changed: Added null
  handymanType?: string | null;    // Changed: Added null
  name: string;
  description: string;
  basePrice: string;
  priceUnit: string;
  minimumCharge?: string | null;   // Changed: Added null
  estimatedDuration?: number | null; // Changed: Added null
  isActive: boolean;
}

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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
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
        ...(formData.category === 'INSPECTION' && formData.inspectionType && {
          inspectionType: formData.inspectionType,
        }),
        ...(formData.category === 'HANDYMAN' && formData.handymanType && {
          handymanType: formData.handymanType,
        }),
        name: formData.name,
        description: formData.description,
        basePrice: parseFloat(formData.basePrice),
        priceUnit: formData.priceUnit,
        ...(formData.minimumCharge && {
          minimumCharge: parseFloat(formData.minimumCharge),
        }),
        ...(formData.estimatedDuration && {
          estimatedDuration: parseInt(formData.estimatedDuration),
        }),
        isActive: formData.isActive,
      };

      if (editingService) {
        // UPDATE existing service
        const response = await api.updateService(editingService.id, serviceData);
        
        if (response.success) {
          setSuccess('Service updated successfully!');
          setShowEditModal(false);
          setEditingService(null);
          resetForm();
          fetchServices();
          setTimeout(() => setSuccess(null), 3000);
        }
      } else {
        // CREATE new service
        const response = await api.createService(serviceData);
        
        if (response.success) {
          setSuccess('Service added successfully!');
          setShowAddModal(false);
          resetForm();
          fetchServices();
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (err: any) {
      console.error('Error saving service:', err);
      setError(err.response?.data?.message || 'Failed to save service');
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
    setShowEditModal(false);
    setEditingService(null);
    resetForm();
  };

  // Edit handler
  const handleEdit = (service: Service) => {
    setEditingService(service);
    setFormData({
      category: service.category,
      inspectionType: service.inspectionType || '',
      handymanType: service.handymanType || '',
      name: service.name,
      description: service.description,
      basePrice: service.basePrice,
      priceUnit: service.priceUnit,
      minimumCharge: service.minimumCharge || '',
      estimatedDuration: service.estimatedDuration?.toString() || '',
      isActive: service.isActive,
    });
    setShowEditModal(true);
  };

  // Delete handlers
  const handleDeleteClick = (service: Service) => {
    setDeletingService(service);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingService) return;

    try {
      setSaving(true);
      const response = await api.deleteService(deletingService.id);
      
      if (response.success) {
        // Remove from local state
        setServices(prev => prev.filter(s => s.id !== deletingService.id));
        setSuccess('Service deleted successfully!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Error deleting service:', err);
      setError(err.response?.data?.message || 'Failed to delete service');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
      setDeletingService(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingService(null);
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
      
      {error && !showAddModal && !showEditModal && (
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
              <p className="text-gray-600">No services added yet. Click "Add Service" to get started!</p>
            </div>
          ) : (
            services.map(service => (
              <div key={service.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                {/* Service Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{service.name}</h3>
                    <span className="inline-block mt-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded">
                      {service.category}
                    </span>
                  </div>
                  <span
                    className={`px-3 py-1 text-xs font-medium rounded-full ${
                      service.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {service.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Service Details */}
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{service.description}</p>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Base Price:</span>
                    <span className="font-semibold text-gray-900">
                      ${service.basePrice} {service.priceUnit}
                    </span>
                  </div>
                  
                  {service.minimumCharge && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Minimum Charge:</span>
                      <span className="font-semibold text-gray-900">${service.minimumCharge}</span>
                    </div>
                  )}

                  {service.estimatedDuration && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Duration:</span>
                      <span className="font-semibold text-gray-900">{service.estimatedDuration} min</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <button
                    onClick={() => toggleServiceStatus(service.id, service.isActive)}
                    className={`text-sm font-medium ${
                      service.isActive
                        ? 'text-gray-600 hover:text-gray-700'
                        : 'text-green-600 hover:text-green-700'
                    }`}
                  >
                    {service.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleEdit(service)}
                    className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteClick(service)}
                    className="text-sm text-red-600 hover:text-red-700 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add/Edit Service Modal */}
      {(showAddModal || showEditModal) && (
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
                  <h2 className="text-xl font-bold text-gray-900">
                    {editingService ? 'Edit Service' : 'Add New Service'}
                  </h2>
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
                  >
                    <option value="INSPECTION">Inspection</option>
                    <option value="HANDYMAN">Handyman</option>
                  </select>
                </div>

                {/* Inspection Type */}
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
                    >
                      <option value="">Select type...</option>
                      <option value="HOME_INSPECTION">Home Inspection</option>
                      <option value="PEST_INSPECTION">Pest Inspection</option>
                      <option value="RADON_TESTING">Radon Testing</option>
                      <option value="MOLD_INSPECTION">Mold Inspection</option>
                      <option value="WATER_QUALITY">Water Quality</option>
                      <option value="SEPTIC_INSPECTION">Septic Inspection</option>
                    </select>
                  </div>
                )}

                {/* Handyman Type */}
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
                    >
                      <option value="">Select type...</option>
                      <option value="MINOR_REPAIRS">Minor Repairs</option>
                      <option value="FIXTURE_INSTALLATION">Fixture Installation</option>
                      <option value="FURNITURE_ASSEMBLY">Furniture Assembly</option>
                      <option value="DRYWALL_REPAIR">Drywall Repair</option>
                      <option value="PAINTING">Painting</option>
                      <option value="ELECTRICAL">Electrical</option>
                      <option value="PLUMBING">Plumbing</option>
                      <option value="CARPENTRY">Carpentry</option>
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
                    rows={4}
                    placeholder="Describe what's included in this service..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Minimum 10 characters
                  </p>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Base Price * ($)
                    </label>
                    <input
                      type="number"
                      name="basePrice"
                      value={formData.basePrice}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price Unit *
                    </label>
                    <select
                      name="priceUnit"
                      value={formData.priceUnit}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="flat rate">Flat Rate</option>
                      <option value="per hour">Per Hour</option>
                      <option value="per square foot">Per Square Foot</option>
                    </select>
                  </div>
                </div>

                {/* Optional Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Charge ($)
                    </label>
                    <input
                      type="number"
                      name="minimumCharge"
                      value={formData.minimumCharge || ''}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      placeholder="Optional"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estimated Duration (minutes)
                    </label>
                    <input
                      type="number"
                      name="estimatedDuration"
                      value={formData.estimatedDuration || ''}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Optional"
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
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm text-gray-700">
                    Service is active and available to homeowners
                  </label>
                </div>

                {/* Submit Buttons */}
                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 py-3 px-4 bg-white border border-gray-300 text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-3 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : (editingService ? 'Update Service' : 'Add Service')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingService && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={handleDeleteCancel}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              {/* Icon */}
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>

              {/* Content */}
              <div className="mt-3 text-center">
                <h3 className="text-lg font-medium text-gray-900">Delete Service</h3>
                <div className="mt-2">
                  <p className="text-sm text-gray-500">
                    Are you sure you want to delete <strong>"{deletingService.name}"</strong>? 
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 flex space-x-3">
                <button
                  onClick={handleDeleteCancel}
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
