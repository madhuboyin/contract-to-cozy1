// Constants for adding a material and a plant inside Ask (FRD v1.251). Strings only, so the Material Specs and plant care answers can name the
// declared actions without importing the handler.

// A material is recorded only from the declared "Add a material" action on the Material Specs answer.
export const MATERIAL_SPEC_ADD_MESSAGE = 'Record a material used in this home.';
export const MATERIAL_SPEC_CAPTURE_KEY = 'MATERIAL_SPEC_INPUTS';
export const MATERIAL_SPEC_ADD_ACTION_ID = 'add-material-spec';

// A plant is added only from the declared "Add a plant" action on the plant care answer.
export const HOME_PLANT_ADD_MESSAGE = 'Add a plant to this home.';
export const HOME_PLANT_CAPTURE_KEY = 'HOME_PLANT_INPUTS';
export const HOME_PLANT_ADD_ACTION_ID = 'add-home-plant';
/** Shown when the home has no room yet: an indoor plant lives in a room, so the way forward is the existing add-a-room command. */
export const HOME_PLANT_ADD_ROOM_ACTION_ID = 'add-room-for-plant';

/** The room choice that records a material for the whole home. */
export const WHOLE_HOME_VALUE = '__WHOLE_HOME__';
