import { AlertTriangle, CheckCircle2, FileText, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className={cn('space-y-4 text-[15px] leading-7 text-slate-700', intro && 'text-base leading-8 text-slate-800')}>
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
};

export function KnowledgeSectionRenderer({
  section,
  toolLinks = [],
  ctas = [],
}: KnowledgeSectionRendererProps) {
  const checklistItems = getStringArray(section.dataJson, 'items');
  const factItems = getStringArray(section.dataJson, 'factors');
  const faqEntries = getFaqEntries(section.dataJson);

  if (section.sectionType === 'CHECKLIST') {
    return (
      <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          {section.title ? <CardTitle className="text-xl text-slate-950">{section.title}</CardTitle> : null}
          {section.body ? <p className="text-sm leading-6 text-slate-600">{section.body}</p> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {checklistItems.map((item) => (
            <div key={item} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
              <p className="text-sm leading-6 text-slate-700">{item}</p>
            </div>
          ))}
          {toolLinks.length > 0 ? (
            <div className="grid gap-4 pt-3 md:grid-cols-2">
              {toolLinks.map((toolLink) => (
                <KnowledgeToolCard key={toolLink.id} toolLink={toolLink} />
              ))}
            </div>
          ) : null}
          {ctas.length > 0 ? (
            <div className="grid gap-4 pt-3 md:grid-cols-2">
              {ctas.map((cta) => (
                <KnowledgeCtaCard key={cta.id} cta={cta} />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (section.sectionType === 'FACT_BOX' || section.sectionType === 'RISK_BOX' || section.sectionType === 'CALLOUT' || section.sectionType === 'CTA') {
    return (
      <Card className="rounded-3xl border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,1),rgba(255,255,255,1))] shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
              {section.sectionType === 'CALLOUT' ? 'Insight' : section.sectionType.replace(/_/g, ' ')}
            </Badge>
          </div>
          {section.title ? <CardTitle className="text-xl text-slate-950">{section.title}</CardTitle> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <BodyCopy body={section.body} />
          {factItems.length > 0 ? (
            <div className="space-y-2">
              {factItems.map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/80">
                  <FileText className="mt-0.5 h-4 w-4 flex-none text-slate-500" />
                  <p className="text-sm leading-6 text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          ) : null}
          {toolLinks.length > 0 ? (
            <div className="grid gap-4 pt-1 md:grid-cols-2">
              {toolLinks.map((toolLink) => (
                <KnowledgeToolCard key={toolLink.id} toolLink={toolLink} />
              ))}
            </div>
          ) : null}
          {ctas.length > 0 ? (
            <div className="grid gap-4 pt-1 md:grid-cols-2">
              {ctas.map((cta) => (
                <KnowledgeCtaCard key={cta.id} cta={cta} />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (section.sectionType === 'FAQ' && faqEntries.length > 0) {
    return (
      <Card className="rounded-3xl border-slate-200 bg-white shadow-sm">
        <CardHeader>
          {section.title ? <CardTitle className="text-xl text-slate-950">{section.title}</CardTitle> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {faqEntries.map((entry) => (
            <div key={entry.question} className="rounded-2xl border border-slate-200 px-4 py-4">
              <p className="font-semibold text-slate-900">{entry.question}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{entry.answer}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <section className={cn('space-y-4', section.sectionType === 'SUMMARY' && 'rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm')}>
      {section.title ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {section.sectionType === 'INTRO' ? <Sparkles className="h-4 w-4 text-slate-400" /> : null}
            {section.sectionType === 'SUMMARY' ? <AlertTriangle className="h-4 w-4 text-slate-400" /> : null}
            <h2 className={cn('text-2xl font-semibold tracking-tight text-slate-950', section.sectionType === 'INTRO' && 'text-[2rem]')}>
              {section.title}
            </h2>
          </div>
        </div>
      ) : null}
      <BodyCopy body={section.body} intro={section.sectionType === 'INTRO'} />
      {toolLinks.length > 0 ? (
        <div className="grid gap-4 pt-2 md:grid-cols-2">
          {toolLinks.map((toolLink) => (
            <KnowledgeToolCard key={toolLink.id} toolLink={toolLink} />
          ))}
        </div>
      ) : null}
      {ctas.length > 0 ? (
        <div className="grid gap-4 pt-2 md:grid-cols-2">
          {ctas.map((cta) => (
            <KnowledgeCtaCard key={cta.id} cta={cta} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
