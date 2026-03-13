import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveIcon } from '@/lib/icons';
import type { KnowledgeArticleToolLink } from '@/lib/knowledge/types';

function resolveKnowledgeHref(href?: string | null) {
  if (!href) return { href: null, requiresProperty: false };
  if (href.includes(':propertyId')) {
    return { href: '/dashboard/properties', requiresProperty: true };
  }
  return { href, requiresProperty: false };
}

type KnowledgeToolCardProps = {
  toolLink: KnowledgeArticleToolLink;
};

export function KnowledgeToolCard({ toolLink }: KnowledgeToolCardProps) {
  const tool = toolLink.productTool;
  const ToolIcon = resolveIcon(tool.iconName, Sparkles);
  const action = resolveKnowledgeHref(tool.routePath);
  const title = toolLink.customTitle || tool.name;
  const body = toolLink.customBody || tool.shortDescription || 'Explore the tool inside Contract-to-Cozy.';
  const buttonLabel = toolLink.ctaLabel || 'Open tool';

  return (
    <Card className="h-full rounded-2xl border-slate-200/80 bg-white shadow-sm">
      <CardHeader className="space-y-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <ToolIcon className="h-5 w-5" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              {tool.toolType.replace(/_/g, ' ')}
            </Badge>
            {tool.badgeLabel ? (
              <Badge className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 hover:bg-sky-100">
                {tool.badgeLabel}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
          <p className="text-sm leading-6 text-slate-600">{body}</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {action.requiresProperty ? (
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            Select a property first to launch this tool.
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        {action.href ? (
          <Button asChild variant={toolLink.isPrimary ? 'default' : 'outline'} className="w-full rounded-full">
            <Link href={action.href}>
              {buttonLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled variant="outline" className="w-full rounded-full">
            Route unavailable
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
