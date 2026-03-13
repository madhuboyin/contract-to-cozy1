import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { KnowledgeArticleCta } from '@/lib/knowledge/types';

function resolveKnowledgeHref(href?: string | null) {
  if (!href) return { href: null, requiresProperty: false };
  if (href.includes(':propertyId')) {
    return { href: '/dashboard/properties', requiresProperty: true };
  }
  return { href, requiresProperty: false };
}

type KnowledgeCtaCardProps = {
  cta: KnowledgeArticleCta;
};

export function KnowledgeCtaCard({ cta }: KnowledgeCtaCardProps) {
  const fallbackHref = cta.productTool?.routePath ?? null;
  const action = resolveKnowledgeHref(cta.href || fallbackHref);
  const eyebrow =
    cta.ctaType === 'DATA_PROMPT'
      ? 'Add data'
      : cta.ctaType === 'REPORT'
        ? 'Report'
        : 'Next step';

  return (
    <Card className="rounded-2xl border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,1))] shadow-sm">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            {eyebrow}
          </Badge>
          {cta.dataPromptKey ? (
            <Badge className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 hover:bg-amber-100">
              Guided
            </Badge>
          ) : null}
        </div>
        <div className="space-y-2">
          <CardTitle className="text-lg text-slate-950">{cta.title}</CardTitle>
          {cta.description ? <p className="text-sm leading-6 text-slate-600">{cta.description}</p> : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {action.requiresProperty ? (
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            Choose a property to continue this action.
          </p>
        ) : null}
        {cta.dataPromptKey ? (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            <Sparkles className="h-3.5 w-3.5" />
            Prompt key: {cta.dataPromptKey}
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        {action.href ? (
          <Button asChild className="w-full rounded-full">
            <Link href={action.href}>
              {cta.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled variant="outline" className="w-full rounded-full">
            Action unavailable
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
