export const RADAR_USER_STATES = ['new', 'seen', 'saved', 'dismissed', 'acted_on'] as const;
export type RadarInteractionState = (typeof RADAR_USER_STATES)[number];
export const RADAR_MUTABLE_USER_STATES = ['seen', 'saved', 'dismissed', 'acted_on'] as const;
export type RadarMutableInteractionState = (typeof RADAR_MUTABLE_USER_STATES)[number];

export const RADAR_FEEDBACK_TYPES = [
  'helpful',
  'wrong_location',
  'not_relevant',
  'duplicate',
  'stale',
  'other',
] as const;
export type RadarFeedbackType = (typeof RADAR_FEEDBACK_TYPES)[number];

export const RADAR_FEEDBACK_COMMENT_MAX_LENGTH = 500;
