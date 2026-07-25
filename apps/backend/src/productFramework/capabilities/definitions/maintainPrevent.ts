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
    version: 2,
    label: 'Plant Advisor',
    description: 'Choose plants using room light and maintenance context.',
    routeTemplate: '/dashboard/properties/[id]/tools/plant-advisor',
    outcomeCategory: 'MAINTAIN_PREVENT',
    rolloutKey: 'PLANT_ADVISOR',
    releaseStage: 'ACTIVE',
    safetyTier: 'LOW_CONSEQUENCE',
    completionKind: 'OUTPUT_GENERATED',
    mode: 'CONTEXTUAL',
    iconName: 'leaf',
    intentAliases: [
      'plant advisor',
      'what plant works in this room',
      'plants for low light',
      'pet safe houseplants',
      'easy care indoor plants',
      'room plant recommendations',
      'plant care plan',
    ],
    homeownerOutcome:
      'Choose reviewed plants that fit a specific room, its light, care preference, and household constraints.',
    livingHomeRecordReads: [
      'property-context',
      'room-record',
      'room-plant-profile',
      'home-plant',
    ],
    livingHomeRecordWrites: [
      'room-plant-profile',
      'plant-recommendation',
      'home-plant',
      'plant-care-plan',
    ],
    expectedOutput:
      'A reviewed, room-specific plant recommendation set with fit reasons, warnings, placement, and care guidance.',
    completionSignal: 'plant_recommendations_generated',
    outputEntityTypes: ['ROOM'],
  },
]);
