'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api/client';
import {
  ActionPriorityRow,
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  ReadOnlySummaryBlock,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';

interface Service {
  id: string;
  category: string;
  inspectionType?: string | null;
  handymanType?: string | null;
  name: string;
  description: string;
  basePrice: string;
  priceUnit: string;
  minimumCharge?: string | null;
  estimatedDuration?: number | null;
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

  useEffect(() => {
    fetchServices();
  }, []);

  const counts = useMemo(() => {
    const active = services.filter((service) => service.isActive).length;
    const inspection = services.filter((service) => service.category === 'INSPECTION').length;
    const handyman = services.filter((service) => service.category === 'HANDYMAN').length;
    return { active, inspection, handyman };
  }, [services]);

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

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value;
    setFormData((prev) => ({
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
        setServices((prev) => prev.filter((service) => service.id !== deletingService.id));
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

      setServices((prev) =>
        prev.map((service) =>
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
    <>
      <ProviderShellTemplate
        title="Services"
        subtitle="Manage your service catalog, pricing clarity, and active availability."
        eyebrow="Provider Catalog"
        introAction={
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            + Add service
          </button>
        }
        primaryAction={{
          title: services.length > 0 ? 'Keep your top service pricing current.' : 'Create your first service listing.',
          description:
            services.length > 0
              ? 'Updated pricing and service scope reduce homeowner confusion and improve booking conversion.'
              : 'A complete service listing is required before homeowners can confidently book your business.',
          primaryAction: (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              {services.length > 0 ? 'Add another service' : 'Add first service'}
            </button>
          ),
          impactLabel: services.length > 0 ? 'High trust impact' : 'Critical setup step',
          confidenceLabel: `${counts.active}/${services.length || 1} services active`,
        }}
        trust={{
          confidenceLabel: 'Catalog quality is scored from service detail completeness, pricing clarity, and active status.',
          freshnessLabel: 'Trust signals refresh each time service details, pricing, or status changes.',
          sourceLabel: 'Provider service records, pricing details, and activity timestamps.',
          rationale: 'Clear service definitions and current pricing reduce homeowner decision friction.',
        }}
        summary={
          <MobileKpiStrip className="sm:grid-cols-3">
            <MobileKpiTile label="Active" value={counts.active} hint="Visible to homeowners" tone={counts.active > 0 ? 'positive' : 'neutral'} />
            <MobileKpiTile label="Inspection" value={counts.inspection} hint="Inspection services" />
            <MobileKpiTile label="Handyman" value={counts.handyman} hint="Handyman services" />
          </MobileKpiStrip>
        }
        routeState={
          loading
            ? {
                state: 'loading',
                title: 'Loading service catalog',
                description: 'Fetching your provider services and pricing records.',
              }
            : null
        }
        hideContentWhenState={loading}
      >
        {success ? (
          <MobileCard variant="compact" className="border-emerald-200 bg-emerald-50 text-emerald-800">
            {success}
          </MobileCard>
        ) : null}

        {error && !showAddModal && !showEditModal ? (
          <MobileCard variant="compact" className="border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </MobileCard>
        ) : null}

        {services.length === 0 ? (
          <EmptyStateCard
            title="No services added yet"
            description="Add your first service to start receiving homeowner booking requests."
            action={
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex min-h-[40px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
              >
                Add service
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {services.map((service) => (
              <MobileCard key={service.id} variant="compact" className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="mb-0 truncate text-sm font-semibold text-slate-900">{service.name}</p>
                    <p className="mb-0 mt-1 text-xs text-slate-600 line-clamp-2">{service.description}</p>
                  </div>
                  <StatusChip tone={service.isActive ? 'good' : 'info'}>{service.isActive ? 'Active' : 'Inactive'}</StatusChip>
                </div>

                <div className="flex items-center gap-1.5">
                  <StatusChip tone="info">{service.category}</StatusChip>
                  {service.inspectionType ? <StatusChip tone="protected">{service.inspectionType}</StatusChip> : null}
                  {service.handymanType ? <StatusChip tone="protected">{service.handymanType}</StatusChip> : null}
                </div>

                <ReadOnlySummaryBlock
                  items={[
                    {
                      label: 'Base price',
                      value: `$${service.basePrice} ${service.priceUnit}`,
                      emphasize: true,
                    },
                    {
                      label: 'Minimum charge',
                      value: service.minimumCharge ? `$${service.minimumCharge}` : 'N/A',
                    },
                    {
                      label: 'Estimated duration',
                      value: service.estimatedDuration ? `${service.estimatedDuration} min` : 'N/A',
                    },
                  ]}
                />

                <ActionPriorityRow
                  primaryAction={
                    <button
                      type="button"
                      onClick={() => handleEdit(service)}
                      className="min-h-[40px] w-full rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90"
                    >
                      Edit service
                    </button>
                  }
                  secondaryActions={
                    <>
                      <button
                        type="button"
                        onClick={() => toggleServiceStatus(service.id, service.isActive)}
                        className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        {service.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(service)}
                        className="inline-flex min-h-[36px] items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </>
                  }
                />
              </MobileCard>
            ))}
          </div>
        )}

        <BottomSafeAreaReserve size="chatAware" />
      </ProviderShellTemplate>

      {(showAddModal || showEditModal) ? (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-3 sm:p-4">
            <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal} />

            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingService ? 'Edit Service' : 'Add New Service'}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Close modal"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 px-5 py-4">
                {error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
                    {error}
                  </div>
                ) : null}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Service Category *</label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleCategoryChange}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  >
                    <option value="INSPECTION">Inspection</option>
                    <option value="HANDYMAN">Handyman</option>
                  </select>
                </div>

                {formData.category === 'INSPECTION' ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Inspection Type *</label>
                    <select
                      name="inspectionType"
                      value={formData.inspectionType || ''}
                      onChange={handleInputChange}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
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
                ) : null}

                {formData.category === 'HANDYMAN' ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Handyman Type *</label>
                    <select
                      name="handymanType"
                      value={formData.handymanType || ''}
                      onChange={handleInputChange}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
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
                ) : null}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Service Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g., Complete Home Inspection"
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Description *</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    placeholder="Describe what's included in this service..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                  <p className="mt-1 text-xs text-slate-500">Minimum 10 characters</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Base Price * ($)</label>
                    <input
                      type="number"
                      name="basePrice"
                      value={formData.basePrice}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Price Unit *</label>
                    <select
                      name="priceUnit"
                      value={formData.priceUnit}
                      onChange={handleInputChange}
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      <option value="flat rate">Flat Rate</option>
                      <option value="per hour">Per Hour</option>
                      <option value="per square foot">Per Square Foot</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Minimum Charge ($)</label>
                    <input
                      type="number"
                      name="minimumCharge"
                      value={formData.minimumCharge || ''}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      placeholder="Optional"
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Estimated Duration (minutes)</label>
                    <input
                      type="number"
                      name="estimatedDuration"
                      value={formData.estimatedDuration || ''}
                      onChange={handleInputChange}
                      min="0"
                      placeholder="Optional"
                      className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    />
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-slate-300 text-brand-primary"
                  />
                  Service is active and visible to homeowners
                </label>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[42px] rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : editingService ? 'Update service' : 'Add service'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteConfirm && deletingService ? (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={handleDeleteCancel} />

            <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-100">
                <svg className="h-5 w-5 text-rose-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>

              <div className="mt-3 text-center">
                <h3 className="text-base font-semibold text-slate-900">Delete Service</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Delete <strong>&quot;{deletingService.name}&quot;</strong>? This action cannot be undone.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDeleteCancel}
                  disabled={saving}
                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={saving}
                  className="min-h-[40px] rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
