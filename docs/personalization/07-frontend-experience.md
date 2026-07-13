# 07 — Frontend Experience

## Experience principles

Deliver a few decisions, not another wall of cards. Make relevance legible, profile data correctable, sensitive collection optional, and all intelligence visibly home-related. Use existing mobile primitives, Radix components, React Query, `DashboardShell`, trust/confidence elements and action components.

## Information architecture

- Property navigation: **Household & personalization** (profile, pets, goals, preferences, data/traits, privacy). Keep current **Household members** as collaboration/access and explain the distinction.
- Dashboard: one “What matters now” ranked stack with 3 items, category diversity, and a “See all” route.
- Property recommendations route: filters by goal/category/status; one list rather than module-specific copies.
- Recommendation detail: structured explanation, evidence/corrections and actions.
- Settings/profile: notification budgets, interests/suppression, inference controls, export/delete/reset.

## Household profile

Show a compact completeness summary based on value, not arbitrary percent. Sections: household composition bands, pets, home-use patterns, goals, preferences, future plans and privacy. Names are optional and absent in MVP. Every sensitive section states why it improves home guidance. Save per section with version-conflict recovery; never silently overwrite another collaborator's update.

Pet profile collects type/count/size/shedding/yard and indoor-outdoor bands, property applicability, and fence dependence. It links to a home-safety checklist, fence/yard, air-quality cadence, emergency preparation, property wear/improvements, coverage review and seller-prep impacts—never generic pet care.

## Progressive profiling

Create a shared `ProfileQuestionCard` with:

- one question and ≤6 clear options;
- “Why we ask” disclosure before answer;
- privacy classification and the modules improved;
- Skip and Ask me later as first-class actions;
- visible save/undo confirmation;
- no fake completion pressure;
- keyboard focus management and screen-reader live confirmation.

Place questions inline after relevant content, not as blocking modals. Initial onboarding asks at most five: pets, occupancy, primary goal, DIY/service posture, notification cadence. Contextual examples: fence status after dog/yard; WFH during comfort/energy view; sell horizon in Seller Prep. One/session and two/week defaults.

## Personalized dashboard

Use a ranked vertical list within the existing “What matters most today” area:

1. title, category and urgency;
2. one-line reason (“Two shedding dogs + air-quality goal”);
3. one quantified or qualitative benefit only when evidence supports it;
4. primary action and overflow menu for save/snooze/not relevant;
5. confidence disclosure for uncertain recommendations.

Maximum three initially, five after expansion. Maximum two from one category; urgent safety may pin one slot. Do not repeat the same recommendation in Action Center, Pulse, seasonal and module cards. Existing dashboard local ranking should gradually consume the centralized list.

## Recommendation detail

Required sections:

- recommendation and homeowner-safe detailed guidance;
- Why you are seeing this, using structured reasons;
- data/evidence used with observed dates;
- expected risk/cost/comfort/value benefit and uncertainty;
- urgency, confidence and limitations;
- what may happen if ignored without fear language;
- cost/effort bands and source/review date where relevant;
- correct underlying profile/property data;
- create/adjust recurring task, save, snooze, dismiss/not relevant and feedback.

After correction, show “We’re updating your recommendations” and retain current item marked pending until the snapshot refreshes. Avoid LLM typing/loading for core explanations.

## Controls and trust

“Data used for personalization” groups explicit, derived, inferred and external context. Users can inspect source/confidence/freshness, correct/override/disable inferred traits, set categories and notification cadence/channels, export/delete profile data, and reset personalization. Explain effects before deletion. Sensitive data is hidden from VIEWER roles and summarized for contributors.

## Module integration requirements

| Module | UI behavior |
|---|---|
| Dashboard | top 3 cross-module results, one profile prompt maximum |
| Health Score | “best next action to improve this factor”; score math unchanged |
| Risk | household-sensitive mitigation ordering; no medical/coverage claims |
| Maintenance | adjusted cadence and convert-to-recurring-task |
| Assets/warranty/insurance | context-specific review prompts, not coverage determinations |
| Seller Prep | pet/lifestyle impacts and goal/budget-aware order |
| Community/climate | local relevance and validity timestamps |
| Wellness/energy | comfort, air-quality and sustainability goals tied to home systems |
| Providers | DIY vs hands-off CTA and budget posture, never hidden price discrimination |
| Notifications | central eligibility/budget; in-app history shows why sent |
| Search/assistant | authorized snapshot context and source-backed answer; opt-out honored |

## Responsive and accessibility requirements

- Use one-column priority list below tablet; 44px touch targets and safe-area padding.
- Meet WCAG 2.2 AA: semantic headings, labels, visible focus, contrast, reduced motion, no color-only urgency, keyboard dialogs/menus, status announcements.
- Confidence and urgency use text plus icon, not color alone.
- Question skip and privacy disclosure are keyboard reachable and not visually de-emphasized.
- Loading uses stable skeletons; stale cached recommendations remain readable with status.
- Offline/PWA mode may display last snapshot with “last updated” but disables mutations or queues them explicitly; weather-critical stale advice is not presented as current.

## State and API integration

Add a focused personalization client rather than extending the monolithic API client indefinitely. Query keys include property and snapshot version. Mutations optimistically update only reversible UI state and always rollback on failure. Invalidate profile, traits, questions and recommendations together after relevant changes. Instrument impressions once per visible session, not every render.

## Content requirements

Tone is calm, specific and non-judgmental. Avoid “because you are elderly,” “luxury owner,” diagnoses, guaranteed savings and alarmist risk. Prefer “Because aging in place is one of your household goals…” and “This may reduce…”. Every safety/financial/insurance item carries appropriate limitations and reviewed source metadata.

## Frontend acceptance baseline

- A new user reaches first personalized value with ≤5 profile answers.
- Dashboard never shows >5 personalization items or >2/category.
- Every item has an accessible reason, correction route and suppression action.
- All pet experiences remain property-scoped.
- OWNER/contributor/viewer visibility tests pass at mobile and desktop breakpoints.
- No sensitive trait value enters analytics, URL query strings, browser console, or error telemetry.
