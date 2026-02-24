/**
 * Formats a database enum string for human-readable display.
 * "PEST_CONTROL" -> "Pest Control"
 * "IN_PROGRESS" -> "In Progress"
 * "HANDYMAN" -> "Handyman"
 */
export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Returns the appropriate Tailwind color classes for a booking status.
 */
export function getStatusStyles(status: string): { bg: string; text: string; border: string } {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    DRAFT: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
    PENDING: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    CONFIRMED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    IN_PROGRESS: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
    COMPLETED: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    CANCELLED: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
    DISPUTED: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  };
  return map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' };
}
