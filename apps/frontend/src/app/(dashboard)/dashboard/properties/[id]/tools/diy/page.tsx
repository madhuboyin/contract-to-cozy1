'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { DiySkillProfile, DiyProjectSummary, DiyTemplateSummary } from '@/types';
import SkillProfileCard from '@/components/features/diy/SkillProfileCard';
import TemplateCard from '@/components/features/diy/TemplateCard';
import AiGuideSheet from '@/components/features/diy/AiGuideSheet';
import { STATUS_LABELS, STATUS_COLOR } from '@/components/features/diy/DiyUtils';
import { track } from '@/lib/analytics/events';

export default function PropertyDiyToolPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const propertyId = params.id;

  const [skillProfile, setSkillProfile] = useState<DiySkillProfile | null>(null);
  const [activeProjects, setActiveProjects] = useState<DiyProjectSummary[]>([]);
  const [featured, setFeatured] = useState<DiyTemplateSummary[]>([]);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    Promise.all([
      api.getDiySkillProfile().then(setSkillProfile).catch(() => null),
      api.getFeaturedDiyTemplates().then(setFeatured).catch(() => []),
      api.listDiyProjects(propertyId, { status: ['PLANNING', 'IN_PROGRESS'] }).then((r) => setActiveProjects(r.items)).catch(() => []),
    ]).finally(() => setLoading(false));
    track('workflow_started', { tool: 'diy', propertyId, entryPoint: 'direct' });
  }, [propertyId]);

  function handleGuideStarted(guideId: string) {
    setShowAiSheet(false);
    const poll = setInterval(async () => {
      try {
        const guide = await api.getDiyAiGuide(propertyId, guideId);
        if (guide.status === 'COMPLETED') {
          clearInterval(poll);
          const project = await api.createDiyProject(propertyId, { aiGuideId: guide.id });
          track('action_completed', { tool: 'diy', actionType: 'create_project', propertyId });
          router.push(`/dashboard/diy/projects/${project.id}?propertyId=${propertyId}`);
        } else if (guide.status === 'FAILED') {
          clearInterval(poll);
        }
      } catch { clearInterval(poll); }
    }, 3000);
    setTimeout(() => clearInterval(poll), 60000);
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 pb-10">
      <div>
        <p className="text-xs text-[hsl(var(--mobile-text-muted))]">Home Tool</p>
        <h1 className="text-xl font-bold">DIY Project Center</h1>
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">Step-by-step guides for projects you can do yourself</p>
      </div>

      {skillProfile ? (
        <SkillProfileCard profile={skillProfile} />
      ) : (
        <Link
          href="/dashboard/diy/assess"
          className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[hsl(var(--mobile-brand-strong))]/30 bg-[hsl(var(--mobile-brand-strong))]/5 p-4"
        >
          <Wrench className="h-6 w-6 text-[hsl(var(--mobile-brand-strong))]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Tell us your skill level</p>
            <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">Get personalised recommendations — 3 minutes</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </Link>
      )}

      {activeProjects.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-semibold">Active Projects</p>
          <div className="space-y-2">
            {activeProjects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/diy/projects/${p.id}?propertyId=${propertyId}`}
                className="flex items-center gap-3 rounded-xl border bg-[hsl(var(--mobile-card-bg))] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLOR[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                    <span className="text-xs text-[hsl(var(--mobile-text-muted))]">{p.completedStepCount}/{p.requiredStepCount} steps</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Popular Projects</p>
          <Link href={`/dashboard/diy/templates?propertyId=${propertyId}`} className="text-xs text-[hsl(var(--mobile-brand-strong))]">
            Browse all →
          </Link>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {featured.map((t) => (
            <TemplateCard key={t.id} template={t} propertyId={propertyId} compact />
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => setShowAiSheet(true)}
        className="w-full rounded-2xl border-2 border-dashed border-neutral-200 py-4 text-sm font-medium text-[hsl(var(--mobile-text-secondary))]"
      >
        Don't see your project? Describe it →
      </button>

      {showAiSheet && (
        <AiGuideSheet
          propertyId={propertyId}
          onGuideStarted={handleGuideStarted}
          onClose={() => setShowAiSheet(false)}
        />
      )}
    </div>
  );
}
