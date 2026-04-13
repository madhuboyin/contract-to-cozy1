export const CTC_TOKEN_GOVERNANCE_V1 = {
  colors: {
    canvas: 'bg-slate-50',
    surface: 'bg-white',
    surfaceMuted: 'bg-slate-50',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-600',
    textMuted: 'text-slate-500',
    brand: 'text-brand-700',
    borderSubtle: 'border-slate-200',
    borderStrong: 'border-slate-300',
    trustSurface: 'border-emerald-200/70 bg-emerald-50/75',
  },
  typography: {
    eyebrow: 'text-xs font-semibold uppercase tracking-[0.1em]',
    titleLg: 'text-2xl font-semibold tracking-tight md:text-3xl',
    titleMd: 'text-xl font-semibold md:text-2xl',
    titleSm: 'text-lg font-semibold',
    body: 'text-sm',
    caption: 'text-xs',
  },
  spacing: {
    page: 'space-y-4',
    section: 'space-y-3',
    cardPadding: 'p-4 md:p-5',
    compactPadding: 'p-3',
  },
  elevation: {
    subtle: 'shadow-sm',
    medium: 'shadow-[0_18px_38px_-28px_rgba(15,23,42,0.65)]',
  },
  radius: {
    card: 'rounded-2xl',
    panel: 'rounded-3xl',
    chip: 'rounded-full',
    input: 'rounded-xl',
  },
} as const;

export const CTC_TEMPLATE_SURFACES_V1 = {
  card: 'rounded-2xl border border-slate-200 bg-white shadow-sm',
  elevatedCard: 'rounded-3xl border border-slate-200 bg-white shadow-[0_18px_38px_-28px_rgba(15,23,42,0.65)]',
  mutedCard: 'rounded-2xl border border-slate-200 bg-slate-50',
  trustCard: 'rounded-2xl border border-emerald-200/70 bg-emerald-50/75',
  insetTile: 'rounded-xl border border-slate-200 bg-white px-3 py-2',
} as const;

export const CTC_INTERACTION_RULES_V1 = {
  tapTarget: 'min-h-[44px]',
  focusRing:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
  interactiveSurface: 'transition-colors hover:bg-slate-50',
} as const;

export const CTC_MOBILE_SHELL_RULES_V1 = {
  pageBottomReserve: 'pb-[calc(8rem+env(safe-area-inset-bottom))] lg:pb-8',
  floatingActionBottomOffset: 'bottom-[calc(5.25rem+env(safe-area-inset-bottom))]',
  floatingActionReserve: 'h-[calc(10rem+env(safe-area-inset-bottom))]',
  chatAwareReserve: 'h-[calc(8rem+env(safe-area-inset-bottom))]',
  compactReserve: 'h-[calc(5.5rem+env(safe-area-inset-bottom))]',
} as const;

