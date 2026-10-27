'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronUp, CircleDollarSign, Home, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { api } from '@/lib/api/client';
import type { EquityPosition, FinancingScenario, FinancingScenarioSummary } from '@/types';
import { cn } from '@/lib/utils';
import FinancingCalculatorSheet from '@/components/features/financing/FinancingCalculatorSheet';
import OptionComparisonTable from '@/components/features/financing/OptionComparisonTable';
import { usd } from '@/components/features/financing/FinancingUtils';

type Grouped = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const SCENARIO_CHANGED_EVENT = 'ask-financing-scenario-changed';

function itemsById(block: Grouped) {
  return Object.fromEntries(block.sections.flatMap((section) => section.items).map((item) => [item.id, item]));
}

export function FinancingNumbers({ block, propertyId }: { block: Grouped; propertyId?: string }) {
  const initial = useMemo(() => itemsById(block), [block]);
  const [equity, setEquity] = useState<EquityPosition | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialPercent = Number(initial['home-equity']?.description?.match(/\(([-\d.]+)%\)/)?.[1] ?? 0);
  const percent = equity ? Number(equity.equityPercent) : initialPercent;
  const core = [
    { id: 'home-value', label: 'Estimated value', value: equity ? usd(equity.estimatedValueCents) : initial['home-value']?.description, icon: Home },
    { id: 'mortgage-balance', label: 'Mortgage balance', value: equity ? usd(equity.mortgageBalanceCents) : initial['mortgage-balance']?.description, icon: CircleDollarSign },
    { id: 'home-equity', label: 'Your equity', value: equity ? `${usd(equity.equityCents)} (${Number(equity.equityPercent)}%)` : initial['home-equity']?.description, icon: WalletCards },
    { id: 'heloc-capacity', label: 'Potential HELOC', value: equity ? (equity.helocEligible ? `Up to ${usd(equity.helocCapacityCents)}` : 'Not likely at this equity level') : initial['heloc-capacity']?.description, icon: CircleDollarSign },
  ].filter((item) => item.value);
  const loanDetails = ['mortgage-type', 'mortgage-rate', 'mortgage-payment', 'mortgage-term', 'loan-to-value'].map((id) => initial[id]).filter(Boolean);

  async function refresh() {
    if (!propertyId || refreshing) return;
    setRefreshing(true); setError(null);
    try { setEquity(await api.refreshEquityPosition(propertyId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Equity could not be refreshed.'); }
    finally { setRefreshing(false); }
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm" data-financing-overview="">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-4 py-4 sm:px-5">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Mortgage & equity</p><h3 className="mt-1 text-lg font-bold text-slate-950">Your financing at a glance</h3></div>
      {propertyId && <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-xs hover:border-emerald-300 disabled:opacity-60"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />{refreshing ? 'Refreshing…' : 'Refresh equity'}</button>}
    </div>
    <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[160px_1fr]">
      <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-950 px-4 py-5 text-white">
        <div className="grid h-24 w-24 place-items-center rounded-full" style={{ background: `conic-gradient(#34d399 0 ${Math.max(0, Math.min(100, percent))}%, #334155 ${Math.max(0, Math.min(100, percent))}% 100%)` }}><div className="grid h-18 w-18 place-items-center rounded-full bg-slate-950 text-xl font-bold">{percent ? `${Math.round(percent)}%` : '—'}</div></div>
        <p className="mt-3 text-xs font-semibold text-slate-300">Home equity</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{core.map(({ id, label, value, icon: Icon }) => <div key={id} className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="h-3.5 w-3.5 text-emerald-600" />{label}</div><p className="mt-1 text-base font-bold text-slate-950">{value}</p><p className="mt-1 text-[11px] text-slate-500">{equity && id === 'home-value' ? `Source: ${equity.estimatedValueSource.toLowerCase().replace(/_/g, ' ')}` : initial[id]?.meta?.[0]}</p></div>)}</div>
    </div>
    {loanDetails.length > 0 && <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-5 sm:px-5">{loanDetails.map((item) => <div key={item.id}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.title}</p><p className="mt-1 text-sm font-semibold text-slate-800">{item.description}</p></div>)}</div>}
    {error && <p className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700">{error}</p>}
  </section>;
}

export function FinancingPlanner({ block, propertyId }: { block: Grouped; propertyId?: string }) {
  const cents = Number(block.sections[0]?.items[0]?.meta?.[0]?.match(/^(\d+) cents$/)?.[1] ?? 0);
  if (!propertyId) return null;
  return <section className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-white shadow-sm" data-financing-planner="">
    <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-4 sm:px-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Scenario planner</p><h3 className="mt-1 text-lg font-bold text-slate-950">{block.title}</h3><p className="mt-1 text-sm text-slate-600">{block.description}</p></div>
    <div className="p-4 sm:p-5"><FinancingCalculatorSheet propertyId={propertyId} initialCostCents={cents || undefined} profileHref={null} onScenarioSaved={() => window.dispatchEvent(new Event(SCENARIO_CHANGED_EVENT))} /></div>
  </section>;
}

export function FinancingOptions({ block }: { block: Grouped }) {
  const options = block.sections.flatMap((section) => section.items);
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5" data-financing-options=""><div className="mb-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Current comparison</p><h3 className="mt-1 text-lg font-bold text-slate-950">Ways to pay</h3><p className="mt-1 text-xs leading-5 text-slate-500">{block.description}</p></div><div className="grid gap-2 md:grid-cols-2">{options.map((option) => <article key={option.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><div className="flex items-start justify-between gap-3"><h4 className="text-sm font-bold text-slate-950">{option.title}</h4>{option.status && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-slate-200">{option.status}</span>}</div><p className="mt-2 text-xs leading-5 text-slate-600">{option.description}</p>{option.meta.length > 0 && <p className="mt-2 text-[11px] font-medium text-slate-500">{option.meta.join(' · ')}</p>}</article>)}</div></section>;
}

export function FinancingScenarios({ block, propertyId }: { block: Grouped; propertyId?: string }) {
  const [scenarios, setScenarios] = useState<FinancingScenarioSummary[]>([]);
  const [detail, setDetail] = useState<FinancingScenario | null>(null);
  const [loading, setLoading] = useState(Boolean(propertyId));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!propertyId) return; setLoading(true); try { setScenarios(await api.listFinancingScenarios(propertyId)); } catch { setError('Saved scenarios could not be loaded.'); } finally { setLoading(false); } }, [propertyId]);
  useEffect(() => { void load(); const changed = () => void load(); window.addEventListener(SCENARIO_CHANGED_EVENT, changed); return () => window.removeEventListener(SCENARIO_CHANGED_EVENT, changed); }, [load]);
  async function open(id: string) { if (!propertyId) return; setBusyId(id); setError(null); try { setDetail(await api.getFinancingScenario(propertyId, id)); } catch { setError('That scenario could not be opened.'); } finally { setBusyId(null); } }
  async function archive(id: string) { if (!propertyId) return; setBusyId(id); setError(null); try { await api.archiveFinancingScenario(propertyId, id); if (detail?.id === id) setDetail(null); await load(); } catch { setError('That scenario could not be archived.'); } finally { setBusyId(null); } }
  if (!propertyId) return null;
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5" data-financing-scenarios=""><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Saved comparisons</p><h3 className="mt-1 text-lg font-bold text-slate-950">{block.title}</h3><p className="mt-1 text-xs text-slate-500">{block.description}</p></div>
    {loading && <div className="grid min-h-24 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>}
    {!loading && scenarios.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">No saved scenarios yet. Use the planner above to create one.</div>}
    <div className="mt-4 space-y-2">{scenarios.map((scenario) => <div key={scenario.id} className="rounded-xl border border-slate-200 bg-slate-50/60"><div className="flex items-center gap-3 p-3"><button type="button" onClick={() => detail?.id === scenario.id ? setDetail(null) : void open(scenario.id)} className="min-w-0 flex-1 text-left"><div className="flex items-center gap-2"><span className="truncate text-sm font-bold text-slate-950">{scenario.title}</span><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">{scenario.status}</span></div><p className="mt-1 text-xs text-slate-500">{usd(scenario.projectCostCents)}{scenario.selectedOption ? ` · ${scenario.selectedOption.toLowerCase().replace(/_/g, ' ')}` : ''}</p></button><button type="button" onClick={() => void archive(scenario.id)} disabled={busyId === scenario.id} aria-label={`Archive ${scenario.title}`} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"><Archive className="h-4 w-4" /></button>{detail?.id === scenario.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</div>{detail?.id === scenario.id && <div className="border-t border-slate-200 bg-white p-3"><p className="mb-3 text-xs text-slate-500">Saved {new Date(detail.createdAt).toLocaleDateString()}{detail.projectDescription ? ` · ${detail.projectDescription}` : ''}</p><OptionComparisonTable results={detail.resultsJson} selectedOption={detail.selectedOption} /></div>}</div>)}</div>
    {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
  </section>;
}
