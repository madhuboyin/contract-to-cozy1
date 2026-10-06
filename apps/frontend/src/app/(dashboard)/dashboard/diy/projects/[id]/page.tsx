'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { DiyProjectDetail, DiyStepStatus, DiyToolAction } from '@/types';
import ProjectStepList from '@/components/features/diy/ProjectStepList';
import MaterialsChecklist from '@/components/features/diy/MaterialsChecklist';
import ToolsList from '@/components/features/diy/ToolsList';
import ProjectCompleteSheet from '@/components/features/diy/ProjectCompleteSheet';
import ViewOnlyNotice from '@/components/features/diy/ViewOnlyNotice';
import { usePropertyWriteAccess } from '@/lib/property/usePropertyWriteAccess';
import { CLOSED_MESSAGE, STALE_MESSAGE, diyErrorCode, openStepsForCompletion } from '@/lib/diy/diyProjectRules';
import { STATUS_LABELS, STATUS_COLOR, CATEGORY_EMOJI } from '@/components/features/diy/DiyUtils';

export default function ProjectTrackerPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';
  const { canWrite, isViewer } = usePropertyWriteAccess(propertyId);

  const [project, setProject] = useState<DiyProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComplete, setShowComplete] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    const p = await api.getDiyProject(propertyId, params.id).catch(() => null);
    setProject(p);
    setLoading(false);
  }, [propertyId, params.id]);

  useEffect(() => { load(); }, [load]);

  // A failed write: a stale or closed project is reloaded and explained; anything else shows the server's own message.
  async function handleWriteError(err: any, fallback: string) {
    const code = diyErrorCode(err);
    if (code === 'DIY_STALE') { await load(); setError(STALE_MESSAGE); return; }
    if (code === 'DIY_PROJECT_CLOSED') { await load(); setError(CLOSED_MESSAGE); return; }
    if (code === 'DIY_STEP_TRANSITION_NOT_ALLOWED' || code === 'DIY_PROJECT_STEPS_INCOMPLETE') { await load(); setError(err?.message ?? fallback); return; }
    setError(err?.message ?? fallback);
  }

  async function handleStepUpdate(stepId: string, status: DiyStepStatus, notes?: string) {
    if (!propertyId || !project) return;
    const step = project.steps.find((candidate) => candidate.id === stepId);
    if (!step) return;
    setError(null);
    try {
      // The change is based on the step version this page loaded; if someone else changed the step meanwhile the server refuses it.
      await api.updateDiyProjectStep(propertyId, project.id, stepId, { status, notes, expectedUpdatedAt: step.updatedAt });
      await load();
    } catch (err: any) {
      await handleWriteError(err, 'Could not update this step. Please try again.');
    }
  }

  async function handleAbandon() {
    if (!propertyId || !project) return;
    if (!confirm('Stop this project?')) return;
    setAbandoning(true);
    setError(null);
    try {
      await api.abandonDiyProject(propertyId, project.id, { hireOut: false, expectedUpdatedAt: project.updatedAt });
      router.push(`/dashboard/diy?propertyId=${propertyId}`);
    } catch (err: any) {
      // The project is unchanged (or was refreshed), so stay here and say so rather than leaving as if it had been stopped.
      await handleWriteError(err, 'Could not stop this project. Please try again.');
      setAbandoning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
      </div>
    );
  }

  if (!project) {
    return <div className="p-4 text-sm text-neutral-500">Project not found</div>;
  }

  const requiredSteps = project.steps.filter((s) => !s.isOptional);
  const completedRequired = requiredSteps.filter((s) => s.status === 'COMPLETED').length;
  // The project can finish only when every required step is completed and every optional step is completed or skipped.
  const openSteps = openStepsForCompletion(project.steps);
  const allDone = openSteps.length === 0;
  const onlyOptionalLeft = openSteps.length > 0 && openSteps.every((step) => step.isOptional);
  const progressPct = requiredSteps.length > 0 ? Math.round((completedRequired / requiredSteps.length) * 100) : 0;
  const isFinished = project.status === 'COMPLETED' || project.status === 'ABANDONED' || project.status === 'HIRED_OUT';

  return (
    <div className="space-y-4 p-4 pb-32">
      {/* Nav */}
      <div className="flex items-center gap-2">
        <Link href={`/dashboard/diy?propertyId=${propertyId}`}>
          <ChevronLeft className="h-5 w-5 text-neutral-500" />
        </Link>
        <span className="text-xs text-[hsl(var(--mobile-text-muted))]">DIY Projects</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="text-xl">{CATEGORY_EMOJI[project.category]}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[project.status]}`}>
            {STATUS_LABELS[project.status]}
          </span>
        </div>
        <h1 className="mt-1 text-lg font-bold">{project.title}</h1>
      </div>

      {/* Progress */}
      {!isFinished && (
        <div>
          <div className="flex justify-between text-xs text-[hsl(var(--mobile-text-muted))] mb-1">
            <span>{completedRequired}/{requiredSteps.length} required steps</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))]" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* AI-generated guide disclaimer (W3/AI-DIY — "evidence limitations"):
          safetyWarningsJson/generatedSummary were captured at guide
          generation time but never surfaced anywhere on the project view —
          the homeowner saw the same UI whether the plan came from an
          admin-curated template or an unverified LLM response. */}
      {project.aiGuideId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">AI-generated project plan</p>
          <p className="text-xs text-amber-800">
            These steps, materials, and tools were generated by AI based on your description. Verify
            details against your specific make/model, local building code, and manufacturer instructions
            before starting.
          </p>
          {project.aiGuide?.safetyWarningsJson && project.aiGuide.safetyWarningsJson.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-amber-800">
              {project.aiGuide.safetyWarningsJson.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Steps */}
      <section>
        <p className="mb-2 text-sm font-semibold">Steps</p>
        {isViewer && <ViewOnlyNotice className="mb-2" />}
        <ProjectStepList
          steps={project.steps}
          onUpdateStep={handleStepUpdate}
          disabled={isFinished}
          readOnly={!canWrite}
        />
      </section>

      {/* Materials */}
      {project.materials.length > 0 && (
        <section>
          <MaterialsChecklist materials={project.materials} />
        </section>
      )}

      {/* Tools */}
      {project.tools.length > 0 && (
        <section>
          <ToolsList tools={project.tools} />
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Fixed bottom actions */}
      {!isFinished && canWrite && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 space-y-2">
          {onlyOptionalLeft && (
            <p data-optional-steps-left="" className="text-center text-xs text-neutral-600">
              {openSteps.length === 1 ? '1 optional step is left' : `${openSteps.length} optional steps are left`}: do {openSteps.length === 1 ? 'it' : 'them'} or skip {openSteps.length === 1 ? 'it' : 'them'} to finish the project.
            </p>
          )}
          {allDone && (
            <button
              type="button"
              onClick={() => setShowComplete(true)}
              className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white"
            >
              Complete Project
            </button>
          )}
          <button
            type="button"
            onClick={handleAbandon}
            disabled={abandoning}
            className="w-full text-center text-sm text-neutral-400 disabled:opacity-50"
          >
            I&apos;ll hire a pro instead
          </button>
        </div>
      )}

      {project.status === 'COMPLETED' && project.homeEventId && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">Project logged to your home timeline!</p>
          <Link href="/dashboard/home-events" className="mt-1 text-xs text-green-700 underline">
            View Home Timeline →
          </Link>
        </div>
      )}

      {showComplete && propertyId && canWrite && (
        <ProjectCompleteSheet
          propertyId={propertyId}
          projectId={project.id}
          expectedUpdatedAt={project.updatedAt}
          onCompleted={async () => {
            setShowComplete(false);
            await load();
          }}
          onOutOfDate={async (message) => {
            setShowComplete(false);
            await load();
            setError(message);
          }}
          onClose={() => setShowComplete(false)}
        />
      )}
    </div>
  );
}
