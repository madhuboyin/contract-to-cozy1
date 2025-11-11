// Status badge color fix - better contrast for accessibility
// Use this in booking pages instead of the old color combinations

export const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    // Green status - FIXED contrast
    'CONFIRMED': 'bg-green-50 text-green-800 border border-green-200',
    'COMPLETED': 'bg-green-50 text-green-800 border border-green-200',
    
    // Yellow status - FIXED contrast (was yellow-100/yellow-600)
    'PENDING': 'bg-yellow-50 text-yellow-800 border border-yellow-200',
    
    // Blue status - good contrast
    'IN_PROGRESS': 'bg-blue-50 text-blue-800 border border-blue-200',
    'DRAFT': 'bg-blue-50 text-blue-800 border border-blue-200',
    
    // Red status - good contrast
    'CANCELLED': 'bg-red-50 text-red-800 border border-red-200',
    'DISPUTED': 'bg-red-50 text-red-800 border border-red-200',
    
    // Gray status - good contrast
    'default': 'bg-gray-50 text-gray-800 border border-gray-200',
  };

  return colors[status] || colors['default'];
};

// Alternative: Solid backgrounds for even better contrast
export const getStatusColorSolid = (status: string): string => {
  const colors: Record<string, string> = {
    'CONFIRMED': 'bg-green-600 text-white',
    'COMPLETED': 'bg-green-600 text-white',
    'PENDING': 'bg-yellow-500 text-white',
    'IN_PROGRESS': 'bg-blue-600 text-white',
    'DRAFT': 'bg-gray-500 text-white',
    'CANCELLED': 'bg-red-600 text-white',
    'DISPUTED': 'bg-red-600 text-white',
    'default': 'bg-gray-600 text-white',
  };

  return colors[status] || colors['default'];
};
