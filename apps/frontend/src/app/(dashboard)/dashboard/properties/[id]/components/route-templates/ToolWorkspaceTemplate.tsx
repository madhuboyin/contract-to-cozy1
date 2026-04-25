'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import PriorityActionHero, { PriorityActionHeroProps } from '@/components/system/PriorityActionHero';
import {
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import TrustStrip from './TrustStrip';
import { CTC_INTERACTION_RULES_V1 } from '@/lib/design-system/tokenGovernance';
import type { TrustContract } from '@/lib/trust/trustContract';

interface ToolWorkspaceTemplateProps {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  trust?: TrustContract;
  priorityAction?: PriorityActionHeroProps;
  rail?: ReactNode;
  introAction?: ReactNode;
  children: ReactNode;
}

export default function ToolWorkspaceTemplate({
  backHref,
  backLabel,
  eyebrow,
  title,
  subtitle,
  trust,
  priorityAction,
  rail,
  introAction,
  children,
}: ToolWorkspaceTemplateProps) {
  return (
    <MobilePageContainer className="space-y-4 lg:max-w-7xl lg:px-8 lg:pb-10">
      <Button variant="ghost" className={`${CTC_INTERACTION_RULES_V1.tapTarget} w-fit px-0 text-muted-foreground`} asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Link>
      </Button>

      <MobilePageIntro
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        action={introAction}
      />

      {/* 2-column on desktop: main content left, rail sidebar right */}
      <div className={cn(
        'space-y-4 lg:space-y-0',
        rail && 'lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6',
      )}>
        {/* Main column: NBA panel + page content */}
        <div className="space-y-4">
          {priorityAction ? (
            <PriorityActionHero
              title={priorityAction.title}
              description={priorityAction.description}
              primaryAction={priorityAction.primaryAction}
              supportingAction={priorityAction.supportingAction}
              impactLabel={priorityAction.impactLabel}
              confidenceLabel={priorityAction.confidenceLabel}
              eyebrow={priorityAction.eyebrow || 'Next Best Action'}
            />
          ) : null}

          {children}
        </div>

        {/* Sidebar column: rail (HomeToolHeader + RelatedTools on desktop, Home tools sheet trigger on mobile) */}
        {rail ? (
          <aside>
            <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
              {rail}
            </MobileFilterSurface>
          </aside>
        ) : null}
      </div>

      {trust ? (
        <TrustStrip
          variant="footnote"
          confidenceLabel={trust.confidenceLabel}
          freshnessLabel={trust.freshnessLabel}
          sourceLabel={trust.sourceLabel}
        />
      ) : null}
    </MobilePageContainer>
  );
}
