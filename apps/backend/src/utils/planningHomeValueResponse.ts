import type { Response } from 'express';
import { PLANNING_HOME_VALUE_REQUIRED, PLANNING_HOME_VALUE_MESSAGE } from '../services/planningHomeValue';

// The structured answer a direct API caller gets when an analysis has no home value to start from. The desktop pages recognise `error.code` and show an
// inline prompt; `details` says what to send (the existing per-request `homeValueNow` parameter) and that it applies to that analysis only.
export function sendPlanningHomeValueRequired(res: Response) {
  return res.status(422).json({
    success: false,
    error: {
      code: PLANNING_HOME_VALUE_REQUIRED,
      message: PLANNING_HOME_VALUE_MESSAGE,
      details: { parameter: 'homeValueNow', unit: 'USD', appliesTo: 'THIS_ANALYSIS_ONLY', changesHomeRecord: false },
    },
  });
}
