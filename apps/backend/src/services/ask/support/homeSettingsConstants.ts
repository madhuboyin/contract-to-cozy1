// Constants for the two property-setting commands (PROPERTY_PURCHASE_DATE_SET, HOME_JOURNEY_SET). Strings only, so the audience and maintenance
// producers can name the declared action without importing the handler (which imports them).

// A purchase date is recorded only from the declared "Add purchase date" action; any other call is the not-directly-routable boundary.
export const PURCHASE_DATE_SET_MESSAGE = 'Record when I bought this home.';
export const PURCHASE_DATE_CAPTURE_KEY = 'PROPERTY_PURCHASE_DATE_INPUTS';

// The home journey (how the household uses this home right now) is set only from the declared "Confirm home journey" action.
export const HOME_JOURNEY_SET_MESSAGE = 'Confirm how I am using this home.';
export const HOME_JOURNEY_CAPTURE_KEY = 'HOME_JOURNEY_INPUTS';

// The page's own wording (onboarding JourneyContextCard), so the same choice reads the same in both places.
export const HOME_JOURNEY_OPTIONS = [
  { value: 'SHOPPING', label: 'Exploring or shopping', detail: 'I am evaluating a possible future home.' },
  { value: 'UNDER_CONTRACT', label: 'Buying this home', detail: 'I am under contract or preparing to close.' },
  { value: 'RECENT_OWNER', label: 'Recently became owner', detail: 'I am in the first months of setting up this home.' },
  { value: 'ESTABLISHED_OWNER', label: 'Own this home', detail: 'I am maintaining and planning for this home.' },
  { value: 'PREPARING_TRANSFER', label: 'Preparing to sell or transfer', detail: 'I am getting records and work ready for a transition.' },
] as const;
export type HomeJourneyOwnershipState = (typeof HOME_JOURNEY_OPTIONS)[number]['value'];
