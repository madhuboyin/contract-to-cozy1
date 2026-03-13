import { AlertTriangle, CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  KnowledgeArticleCta,
  KnowledgeArticleSection,
  KnowledgeArticleToolLink,
} from '@/lib/knowledge/types';
import { KnowledgeToolCard } from './KnowledgeToolCard';
import { KnowledgeCtaCard } from './KnowledgeCtaCard';

function splitParagraphs(body?: string | null) {
  if (!body) return [];
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getStringArray(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const candidate = (value as Record<string, unknown>)[key];
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getFaqEntries(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const candidate = (value as Record<string, unknown>).items;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(
    (item): item is { question: string; answer: string } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).question === 'string' &&
      typeof (item as Record<string, unknown>).answer === 'string'
  );
}

function BodyCopy({ body, intro = false }: { body?: string | null; intro?: boolean }) {
  const paragraphs = splitParagraphs(body);
  if (paragraphs.length === 0) return null;

  return (
    <div className={cn('space-y-5 text-[15px] leading-8 text-slate-700 md:text-base', intro && 'text-[1.06rem] leading-8 text-slate-800')}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

type KnowledgeSectionRendererProps = {
  section: KnowledgeArticleSection;
  toolLinks?: KnowledgeArticleToolLink[];
  ctas?: KnowledgeArticleCta[];
  propertyId?: string | null;
};

export function KnowledgeSectionRenderer({
  section,
  toolLinks = [],
  ctas = [],
  propertyId,
}: KnowledgeSectionRendererProps) {
  const checklistItems = getStringArray(section.dataJson, 'items');
  const factItems = getStringArray(section.dataJson, 'factors');
  const faqEntries = getFaqEntries(section.dataJson);

  if (section.sectionType === 'CHECKLIST') {
    return (
      <section className="rounded-[28px] bg-slate-50/90 px-6 py-6 ring-1 ring-slate-200/80 md:px-7 md:py-7">
        <div className="space-y-5">
          {section.title ? <h2 className="text-[1.65rem] font-semibold tracking-tight text-slate-950">{section.title}</h2> : null}
          {section.body ? <p className="max-w-3xl text-[15px] leading-7 text-slate-600">{section.body}</p> : null}
          <div className="space-y-3">
            {checklistItems.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 h-4 w-4 flex-none text-emerald-600" />
                <p className="text-[15px] leading-7 text-slate-700">{item}</p>
              </div>
            ))}
          </div>
          {toolLinks.length > 0 ? (
            <div className="border-t border-slate-200/80 pt-4">
              <KnowledgeToolCard toolLink={toolLinks[0]} propertyId={propertyId} />
            </div>
          ) : null}
          {ctas.length > 0 ? (
            <div className="border-t border-slate-200/80 pt-4">
              <KnowledgeCtaCard cta={ctas[0]} propertyId={propertyId} />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (section.sectionType === 'FACT_BOX' || section.sectionType === 'RISK_BOX' || section.sectionType === 'CALLOUT' || section.sectionType === 'CTA') {
    return (
      <section className="rounded-[28px] bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] px-6 py-6 ring-1 ring-slate-200/80 md:px-7 md:py-7">
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              {section.sectionType === 'CALLOUT' ? 'Insight' : section.sectionType.replace(/_/g, ' ')}
            </Badge>
          </div>
          {section.title ? <h2 className="text-[1.6rem] font-semibold tracking-tight text-slate-950">{section.title}</h2> : null}
          <BodyCopy body={section.body} />
          {factItems.length > 0 ? (
            <div className="space-y-3">
              {factItems.map((item) => (
                <div key={item} className="flex items-start gap-3 border-l-2 border-slate-200 pl-4">
                  <FileText className="mt-0.5 h-4 w-4 flex-none text-slate-500" />
                  <p className="text-[15px] leading-7 text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          ) : null}
          {toolLinks.length > 0 ? (
            <div className="border-t border-slate-200/80 pt-4">
              <KnowledgeToolCard toolLink={toolLinks[0]} propertyId={propertyId} />
            </div>
          ) : null}
          {ctas.length > 0 ? (
            <div className="border-t border-slate-200/80 pt-4">
              <KnowledgeCtaCard cta={ctas[0]} propertyId={propertyId} />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (section.sectionType === 'FAQ' && faqEntries.length > 0) {
    return (
      <section className="space-y-5 border-t border-slate-200/80 pt-8">
        {section.title ? <h2 className="text-[1.75rem] font-semibold tracking-tight text-slate-950">{section.title}</h2> : null}
        <div className="space-y-5">
          {faqEntries.map((entry) => (
            <div key={entry.question} className="border-b border-slate-200/70 pb-5 last:border-b-0 last:pb-0">
              <p className="font-semibold text-slate-900">{entry.question}</p>
              <p className="mt-2 text-[15px] leading-7 text-slate-600">{entry.answer}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'space-y-5',
        section.sectionType === 'SUMMARY' && 'border-t border-slate-200/80 pt-8',
        section.sectionType === 'TOOL_EMBED' && 'rounded-[28px] bg-slate-50/80 px-6 py-6 ring-1 ring-slate-200/80 md:px-7'
      )}
    >
      {section.title ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {section.sectionType === 'INTRO' ? <Sparkles className="h-4 w-4 text-slate-400" /> : null}
            {section.sectionType === 'SUMMARY' ? <AlertTriangle className="h-4 w-4 text-slate-400" /> : null}
            <h2
              className={cn(
                'text-[1.8rem] font-semibold tracking-tight text-slate-950 md:text-[2rem]',
                section.sectionType === 'INTRO' && 'text-[2rem] md:text-[2.25rem]'
              )}
            >
              {section.title}
            </h2>
          </div>
        </div>
      ) : null}
      <BodyCopy body={section.body} intro={section.sectionType === 'INTRO'} />
      {toolLinks.length > 0 ? (
        <div className="border-t border-slate-200/80 pt-4">
          <KnowledgeToolCard toolLink={toolLinks[0]} propertyId={propertyId} />
        </div>
      ) : null}
      {ctas.length > 0 ? (
        <div className="border-t border-slate-200/80 pt-4">
          <KnowledgeCtaCard cta={ctas[0]} propertyId={propertyId} />
        </div>
      ) : null}
    </section>
  );
}
