// Home Records is the canonical place for a home's documents (legacy Documents is being retired), so every "documents" destination is built
// here instead of being spelled out at each link.
export function homeRecordsHref(propertyId: string, options: { upload?: boolean; recordId?: string } = {}): string {
  const query = new URLSearchParams();
  if (options.upload) query.set('action', 'upload');
  if (options.recordId) query.set('recordId', options.recordId);
  const suffix = query.toString();
  return `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-records${suffix ? `?${suffix}` : ''}`;
}
