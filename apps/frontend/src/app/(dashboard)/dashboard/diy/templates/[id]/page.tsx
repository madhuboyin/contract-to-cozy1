'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { DiyTemplateDetail, DiyDecisionResult } from '@/types';
import DiyDecisionCard from '@/components/features/diy/DiyDecisionCard';
import SafetyWarningBanner from '@/components/features/diy/SafetyWarningBanner';
import { DIFFICULTY_LABELS, DIFFICULTY_COLOR, CATEGORY_EMOJI, formatMinutes, formatCentsRange } from '@/components/features/diy/DiyUtils';

export default function TemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';
  const maintenanceTaskId = searchParams.get('maintenanceTaskId') ?? undefined;

  const [template, setTemplate] = useState<DiyTemplateDetail | null>(null);
  const [decision, setDecision] = useState<DiyDecisionResult | null>(null);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDiyTemplateDetail(params.id)
      .then(async (t) => {
        setTemplate(t);
        if (propertyId) {
          const result = await api.getDiyDecision(propertyId, {
            projectCategory: t.category,
            difficultyLevel: t.difficultyLevel,
            safetyLevel: t.safetyLevel,
            permitRequirement: t.permitRequirement,
            requiredSkillLevel: t.requiredSkillLevel,
            estimatedMinutes: t.estimatedMinutes,
            requiredToolCanonicalIds: t.tools.filter((tl) => tl.canonicalId).map((tl) => tl.canonicalId!),
            estimatedMaterialCostMinCents: t.estimatedMaterialCostMinCents,
            estimatedMaterialCostMaxCents: t.estimatedMaterialCostMaxCents,
            professionalCostMinCents: t.professionalCostMinCents,
            professionalCostMaxCents: t.professionalCostMaxCents,
          }).catch(() => null);
          setDecision(result);
        }
      })
      .catch(() => setError('Template not found'))
      .finally(() => setLoading(false));
  }, [params.id, propertyId]);

  async function handleStart() {
    if (!template || !propertyId) return;
    setStarting(true);
    try {
      const project = await api.createDiyProject(propertyId, {
        templateId: template.id,
        maintenanceTaskId,
        decisionVerdict: decision?.verdict,
        decisionScoreJson: decision ? { score: decision.score, factors: decision.factors } : undefined,
      });
      router.push(`/dashboard/diy/projects/${project.id}?propertyId=${propertyId}`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to start project');
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
      </div>
    );
  }

  if (!template) {
    return <div className="p-4 text-sm text-neutral-500">{error ?? 'Template not found'}</div>;
  }

  const canStart = !decision
    || decision.verdict === 'DIY_RECOMMENDED'
    || decision.verdict === 'BORDERLINE';

  return (
    <div className="space-y-4 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Link href={`/dashboard/diy/templates${propertyId ? `?propertyId=${propertyId}` : ''}`}>
          <ChevronLeft className="h-5 w-5 text-neutral-500" />
        </Link>
        <span className="text-xs text-[hsl(var(--mobile-text-muted))]">Project Library</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-2xl">{CATEGORY_EMOJI[template.category]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLOR[template.difficultyLevel]}`}>
            {DIFFICULTY_LABELS[template.difficultyLevel]}
          </span>
          {template.permitRequirement === 'REQUIRED' && (
            <span className="rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-xs text-orange-700">Permit Required</span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-bold">{template.title}</h1>
        <div className="mt-1 flex gap-3 text-xs text-[hsl(var(--mobile-text-muted))]">
          <span>{formatMinutes(template.estimatedMinutes)}</span>
          {template.estimatedMaterialCostMinCents !== undefined && (
            <span>Materials: {formatCentsRange(template.estimatedMaterialCostMinCents, template.estimatedMaterialCostMaxCents)}</span>
          )}
          {template.professionalCostMinCents !== undefined && (
            <span>Pro: {formatCentsRange(template.professionalCostMinCents, template.professionalCostMaxCents)}</span>
          )}
        </div>
      </div>

      {template.safetyLevel === 'HIGH' && (
        <SafetyWarningBanner message="This project has high safety risk — read all safety notes carefully before starting." level="high" />
      )}

      <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">{template.shortDescription}</p>
      {template.longDescription && (
        <p className="text-sm text-[hsl(var(--mobile-text-secondary))]">{template.longDescription}</p>
      )}

      {/* Decision */}
      {decision && <DiyDecisionCard result={decision} />}

      {/* Steps preview */}
      <div>
        <button
          type="button"
          onClick={() => setStepsExpanded((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border px-4 py-3"
        >
          <span className="text-sm font-semibold">Steps ({template.steps.length})</span>
          {stepsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {stepsExpanded && (
          <ol className="mt-2 space-y-2">
            {template.steps.map((s) => (
              <li key={s.id} className="flex gap-3 rounded-xl border p-3">
                <span className="shrink-0 text-xs text-[hsl(var(--mobile-text-muted))] mt-0.5">{s.stepNumber}.</span>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-[hsl(var(--mobile-text-secondary))] line-clamp-2">{s.description}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Materials summary */}
      {template.materials.length > 0 && (
        <div className="rounded-xl border p-4">
          <p className="text-sm font-semibold mb-2">Materials ({template.materials.length})</p>
          <ul className="space-y-1">
            {template.materials.slice(0, 3).map((m) => (
              <li key={m.id} className="text-xs text-[hsl(var(--mobile-text-secondary))]">· {m.name}</li>
            ))}
            {template.materials.length > 3 && (
              <li className="text-xs text-[hsl(var(--mobile-text-muted))]">and {template.materials.length - 3} more…</li>
            )}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Fixed bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex gap-3">
        <Link
          href={`/providers?category=${template.category}`}
          className="flex-1 rounded-xl border py-3 text-center text-sm font-medium text-neutral-600"
        >
          Book a Pro
        </Link>
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart || starting || !propertyId}
          className="flex-1 rounded-xl bg-[hsl(var(--mobile-brand-strong))] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {starting ? 'Starting…' : canStart ? 'Start Project' : 'Hire Required'}
        </button>
      </div>
    </div>
  );
}
