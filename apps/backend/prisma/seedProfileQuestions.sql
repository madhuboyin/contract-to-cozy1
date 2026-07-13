-- apps/backend/prisma/seedProfileQuestions.sql
--
-- Raw-SQL equivalent of seedProfileQuestions.ts, for running directly in
-- pgAdmin. Seeds 5 starter progressive-profiling questions, one per
-- composition table. All DRAFT/inactive — promote to ACTIVE manually.
--
-- PREREQUISITE: personalization_profile_questions must already exist
-- (npx prisma db push for the ProfileQuestion/ProfileAnswer schema addition).
--
-- Idempotent: safe to re-run. On conflict, refreshes prompt/whyAsked/
-- privacyNote/answerSchema/valueScore/effortScore but never touches
-- `status` (same reasoning as seedPersonalizationProofDefinition.sql).

INSERT INTO personalization_profile_questions
  (id, code, version, status, prompt, "whyAsked", "privacyNote", "targetTable", "targetKey",
   "answerSchema", "placementContexts", "valueScore", "effortScore", "maxImpressions", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'household_composition_safety', 1, 'DRAFT',
   'Does your household include young children, teens, or seniors who need extra safety consideration?',
   'Helps us prioritize safety-related home recommendations (e.g. smoke detectors, stair rails).',
   'We only store household composition bands, never names, ages, or birthdates.',
   'HOUSEHOLD_MEMBER_SUMMARY', NULL,
   '{"type":"multi_select","options":["hasChildren","hasSeniors"]}'::jsonb,
   ARRAY['ONBOARDING'], 8, 2, 3, now(), now()),

  (gen_random_uuid(), 'household_pets', 1, 'DRAFT',
   'Do you have a dog or cat at this property?',
   'Helps us tailor recommendations around yard safety, flooring, and pet-related maintenance.',
   'We store pet type only, never names or medical information.',
   'PET_PROFILE', NULL,
   '{"type":"select_with_detail","options":["hasPet","petType"]}'::jsonb,
   ARRAY['ONBOARDING'], 6, 1, 3, now(), now()),

  (gen_random_uuid(), 'goal_aging_in_place', 1, 'DRAFT',
   'Are you planning to age in place in this home long-term?',
   'Helps us prioritize accessibility and long-term safety recommendations.',
   'This is a goal you can update or remove at any time.',
   'HOUSEHOLD_GOAL', 'AGING_IN_PLACE',
   '{"type":"boolean"}'::jsonb,
   ARRAY['ONBOARDING'], 7, 1, 3, now(), now()),

  (gen_random_uuid(), 'preference_budget_posture', 1, 'DRAFT',
   'Would you describe your home-maintenance budget as cost-conscious?',
   'Helps us favor lower-cost options when multiple recommendations are equally valid.',
   'This preference only affects which recommendations we prioritize, never your credit or income.',
   'HOUSEHOLD_PREFERENCE', 'BUDGET_POSTURE',
   '{"type":"boolean"}'::jsonb,
   ARRAY['ONBOARDING'], 6, 1, 3, now(), now()),

  (gen_random_uuid(), 'lifestyle_travel_frequency', 1, 'DRAFT',
   'Do you travel away from home frequently (monthly or more)?',
   'Helps us prioritize security and remote-monitoring recommendations.',
   'We store a frequency band only, never your travel dates or destinations.',
   'LIFESTYLE_ATTRIBUTE', 'TRAVEL_FREQUENCY',
   '{"type":"boolean"}'::jsonb,
   ARRAY['ONBOARDING'], 5, 1, 3, now(), now())

ON CONFLICT (code, version) DO UPDATE SET
  prompt          = EXCLUDED.prompt,
  "whyAsked"      = EXCLUDED."whyAsked",
  "privacyNote"   = EXCLUDED."privacyNote",
  "answerSchema"  = EXCLUDED."answerSchema",
  "valueScore"    = EXCLUDED."valueScore",
  "effortScore"   = EXCLUDED."effortScore",
  "updatedAt"     = now();

-- Sanity check after running: should return exactly 5 rows, all status DRAFT.
-- SELECT code, "targetTable", "targetKey", status FROM personalization_profile_questions ORDER BY code;
