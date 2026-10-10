// Constants for browsing and adding the recommended maintenance tasks (the desktop "Maintenance Setup" catalogue) inside Ask (FRD v1.249).
// Strings only, so the maintenance answer can name the declared actions without importing the handler.

/** The declared action on a maintenance answer that opens the recommended-task list. It is reached only by this action, never by message. */
export const MAINTENANCE_TEMPLATES_BROWSE_ACTION = {
  id: 'maintenance-templates-browse',
  label: 'Browse recommended tasks',
  message: 'Show the maintenance tasks I could set up.',
} as const;

/** The list rows' entity type, and the row action that starts the ordinary add-a-task form pre-filled from that template. */
export const MAINTENANCE_TEMPLATE_ENTITY_TYPE = 'MAINTENANCE_TEMPLATE';
export const MAINTENANCE_TEMPLATE_ADD_ACTION = {
  id: 'maintenance-template-add',
  label: 'Add to my maintenance',
  message: 'Add this recommended task to my maintenance.',
} as const;
