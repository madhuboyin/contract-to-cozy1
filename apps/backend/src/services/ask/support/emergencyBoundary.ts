// The one wording for an immediate-danger answer (suspected gas leak, carbon monoxide, electrical fire). Every path that raises an emergency boundary uses this,
// so no path can answer a gas smell with a generic "seek help" line. It tells the homeowner what to do now; it never offers troubleshooting.
export const EMERGENCY_BOUNDARY_TITLE = 'Treat this as an immediate safety issue';

export const EMERGENCY_BOUNDARY_BODY =
  'Leave the home right away if you can do so safely, and take everyone with you. Do not turn lights or appliances on or off, use a flame, or use a phone inside, and do not start a vehicle in an attached garage. '
  + 'From outside and away from the building, call 911 or your local emergency number, and your gas utility’s emergency line if you smelled gas. '
  + 'Do not try to find or fix the cause yourself, and do not go back in until responders say it is safe.';

export const EMERGENCY_BOUNDARY_SUGGESTIONS: readonly string[] = [
  'Follow instructions from emergency responders or the utility.',
  'Do not wait for an app assessment when there may be immediate danger.',
];
