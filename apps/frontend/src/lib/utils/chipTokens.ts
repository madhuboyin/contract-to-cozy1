export const SEVERITY_CHIP = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high:     'bg-orange-100 text-orange-800 border-orange-200',
  elevated: 'bg-amber-100 text-amber-800 border-amber-200',
  moderate: 'bg-amber-100 text-amber-800 border-amber-200',
  medium:   'bg-yellow-100 text-yellow-800 border-yellow-200',
  low:      'bg-blue-100 text-blue-700 border-blue-200',
  good:     'bg-green-100 text-green-800 border-green-200',
  neutral:  'bg-gray-100 text-gray-700 border-gray-200',
} as const;

export type SeverityLevel = keyof typeof SEVERITY_CHIP;
