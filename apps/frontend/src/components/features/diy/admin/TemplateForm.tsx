'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import type {
  AdminDiyTemplateDetail,
  AdminDiyTemplatePayload,
  DiyProjectCategory,
  DiyDifficultyLevel,
  DiySkillLevel,
  DiySafetyLevel,
  DiyPermitRequirement,
  DiyTemplateStepInput,
  DiyTemplateMaterialInput,
  DiyTemplateToolInput,
} from '@/types';
import StepEditor from './StepEditor';
import MaterialEditor from './MaterialEditor';
import ToolEditor from './ToolEditor';
import { formatMinutes } from '../DiyUtils';

interface Props {
  templateId?: string;
  initial?: AdminDiyTemplateDetail;
}

const CATEGORIES: { value: DiyProjectCategory; label: string }[] = [
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'GENERAL', label: 'General' },
  { value: 'EXTERIOR', label: 'Exterior' },
  { value: 'FLOORING', label: 'Flooring' },
  { value: 'APPLIANCE', label: 'Appliances' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'OTHER', label: 'Other' },
];

const DIFFICULTIES: { value: DiyDifficultyLevel; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'HARD', label: 'Hard' },
  { value: 'EXPERT_ONLY', label: 'Expert Only' },
];

const SKILL_LEVELS: { value: DiySkillLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
];

const SAFETY_LEVELS: { value: DiySafetyLevel; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'HIGH', label: 'High' },
];

