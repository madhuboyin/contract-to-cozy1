'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MobileFilterSurface,
  MobilePageContainer,
  MobilePageIntro,
} from '@/components/mobile/dashboard/MobilePrimitives';
import TrustStrip from './TrustStrip';
import { CTC_INTERACTION_RULES_V1 } from '@/lib/design-system/tokenGovernance';

interface ToolWorkspaceTemplateProps {
  backHref: string;
  backLabel: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  trust?: {
    confidenceLabel: string;
    freshnessLabel: string;
    sourceLabel: string;
    rationale?: string | null;
  };
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

      {trust ? (
        <TrustStrip
          confidenceLabel={trust.confidenceLabel}
          freshnessLabel={trust.freshnessLabel}
          sourceLabel={trust.sourceLabel}
          rationale={trust.rationale}
        />
      ) : null}

      {rail ? (
        <MobileFilterSurface className="lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:rounded-none">
          {rail}
        </MobileFilterSurface>
      ) : null}

      {children}
    </MobilePageContainer>
  );
}
