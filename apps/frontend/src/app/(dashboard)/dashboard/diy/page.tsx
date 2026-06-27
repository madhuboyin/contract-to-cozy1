'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { DiySkillProfile, DiyProjectSummary, DiyTemplateSummary, DiyAiGuide } from '@/types';
import SkillProfileCard from '@/components/features/diy/SkillProfileCard';
import TemplateCard from '@/components/features/diy/TemplateCard';
import AiGuideSheet from '@/components/features/diy/AiGuideSheet';
import { STATUS_LABELS, STATUS_COLOR } from '@/components/features/diy/DiyUtils';

export default function DiyHubPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';

  const [skillProfile, setSkillProfile] = useState<DiySkillProfile | null>(null);
  const [activeProjects, setActiveProjects] = useState<DiyProjectSummary[]>([]);
  const [doneProjects, setDoneProjects] = useState<DiyProjectSummary[]>([]);
  const [featured, setFeatured] = useState<DiyTemplateSummary[]>([]);
  const [pendingGuide, setPendingGuide] = useState<DiyAiGuide | null>(null);
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [doneExpanded, setDoneExpanded] = useState(false);

  useEffect(() => {
    const loads: Promise<unknown>[] = [
      api.getDiySkillProfile().then(setSkillProfile).catch(() => null),
      api.getFeaturedDiyTemplates().then(setFeatured).catch(() => []),
    ];
    if (propertyId) {
      loads.push(
        api.listDiyProjects(propertyId, { status: ['PLANNING', 'IN_PROGRESS'] }).then((r) => setActiveProjects(r.items)).catch(() => []),
        api.listDiyProjects(propertyId, { status: ['COMPLETED', 'ABANDONED', 'HIRED_OUT'] }).then((r) => setDoneProjects(r.items)).catch(() => []),
      );
    }
    Promise.all(loads).finally(() => setLoading(false));
  }, [propertyId]);

  function handleGuideStarted(guideId: string) {
    setShowAiSheet(false);
    if (!propertyId) return;
    const poll = setInterval(async () => {
      try {
        const guide = await api.getDiyAiGuide(propertyId, guideId);
        if (guide.status === 'COMPLETED') {
          clearInterval(poll);
          setPendingGuide(guide);
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

      {/* Skill Profile */}
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
            <p className="text-xs text-[hsl(var(--mobile-text-secondary))]">Get personalised project recommendations — takes 3 minutes</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </Link>
      )}

      {/* Pending AI Guide */}
      {pendingGuide && propertyId && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">Your AI guide is ready!</p>
          <p className="text-xs text-green-700 mt-0.5">{pendingGuide.generatedTitle}</p>
          <button
            type="button"
            onClick={async () => {
              const project = await api.createDiyProject(propertyId, { aiGuideId: pendingGuide.id });
              router.push(`/dashboard/diy/projects/${project.id}?propertyId=${propertyId}`);
              setPendingGuide(null);
            }}
            className="mt-3 rounded-xl bg-green-700 px-4 py-2 text-sm font-medium text-white"
          >
            Start Project
          </button>
        </div>
      )}

      {/* Active Projects */}
      <section>
        <p className="mb-2 text-sm font-semibold">Active Projects</p>
        {activeProjects.length === 0 ? (
          <p className="text-sm text-[hsl(var(--mobile-text-muted))]">No active projects</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {activeProjects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/diy/projects/${p.id}?propertyId=${propertyId}`}
                className="w-52 shrink-0 rounded-2xl border bg-[hsl(var(--mobile-card-bg))] p-4"
              >
                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLOR[p.status]}`}>
                  {STATUS_LABELS[p.status]}
                </span>
                <p className="mt-2 text-sm font-semibold line-clamp-2">{p.title}</p>
                <div className="mt-2 h-1.5 rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))]"
                    style={{ width: p.requiredStepCount > 0 ? `${Math.round((p.completedStepCount / p.requiredStepCount) * 100)}%` : '0%' }}
                  />
                </div>
                <p className="mt-1 text-xs text-[hsl(var(--mobile-text-muted))]">
                  {p.completedStepCount}/{p.requiredStepCount} steps
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Featured Templates */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Popular Projects</p>
          <Link
            href={`/dashboard/diy/templates${propertyId ? `?propertyId=${propertyId}` : ''}`}
            className="text-xs text-[hsl(var(--mobile-brand-strong))]"
          >
            Browse all →
          </Link>
        </div>
        {featured.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {featured.map((t) => (
              <TemplateCard key={t.id} template={t} propertyId={propertyId} compact />
            ))}
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--mobile-text-muted))]">No featured templates yet</p>
        )}
      </section>

      {/* AI Custom Guide */}
      {propertyId && (
        <button
          type="button"
          onClick={() => setShowAiSheet(true)}
          className="w-full rounded-2xl border-2 border-dashed border-neutral-200 py-4 text-sm font-medium text-[hsl(var(--mobile-text-secondary))]"
        >
          Don't see your project? Describe it →
        </button>
      )}

      {/* Completed Projects */}
      {doneProjects.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setDoneExpanded((v) => !v)}
            className="flex items-center gap-1 text-sm font-semibold"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${doneExpanded ? 'rotate-90' : ''}`} />
            Completed &amp; Abandoned ({doneProjects.length})
          </button>
          {doneExpanded && (
            <div className="mt-2 space-y-2">
              {doneProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/diy/projects/${p.id}?propertyId=${propertyId}`}
                  className="flex items-center gap-3 rounded-xl border bg-[hsl(var(--mobile-card-bg))] p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.title}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {showAiSheet && propertyId && (
        <AiGuideSheet
          propertyId={propertyId}
          onGuideStarted={handleGuideStarted}
          onClose={() => setShowAiSheet(false)}
        />
      )}
    </div>
  );
}
