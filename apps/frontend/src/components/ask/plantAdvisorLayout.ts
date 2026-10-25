import { askAnswerWidthClass } from '@/features/ask/answerLayout';

// Plant Advisor result surfaces follow the standard Ask answer measure, while
// its input workflow stays narrower so option groups remain easy to scan.
export const PLANT_ADVISOR_ANSWER_WIDTH_CLASS = askAnswerWidthClass('STANDARD');
export const PLANT_ADVISOR_WORKFLOW_WIDTH_CLASS = 'w-full max-w-[760px]';
