'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  TOOL_EXPLAINERS,
  type ToolExplainerKey,
} from '@/content/toolExplainers';

const TOOL_EXPLAINER_OPEN_EVENT = 'ctc-tool-explainer-open';

interface ToolExplainerOpenDetail {
  id?: string;
  toolKey?: ToolExplainerKey;
}

interface OpenToolExplainerOptions {
  id?: string;
  toolKey?: ToolExplainerKey;
}

export function openToolExplainer(options: OpenToolExplainerOptions = {}) {
  if (typeof window === 'undefined') return;

  const id = options.id ?? 'how-it-works';
  const hash = `#${id}`;
  const section = document.getElementById(id);

  window.dispatchEvent(
    new CustomEvent<ToolExplainerOpenDetail>(TOOL_EXPLAINER_OPEN_EVENT, {
      detail: { id, toolKey: options.toolKey },
    })
  );

  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', hash);
  }

  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

interface ToolExplainerSectionProps {
  toolKey: ToolExplainerKey;
  defaultOpen?: boolean;
  id?: string;
  className?: string;
}

export default function ToolExplainerSection({
  toolKey,
  defaultOpen = false,
  id = 'how-it-works',
  className,
}: ToolExplainerSectionProps) {
  const explainer = TOOL_EXPLAINERS[toolKey];
  const storageKey = `ctc_tool_explainer_open::${toolKey}`;
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  const setOpenAndPersist = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, next ? 'true' : 'false');
      }
    },
    [storageKey]
  );

  const scrollIntoView = useCallback(() => {
    if (typeof window === 'undefined') return;
    const section = document.getElementById(id);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'true' || stored === 'false') {
      setOpen(stored === 'true');
    } else {
      setOpen(defaultOpen);
    }
    setReady(true);
  }, [defaultOpen, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !ready) return;
    const targetHash = `#${id}`;

    const maybeOpenFromHash = () => {
      if (window.location.hash === targetHash) {
        setOpenAndPersist(true);
        requestAnimationFrame(scrollIntoView);
      }
    };

    const onOpenEvent = (event: Event) => {
      const detail = (event as CustomEvent<ToolExplainerOpenDetail>).detail;
      if (detail?.toolKey && detail.toolKey !== toolKey) return;
      if (detail?.id && detail.id !== id) return;
      setOpenAndPersist(true);
      requestAnimationFrame(scrollIntoView);
    };

    maybeOpenFromHash();
    window.addEventListener('hashchange', maybeOpenFromHash);
    window.addEventListener(TOOL_EXPLAINER_OPEN_EVENT, onOpenEvent as EventListener);

    return () => {
      window.removeEventListener('hashchange', maybeOpenFromHash);
      window.removeEventListener(TOOL_EXPLAINER_OPEN_EVENT, onOpenEvent as EventListener);
    };
  }, [id, ready, scrollIntoView, setOpenAndPersist, toolKey]);

  const panelId = `${id}-panel`;
  const buttonId = `${id}-toggle`;

  return (
    <section id={id} className={cn('scroll-mt-24', className)}>
      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <button
          id={buttonId}
          type="button"
          onClick={() => setOpenAndPersist(!open)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 p-5 text-left sm:p-6"
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900">How this works</h2>
            <p className="mt-1 text-sm text-gray-600">{explainer.subtitle}</p>
          </div>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-gray-500 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className={cn(
            'grid transition-all duration-200',
            open
              ? 'grid-rows-[1fr] border-t border-gray-100 opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-6 p-5 sm:p-6">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  What it does
                </h3>
                <p className="mt-2 text-sm font-medium text-gray-900">
                  {explainer.whatItDoes.statement}
                </p>
                {explainer.whatItDoes.supportingLine && (
                  <p className="mt-1 text-sm text-gray-600">
                    {explainer.whatItDoes.supportingLine}
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  How it works
                </h3>
                <ol className="mt-3 space-y-3">
                  {explainer.howItWorks.map((step, index) => (
                    <li
                      key={step.title}
                      className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3"
                    >
                      <Badge
                        variant="secondary"
                        className="h-6 min-w-6 rounded-full px-2 text-center text-xs font-semibold"
                      >
                        {index + 1}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{step.title}</p>
                        <p className="mt-1 text-sm text-gray-600">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Why it&apos;s smart
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {explainer.whyItsSmart.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    When to use it
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {explainer.whenToUseIt.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
