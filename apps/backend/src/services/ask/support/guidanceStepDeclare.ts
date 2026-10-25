import { z } from 'zod';

export const GUIDANCE_STEP_DECLARE_MESSAGE = 'Declare this journey step.';
export const GUIDANCE_STEP_DECLARE_CAPTURE_KEY = 'GUIDANCE_STEP_DECLARE_INPUTS';
/** The form's answer: a declaration KEY from the step's server-owned catalog. Free-form text is never accepted. */
export const GuidanceStepDeclareAnswerSchema = z.object({ declarationKey: z.string().trim().min(1).max(60) }).strict();
