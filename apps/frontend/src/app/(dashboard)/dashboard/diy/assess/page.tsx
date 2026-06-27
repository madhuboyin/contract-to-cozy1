'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import type { DiySkillLevel, DiySkillProfilePayload } from '@/types';
import { SKILL_LABELS } from '@/components/features/diy/DiyUtils';

interface Question {
  id: string;
  text: string;
  category: keyof Omit<DiySkillProfilePayload, 'toolsOwnedJson' | 'quizAnswersJson'>;
  options: { value: number; label: string }[];
}

const QUESTIONS: Question[] = [
  { id: 'hvac1', text: 'Have you replaced an HVAC filter or thermostat before?', category: 'hvac', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Once with help' }, { value: 2, label: 'A few times' }, { value: 3, label: 'Many times, confident' }] },
  { id: 'plumbing1', text: 'Have you fixed a running toilet or replaced a faucet?', category: 'plumbing', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Watched but not done it' }, { value: 2, label: 'Done it once or twice' }, { value: 3, label: 'Done it several times' }] },
  { id: 'electrical1', text: 'Have you replaced an outlet, switch, or light fixture?', category: 'electrical', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Only with an electrician' }, { value: 2, label: 'Once or twice on my own' }, { value: 3, label: 'Multiple times, comfortable with it' }] },
  { id: 'painting1', text: 'How would you rate your painting experience?', category: 'painting', options: [{ value: 0, label: 'Never painted' }, { value: 1, label: 'Touch-ups only' }, { value: 2, label: 'Painted full rooms' }, { value: 3, label: 'Interior and exterior projects' }] },
  { id: 'general1', text: 'How comfortable are you with general home repairs?', category: 'general', options: [{ value: 0, label: 'Not at all comfortable' }, { value: 1, label: 'Minor things only' }, { value: 2, label: 'Moderately comfortable' }, { value: 3, label: 'Very comfortable' }] },
  { id: 'exterior1', text: 'Have you done deck cleaning, staining, or gutter cleaning?', category: 'exterior', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Once or twice' }, { value: 2, label: 'Regularly' }, { value: 3, label: 'Many projects, confident' }] },
  { id: 'flooring1', text: 'Have you installed or repaired flooring?', category: 'flooring', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Minor repairs only' }, { value: 2, label: 'Installed a small section' }, { value: 3, label: 'Full room installations' }] },
  { id: 'appliance1', text: 'Have you repaired or maintained home appliances?', category: 'appliance', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Only cleaning filters' }, { value: 2, label: 'Basic repairs' }, { value: 3, label: 'Complex repairs, belt/motor swaps' }] },
  { id: 'landscaping1', text: 'Have you replaced sprinkler heads or installed drainage?', category: 'landscaping', options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Basic lawn care only' }, { value: 2, label: 'Some DIY landscaping' }, { value: 3, label: 'Full landscaping projects' }] },
];

const TOOLS = ['drill', 'stud_finder', 'level', 'utility_knife', 'wet_dry_vac', 'multimeter'];
const TOOL_LABELS: Record<string, string> = {
  drill: 'Cordless Drill',
  stud_finder: 'Stud Finder',
  level: 'Level',
  utility_knife: 'Utility Knife',
  wet_dry_vac: 'Wet/Dry Vac',
  multimeter: 'Multimeter',
};

function scoreToLevel(avg: number): DiySkillLevel {
  if (avg >= 2.1) return 'ADVANCED';
  if (avg >= 1.0) return 'INTERMEDIATE';
  return 'BEGINNER';
}

export default function AssessPage() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0=intro, 1-9=questions, 10=tools, 11=review
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [ownedTools, setOwnedTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalSteps = QUESTIONS.length + 2; // intro + questions + tools + (review handled separately)

  function computeProfile() {
    const cats: (keyof Omit<DiySkillProfilePayload, 'toolsOwnedJson' | 'quizAnswersJson'>)[] = [
      'hvac', 'plumbing', 'electrical', 'painting', 'general', 'exterior', 'flooring', 'appliance', 'landscaping',
    ];
    const result: any = {};
    for (const cat of cats) {
      const vals = QUESTIONS.filter((q) => q.category === cat).map((q) => answers[q.id] ?? 0);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      result[cat] = scoreToLevel(avg);
    }
    return result as Omit<DiySkillProfilePayload, 'toolsOwnedJson' | 'quizAnswersJson'>;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const profile = computeProfile();
    try {
      await api.upsertDiySkillProfile({ ...profile, toolsOwnedJson: ownedTools, quizAnswersJson: answers });
      router.push('/dashboard/diy');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Intro
  if (step === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-3xl">🔧</p>
        <h1 className="text-xl font-bold">Skill Assessment</h1>
        <p className="text-sm text-neutral-500 max-w-xs">
          This takes about 3 minutes. Your answers help us match you with the right projects and give you an accurate DIY vs. hire verdict.
        </p>
        <button
          type="button"
          onClick={() => setStep(1)}
          className="mt-2 w-full max-w-xs rounded-xl bg-[hsl(var(--mobile-brand-strong))] py-3 text-sm font-semibold text-white"
        >
          Start Assessment
        </button>
      </div>
    );
  }

  // Questions
  const qIdx = step - 1;
  if (qIdx < QUESTIONS.length) {
    const q = QUESTIONS[qIdx];
    return (
      <div className="p-4 space-y-6">
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))]" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>
        <p className="text-xs text-neutral-400">Question {step} of {QUESTIONS.length}</p>
        <p className="text-base font-semibold">{q.text}</p>
        <div className="space-y-2">
          {q.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setAnswers((prev) => ({ ...prev, [q.id]: opt.value }));
                setStep((s) => s + 1);
              }}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                answers[q.id] === opt.value
                  ? 'border-[hsl(var(--mobile-brand-strong))] bg-[hsl(var(--mobile-brand-strong))]/10 font-medium'
                  : 'border-neutral-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {step > 1 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className="text-sm text-neutral-400">
            ← Back
          </button>
        )}
      </div>
    );
  }

  // Tools checklist
  if (step === QUESTIONS.length + 1) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-1.5 rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-[hsl(var(--mobile-brand-strong))]" style={{ width: '90%' }} />
        </div>
        <h2 className="text-base font-semibold">Which tools do you own?</h2>
        <p className="text-sm text-neutral-500">This helps us show accurate tool costs when you browse projects.</p>
        <div className="space-y-2">
          {TOOLS.map((tool) => {
            const owned = ownedTools.includes(tool);
            return (
              <button
                key={tool}
                type="button"
                onClick={() =>
                  setOwnedTools((prev) => owned ? prev.filter((t) => t !== tool) : [...prev, tool])
                }
                className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                  owned ? 'border-[hsl(var(--mobile-brand-strong))] bg-[hsl(var(--mobile-brand-strong))]/10' : 'border-neutral-200'
                }`}
              >
                {TOOL_LABELS[tool]}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep((s) => s - 1)} className="flex-1 rounded-xl border py-3 text-sm text-neutral-500">Back</button>
          <button type="button" onClick={() => setStep((s) => s + 1)} className="flex-1 rounded-xl bg-[hsl(var(--mobile-brand-strong))] py-3 text-sm font-semibold text-white">
            Review Results
          </button>
        </div>
      </div>
    );
  }

  // Review
  const profile = computeProfile();
  return (
    <div className="p-4 space-y-4">
      <h2 className="text-base font-semibold">Your Skill Profile</h2>
      <div className="rounded-2xl border divide-y">
        {Object.entries(profile).map(([cat, level]) => (
          <div key={cat} className="flex items-center justify-between px-4 py-3">
            <p className="text-sm capitalize">{cat === 'hvac' ? 'HVAC' : cat}</p>
            <span className="text-sm font-medium text-[hsl(var(--mobile-brand-strong))]">{SKILL_LABELS[level as DiySkillLevel]}</span>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setStep((s) => s - 1)} className="flex-1 rounded-xl border py-3 text-sm text-neutral-500">Back</button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-xl bg-[hsl(var(--mobile-brand-strong))] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
