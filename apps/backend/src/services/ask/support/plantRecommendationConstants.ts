export const PLANT_RECOMMENDATIONS_MESSAGE = 'Find plants that fit a room.';
export const PLANT_RECOMMENDATIONS_CAPTURE_KEY = 'ROOM_PLANT_RECOMMENDATION_INPUTS';
export const PLANT_RECOMMENDATIONS_ACTION_ID = 'find-plants-for-room';

export const PLANT_RECOMMENDATION_ACTIONS = {
  SAVE: { id: 'plant-recommendation-save', label: 'Save', message: 'Save this plant recommendation.' },
  DISMISS: { id: 'plant-recommendation-dismiss', label: 'Dismiss', message: 'Dismiss this plant recommendation.' },
  ADD_TO_HOME: { id: 'plant-recommendation-add-home', label: 'Add to home', message: 'Add this recommended plant to my home.' },
} as const;
