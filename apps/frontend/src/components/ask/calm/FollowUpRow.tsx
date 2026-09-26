'use client';

// ASK_COZY_INLINE_WORKSPACE_FRD §11.11 IW-CALM-006 (FRD v1.111): follow-up chips docked above the composer. Choosing one asks
// it; the row scrolls sideways on a narrow screen and is empty while an answer is pending.
export function FollowUpRow({ suggestions, disabled, onPick }: { suggestions: string[]; disabled: boolean; onPick: (question: string) => void }) {
  if (disabled || suggestions.length === 0) return null;
  return (
    <div role="group" aria-label="Suggested follow-ups" data-follow-up-row="" className="mx-auto mb-2 flex w-full max-w-3xl gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {suggestions.map((suggestion) => (
        <button key={suggestion} type="button" onClick={() => onPick(suggestion)} className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-teal-300 hover:text-teal-900">{suggestion}</button>
      ))}
    </div>
  );
}
