import { createContext, useContext } from 'react';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (FRD v1.111). Two levels, so a domain can adopt the calm shell before it adopts the
// calm answer anatomy (IW-CALM-012):
// - chrome: true for EVERY answer while the calm setting is on (no answer frame, one overflow menu, plain state blocks,
//   footnotes, plain wording). Slice B.
// - anatomy: true only for a domain that has adopted headline / support line / bare artifact (Maintenance today). Slice A.
export const CalmChromeContext = createContext(false);
export const CalmAnswerContext = createContext(false);
export const useCalmChrome = () => useContext(CalmChromeContext);
export const useCalmAnswer = () => useContext(CalmAnswerContext);

// A block that supports the main artifact of the turn (for example the "What comes next" tool list after an answer). In the calm
// shell it is offered collapsed, so a turn has one artifact (IW-CONV-002/003).
export const CalmSecondaryContext = createContext(false);
export const useCalmSecondary = () => useContext(CalmSecondaryContext);
