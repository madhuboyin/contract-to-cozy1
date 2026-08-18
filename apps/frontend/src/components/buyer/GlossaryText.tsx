'use client';

import { Fragment } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BUYER_GLOSSARY, BUYER_GLOSSARY_PATTERN } from '@/lib/buyerGlossary';

type TextSegment = string | { term: string; matched: string };

function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const seen = new Set<string>();
  let lastIndex = 0;
  BUYER_GLOSSARY_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BUYER_GLOSSARY_PATTERN.exec(text))) {
    const key = match[0].toLowerCase();
    const isFirstOccurrence = !seen.has(key);
    seen.add(key);
    if (match.index > lastIndex) segments.push(text.slice(lastIndex, match.index));
    segments.push(isFirstOccurrence ? { term: key, matched: match[0] } : match[0]);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push(text.slice(lastIndex));
  return segments;
}

/**
 * Renders guidance copy as plain text, except the first time a known closing
 * term appears — that occurrence gets a tap/hover explainer so buyers never
 * have to leave the screen to look up jargon.
 */
export function GlossaryText({ text }: { text: string }) {
  if (!text) return null;
  const segments = segmentText(text);
  if (segments.every((segment) => typeof segment === 'string')) return <>{text}</>;

  return (
    <TooltipProvider>
      {segments.map((segment, index) =>
        typeof segment === 'string' ? (
          <Fragment key={index}>{segment}</Fragment>
        ) : (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-2"
              >
                {segment.matched}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-left">{BUYER_GLOSSARY[segment.term]}</TooltipContent>
          </Tooltip>
        ),
      )}
    </TooltipProvider>
  );
}
