// The five things Ask Cozy shows. None is a screen of its own: Home is the conversation, and Work, Record, Saved and History
// are answered as blocks (or the conversation list) inside it. Each keeps a presentation contract so its block is held to one standard.
export type AskDestinationId = 'home' | 'work' | 'record' | 'saved' | 'history';

export interface AskDestinationDefinition {
  id: AskDestinationId;
  label: string;
}

export const ASK_DESTINATIONS: readonly AskDestinationDefinition[] = Object.freeze([
  { id: 'home', label: 'Home' },
  { id: 'work', label: 'Work' },
  { id: 'record', label: 'Record' },
  { id: 'saved', label: 'Saved' },
  { id: 'history', label: 'History' },
]);
