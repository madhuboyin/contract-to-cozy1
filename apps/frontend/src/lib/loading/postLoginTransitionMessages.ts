export const ROTATING_MESSAGES = [
  'Reviewing your protections',
  'Organizing next actions',
  'Loading property context',
  'Preparing home insights',
  'Syncing maintenance signals',
  'Checking seasonal priorities',
] as const;

export type RotatingMessage = (typeof ROTATING_MESSAGES)[number];
