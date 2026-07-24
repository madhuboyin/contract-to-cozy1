import { buildCapabilityDefinitions } from './capabilityDefinitionFactory';

export const MAINTAIN_PREVENT_CAPABILITIES = buildCapabilityDefinitions([
  {
    id: 'home-habit-coach',
    label: 'Home Habit Coach',
    description: 'Build seasonal routines that keep home care on track.',
    routeTemplate: '/dashboard/properties/[id]/tools/home-habit-coach',
    outcomeCategory: 'MAINTAIN_PREVENT',
    rolloutKey: 'HOME_HABIT_COACH',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ACTION_INITIATED',
    mode: 'CONTEXTUAL',
  },
  {
    id: 'plant-advisor',
    label: 'Plant Advisor',
    description: 'Choose plants using room light and maintenance context.',
    routeTemplate: '/dashboard/properties/[id]/tools/plant-advisor',
    outcomeCategory: 'MAINTAIN_PREVENT',
    rolloutKey: 'PLANT_ADVISOR',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'ACTION_INITIATED',
    mode: 'CONTEXTUAL',
    iconName: 'leaf',
  },
]);
