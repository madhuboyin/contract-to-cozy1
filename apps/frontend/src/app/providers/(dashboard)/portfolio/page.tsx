// apps/frontend/src/app/providers/(dashboard)/portfolio/page.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/client';
import { ProviderPortfolioItem } from '@/types';
import {
  BottomSafeAreaReserve,
  EmptyStateCard,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';

const PORTFOLIO_CATEGORIES = [
  'INSPECTION',
  'HANDYMAN',
  'GENERAL_HANDYMAN',
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'ROOFING',
  'WATER_HEATER',
  'FOUNDATION',
  'WINDOWS_DOORS',
  'INSULATION',
  'LANDSCAPING',
  'LANDSCAPING_DRAINAGE',
  'GUTTERS',
  'SOLAR',
  'FLOORING',
  'PAINTING',
  'SIDING',
  'MOLD_REMEDIATION',
  'APPLIANCE_REPAIR',
  'APPLIANCE_REPLACEMENT',
  'SECURITY_SAFETY',
  'CLEANING',
  'MOVING',
  'PEST_CONTROL',
  'LOCKSMITH',
] as const;

interface PortfolioFormData {
  title: string;
  description: string;
  category: string;
}

const EMPTY_FORM: PortfolioFormData = { title: '', description: '', category: 'HANDYMAN' };

export default function ProviderPortfolioPage() {
  const [items, setItems] = useState<ProviderPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProviderPortfolioItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ProviderPortfolioItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<PortfolioFormData>(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      setLoading(true);
      const response = await api.getMyPortfolio();
      if (response.success) {
        setItems(response.data);
      }
    } catch (err) {
      console.error('Error fetching portfolio:', err);
      setError('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setEditingItem(null);
    resetForm();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);

      if (editingItem) {
        const response = await api.updatePortfolioItem(editingItem.id, {
          title: formData.title,
          description: formData.description || undefined,
          category: formData.category,
        });
        if (response.success) {
          setSuccess('Portfolio item updated!');
          handleCloseModal();
          fetchPortfolio();
          setTimeout(() => setSuccess(null), 3000);
        }
      } else {
        if (!selectedFile) {
          setError('A photo is required');
          setSaving(false);
          return;
        }
        const response = await api.createPortfolioItem(selectedFile, {
          title: formData.title,
          description: formData.description || undefined,
          category: formData.category,
        });
        if (response.success) {
          setSuccess('Portfolio item added!');
          handleCloseModal();
          fetchPortfolio();
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (err: any) {
      console.error('Error saving portfolio item:', err);
      setError(err?.message || 'Failed to save portfolio item');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: ProviderPortfolioItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      description: item.description || '',
      category: item.category,
    });
    setShowEditModal(true);
  };

  const handleDeleteClick = (item: ProviderPortfolioItem) => {
    setDeletingItem(item);
    setShowDeleteConfirm(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setDeletingItem(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    try {
      setSaving(true);
      const response = await api.deletePortfolioItem(deletingItem.id);
      if (response.success) {
        setItems((prev) => prev.filter((item) => item.id !== deletingItem.id));
        setSuccess('Portfolio item deleted!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Error deleting portfolio item:', err);
      setError(err?.message || 'Failed to delete portfolio item');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
      setShowDeleteConfirm(false);
      setDeletingItem(null);
    }
  };

  return (
    <>
      <ProviderShellTemplate
        title="Portfolio"
        subtitle="Showcase recent work so homeowners can trust quality before booking."
        eyebrow="Provider Portfolio"
        introAction={
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex min-h-[40px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
          >
            + Add photos
          </button>
        }
        primaryAction={{
          title: items.length > 0 ? 'Keep your best projects visible and current.' : 'Publish your first portfolio project.',
          description:
            'Recent visuals and concise descriptions make provider quality easier to evaluate and improve booking confidence.',
          primaryAction: (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
            >
              {items.length > 0 ? 'Add portfolio photos' : 'Upload first project'}
            </button>
          ),
          impactLabel: items.length > 0 ? 'Trust multiplier' : 'Critical social proof',
          confidenceLabel: `${items.length} project${items.length === 1 ? '' : 's'} published`,
        }}
        trust={{
          confidenceLabel: 'Portfolio trust increases with recent projects, clear captions, and category coverage.',
          freshnessLabel: items.length > 0 ? 'Portfolio is active' : 'No portfolio activity yet',
          sourceLabel: 'Uploaded provider project media and service category tagging.',
          rationale: 'Visual proof helps homeowners quickly validate workmanship and reduce booking uncertainty.',
        }}
        summary={
          <MobileKpiStrip className="sm:grid-cols-1">
            <MobileKpiTile label="Photos" value={items.length} hint="Visible on your public profile" />
          </MobileKpiStrip>
        }
        routeState={
          loading
            ? { state: 'loading', title: 'Loading portfolio', description: 'Fetching your published project photos.' }
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

        {items.length === 0 ? (
          <EmptyStateCard
            title="No photos yet"
            description="Add project photos to build trust and improve booking conversion."
            action={
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90"
              >
                Upload first photo
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <MobileCard key={item.id} variant="compact" className="overflow-hidden p-0">
                <div className="relative aspect-video bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imageUrl is a
                      presigned, short-lived S3 URL from an S3-compatible endpoint that
                      varies per deployment; next/image requires a statically known
                      hostname allowlist, which doesn't fit this case. */}
                  <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                  <div className="absolute left-3 top-3">
                    <StatusChip tone="info">{item.category}</StatusChip>
                  </div>
                </div>
                <div className="space-y-2 p-3.5">
                  <p className="mb-0 text-sm font-semibold text-slate-900">{item.title}</p>
                  {item.description ? <p className="mb-0 text-xs text-slate-600">{item.description}</p> : null}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-500">
                      {item.createdAt ? `Added ${new Date(item.createdAt).toLocaleDateString()}` : ''}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="inline-flex min-h-[32px] items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(item)}
                        className="inline-flex min-h-[32px] items-center rounded-md border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </MobileCard>
            ))}
          </div>
        )}

        <MobileCard variant="compact" className="space-y-1.5 bg-sky-50/70">
          <p className="mb-0 text-sm font-semibold text-sky-900">Portfolio tips</p>
          <p className="mb-0 text-xs text-sky-800">Use before/after shots and concise descriptions. Update frequently to signal active, reliable service.</p>
        </MobileCard>

        <BottomSafeAreaReserve size="chatAware" />
      </ProviderShellTemplate>

      {showAddModal || showEditModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-[100dvh] items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="fixed inset-0 bg-black/50" onClick={handleCloseModal} />

            <div className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl rounded-b-none border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
              <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {editingItem ? 'Edit Portfolio Item' : 'Add Portfolio Item'}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
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

                {!editingItem ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Photo *</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-slate-600 file:mr-3 file:min-h-[40px] file:rounded-lg file:border-0 file:bg-brand-primary file:px-3 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-primary/90"
                    />
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="Preview" className="mt-3 aspect-video w-full rounded-lg object-cover" />
                    ) : null}
                  </div>
                ) : (
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editingItem.imageUrl} alt={editingItem.title} className="h-full w-full object-cover" />
                    <p className="mt-1 text-xs text-slate-500">Photo replacement isn&apos;t supported yet — delete and re-add to change the photo.</p>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    maxLength={200}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="e.g. Complete Home Inspection"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    maxLength={1000}
                    rows={3}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    placeholder="What did this project involve?"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  >
                    {PORTFOLIO_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : editingItem ? 'Update item' : 'Add item'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteConfirm && deletingItem ? (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-[100dvh] items-end justify-center p-0 sm:items-center sm:p-4">
            <div className="fixed inset-0 bg-black/50" onClick={handleDeleteCancel} />

            <div className="relative w-full max-w-md rounded-t-2xl rounded-b-none border border-slate-200 bg-white p-5 shadow-xl sm:rounded-2xl">
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
                <h3 className="text-base font-semibold text-slate-900">Delete Portfolio Item</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Delete <strong>&quot;{deletingItem.title}&quot;</strong>? This action cannot be undone.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleDeleteCancel}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={saving}
                  className="min-h-[44px] rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
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
