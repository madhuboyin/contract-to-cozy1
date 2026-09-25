import { createContext, useContext } from 'react';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 (FRD v1.111): true while a calm-adopting answer is rendering its blocks, so the
// shared blocks can drop their own frames without every caller passing a flag.
export const CalmAnswerContext = createContext(false);
export const useCalmAnswer = () => useContext(CalmAnswerContext);
