// Constants for the three tool commands built from the empty-state sweep (FRD v1.254): suggest home habits, run the do-nothing simulation, check a
// contractor quote. Strings only, so the answers that start them can name the declared actions without importing the handler.

// Home Habit Coach: suggestions are generated only from the declared action on the empty habits answer.
export const HOME_HABITS_GENERATE_MESSAGE = 'Suggest home habits for this home.';
export const HOME_HABITS_GENERATE_ACTION_ID = 'generate-home-habits';

// Do-Nothing Simulator: a run starts only from the declared action on the simulation answer.
export const DO_NOTHING_RUN_MESSAGE = 'Run the do-nothing simulation.';
export const DO_NOTHING_RUN_CAPTURE_KEY = 'DO_NOTHING_RUN_INPUTS';
export const DO_NOTHING_RUN_ACTION_ID = 'run-do-nothing';
/** The horizons the simulator accepts, in months. */
export const DO_NOTHING_HORIZONS = [6, 12, 24, 36] as const;
/** The scenario choice that runs on the home's current records without a saved scenario. */
export const NO_SAVED_SCENARIO_VALUE = '__NO_SCENARIO__';

// Service Price Radar: a check starts only from the declared action on the quote-checks answer.
export const SERVICE_PRICE_CHECK_MESSAGE = 'Check a contractor quote.';
export const SERVICE_PRICE_CHECK_CAPTURE_KEY = 'SERVICE_PRICE_CHECK_INPUTS';
export const SERVICE_PRICE_CHECK_ACTION_ID = 'check-service-quote';
// A saved check opens inline from its row (same operation as the list; the row carries the check id as the launch entity).
export const SERVICE_PRICE_CHECK_DETAIL_MESSAGE = 'Show the details of this quote check.';
export const SERVICE_PRICE_CHECK_DETAIL_ACTION_ID = 'service-price-check-detail';
export const SERVICE_PRICE_CHECK_ENTITY_TYPE = 'SERVICE_PRICE_CHECK';
/** The regulated professional-service categories the radar refuses (its validator's list), so the form never offers them. */
export const SERVICE_PRICE_UNSUPPORTED_CATEGORIES = ['INSURANCE', 'ATTORNEY', 'FINANCE'] as const;
export const SERVICE_PRICE_MAX_QUOTE = 250000;