const PERMIT_REQUIREMENTS = [
  { value: 'NOT_REQUIRED', label: 'Not Required' },
  { value: 'LIKELY_NOT_REQUIRED', label: 'Likely Not Required' },
  { value: 'UNKNOWN', label: 'Unknown' },
  { value: 'LIKELY_REQUIRED', label: 'Likely Required' },
  { value: 'REQUIRED', label: 'Required' },
  { value: 'DATA_UNAVAILABLE', label: 'Data Unavailable' },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function centsToDisplay(cents?: number) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

function displayToCents(val: string) {
  const n = parseFloat(val);
  return isNaN(n) ? undefined : Math.round(n * 100);
}

function sectionTitle(s: string) {
  return <h2 className="text-base font-semibold text-neutral-800 border-b border-neutral-200 pb-2 mb-4">{s}</h2>;
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">
        {label}{required && ' *'}
      </label>
      {children}
      {help && <p className="mt-1 text-xs text-neutral-400">{help}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
const selectCls = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

export default function TemplateForm({ templateId, initial }: Props) {
  const router = useRouter();
  const isEdit = !!templateId;

  const [title, setTitle] = useState(initial?.title ?? '');
  const [slugManual, setSlugManual] = useState(!!initial?.slug);
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [category, setCategory] = useState<DiyProjectCategory>(initial?.category ?? 'GENERAL');
  const [shortDescription, setShortDescription] = useState(initial?.shortDescription ?? '');
  const [longDescription, setLongDescription] = useState(initial?.longDescription ?? '');
  const [difficultyLevel, setDifficultyLevel] = useState<DiyDifficultyLevel>(initial?.difficultyLevel ?? 'EASY');
  const [requiredSkillLevel, setRequiredSkillLevel] = useState<DiySkillLevel>(initial?.requiredSkillLevel ?? 'BEGINNER');
  const [safetyLevel, setSafetyLevel] = useState<DiySafetyLevel>(initial?.safetyLevel ?? 'LOW');
  const [permitRequirement, setPermitRequirement] = useState(initial?.permitRequirement ?? 'UNKNOWN');
  const [estimatedMinutes, setEstimatedMinutes] = useState(initial?.estimatedMinutes ?? 30);
  const [matCostMin, setMatCostMin] = useState(centsToDisplay(initial?.estimatedMaterialCostMinCents));
  const [matCostMax, setMatCostMax] = useState(centsToDisplay(initial?.estimatedMaterialCostMaxCents));
  const [proCostMin, setProCostMin] = useState(centsToDisplay(initial?.professionalCostMinCents));
  const [proCostMax, setProCostMax] = useState(centsToDisplay(initial?.professionalCostMaxCents));
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [featuredOrder, setFeaturedOrder] = useState(initial?.featuredOrder?.toString() ?? '');
  const [geminiHint, setGeminiHint] = useState(initial?.geminiPromptHint ?? '');
  const [steps, setSteps] = useState<DiyTemplateStepInput[]>(
    (initial?.steps ?? []).map(({ title, description, estimatedMinutes, safetyNote, tipNote, imageUrl, isOptional }) => ({
      title, description, estimatedMinutes, safetyNote, tipNote, imageUrl, isOptional,
    }))
  );
  const [materials, setMaterials] = useState<DiyTemplateMaterialInput[]>(
    (initial?.materials ?? []).map(({ name, unit, quantityFormula, unitPriceCents, isOptional, purchaseNote }) => ({
      name, unit, quantityFormula, unitPriceCents, isOptional, purchaseNote,
    }))
  );
  const [tools, setTools] = useState<DiyTemplateToolInput[]>(
    (initial?.tools ?? []).map(({ name, canonicalId, isRequired, defaultToolAction, rentDailyPriceCents, buyEstimatePriceCents }) => ({
      name, canonicalId, isRequired, defaultToolAction, rentDailyPriceCents, buyEstimatePriceCents,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  function addTag(raw: string) {
    const t = raw.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }

  function buildPayload(): AdminDiyTemplatePayload {
    return {
      slug,
      title,
      shortDescription,
      longDescription: longDescription || undefined,
      category,
      difficultyLevel,
      requiredSkillLevel,
      safetyLevel,
      permitRequirement,
      estimatedMinutes,
      estimatedMaterialCostMinCents: displayToCents(matCostMin),
      estimatedMaterialCostMaxCents: displayToCents(matCostMax),
      professionalCostMinCents: displayToCents(proCostMin),
      professionalCostMaxCents: displayToCents(proCostMax),
      tags,
      featuredOrder: featuredOrder ? parseInt(featuredOrder) : undefined,
      geminiPromptHint: geminiHint || undefined,
      steps: steps.map((s, idx) => ({ ...s, stepNumber: idx + 1 })),
      materials: materials.map((m, idx) => ({ ...m, sortOrder: idx })),
      tools: tools.map((t, idx) => ({ ...t, sortOrder: idx })),
    };
  }

  // Saving never changes lifecycle state (ADMIN_MODULE_FRD.md §10.6) —
  // submit/approve/publish/archive happen via the templates list actions or
  // the Pending Reviews workspace, each with a required reason.
  async function save() {
    setError('');
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await api.adminUpdateDiyTemplate(templateId!, payload);
      } else {
        await api.adminCreateDiyTemplate(payload);
      }
      router.push('/dashboard/admin/diy/templates');
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-32">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Section 1: Core Details */}
      <div className="mb-8">
        {sectionTitle('Core Details')}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title" required>
              <input
                type="text"
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
                placeholder="Replace HVAC Air Filter"
              />
            </Field>
            <Field label="Slug" required help="Lowercase, hyphens only. Auto-generated from title; editable.">
              <input
                type="text"
                maxLength={100}
                value={slug}
                onChange={(e) => { setSlugManual(true); setSlug(e.target.value); }}
                className={inputCls}
                placeholder="hvac-filter-replacement"
              />
            </Field>
          </div>
          <Field label="Category" required>
            <select value={category} onChange={(e) => setCategory(e.target.value as DiyProjectCategory)} className={selectCls}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Short Description" required help={`${shortDescription.length}/200`}>
            <input
              type="text"
              maxLength={200}
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              className={inputCls}
              placeholder="One-line summary for template cards"
            />
          </Field>
          <Field label="Long Description" help="Supports markdown">
            <textarea
              rows={4}
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              className={inputCls}
              placeholder="Full description shown on template detail page"
            />
          </Field>
        </div>
      </div>

      {/* Section 2: Difficulty and Safety */}
      <div className="mb-8">
        {sectionTitle('Difficulty & Safety')}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Difficulty Level" required>
            <select value={difficultyLevel} onChange={(e) => setDifficultyLevel(e.target.value as DiyDifficultyLevel)} className={selectCls}>
              {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Required Skill Level" required help="Minimum skill level for a DIY_RECOMMENDED verdict">
            <select value={requiredSkillLevel} onChange={(e) => setRequiredSkillLevel(e.target.value as DiySkillLevel)} className={selectCls}>
              {SKILL_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field
            label="Safety Level"
            required
            help="Only reviewed LOW-risk templates with no expected permit are eligible for homeowner discovery and project creation."
          >
            <select value={safetyLevel} onChange={(e) => setSafetyLevel(e.target.value as DiySafetyLevel)} className={selectCls}>
              {SAFETY_LEVELS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Permit Requirement" required>
            <select
              value={permitRequirement}
              onChange={(e) => setPermitRequirement(e.target.value as DiyPermitRequirement)}
              className={selectCls}
            >
              {PERMIT_REQUIREMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* Section 3: Time and Cost */}
      <div className="mb-8">
        {sectionTitle('Time & Cost')}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estimated Minutes" required help={estimatedMinutes >= 60 ? formatMinutes(estimatedMinutes) : ''}>
            <input
              type="number"
              min={1}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(parseInt(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <div />
          <Field label="Material Cost Min ($)">
            <input type="number" min={0} step={0.01} value={matCostMin} onChange={(e) => setMatCostMin(e.target.value)} className={inputCls} placeholder="12.50" />
          </Field>
          <Field label="Material Cost Max ($)" help="Must be ≥ min if both set">
            <input type="number" min={0} step={0.01} value={matCostMax} onChange={(e) => setMatCostMax(e.target.value)} className={inputCls} placeholder="25.00" />
          </Field>
          <Field label="Professional Cost Min ($)" help="Used to calculate homeowner savings estimate">
            <input type="number" min={0} step={0.01} value={proCostMin} onChange={(e) => setProCostMin(e.target.value)} className={inputCls} placeholder="150.00" />
          </Field>
          <Field label="Professional Cost Max ($)">
            <input type="number" min={0} step={0.01} value={proCostMax} onChange={(e) => setProCostMax(e.target.value)} className={inputCls} placeholder="250.00" />
          </Field>
        </div>
      </div>

      {/* Section 4: Discovery */}
      <div className="mb-8">
        {sectionTitle('Discovery')}
        <div className="space-y-4">
          <Field label="Tags" help="Used for search. Press Enter or comma to add.">
            <div className="flex flex-wrap gap-1 rounded-lg border border-neutral-200 px-3 py-2 min-h-[42px] focus-within:border-blue-500">
              {tags.map((t) => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="text-blue-500 hover:text-blue-800">×</button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); }
                  if (e.key === 'Backspace' && !tagInput && tags.length) setTags(tags.slice(0, -1));
                }}
                onBlur={() => tagInput && addTag(tagInput)}
                className="flex-1 min-w-[80px] text-sm outline-none bg-transparent"
                placeholder={tags.length === 0 ? 'filter, seasonal, HVAC…' : ''}
              />
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Featured Order" help="Integer. If set, appears in featured strip sorted ascending.">
              <input
                type="number"
                min={1}
                value={featuredOrder}
                onChange={(e) => setFeaturedOrder(e.target.value)}
                className={inputCls}
                placeholder="Leave blank for non-featured"
              />
            </Field>
            <div />
          </div>
          <Field label="Gemini Prompt Hint" help="Optional context appended to the Gemini prompt for custom guide generation. Max 500 chars.">
            <textarea
              rows={3}
              maxLength={500}
              value={geminiHint}
              onChange={(e) => setGeminiHint(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
      </div>

      {/* Section 5: Steps */}
      <div className="mb-8">
        {sectionTitle(`Steps (${steps.length})`)}
        <StepEditor steps={steps} onChange={setSteps} />
      </div>

      {/* Section 6: Materials */}
      <div className="mb-8">
        {sectionTitle(`Materials (${materials.length})`)}
        <MaterialEditor materials={materials} onChange={setMaterials} />
      </div>

      {/* Section 7: Tools */}
      <div className="mb-8">
        {sectionTitle(`Tools (${tools.length})`)}
        <ToolEditor tools={tools} onChange={setTools} />
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
        <p className="text-xs text-neutral-500">
          Saving never publishes. Submit, approve, publish, or archive from the templates list or{' '}
          <span className="font-medium">Pending Reviews</span>.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowDiscardDialog(true)}
            disabled={saving}
            className="px-4 py-2 text-sm text-neutral-500 hover:text-neutral-700 disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Discard dialog */}
      {showDiscardDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-semibold text-lg mb-2">Discard changes?</h3>
            <p className="text-sm text-neutral-600 mb-6">
              You have unsaved changes. Leave without saving?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDiscardDialog(false)}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
              >Stay</button>
              <button
                onClick={() => router.push('/dashboard/admin/diy/templates')}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
              >Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
