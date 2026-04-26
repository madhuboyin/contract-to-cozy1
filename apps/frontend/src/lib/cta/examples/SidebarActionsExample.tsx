/**
 * Example: Sidebar Actions with CTA Contracts
 * 
 * Shows how to use CTA contracts in dynamic sidebar actions.
 */

'use client';

import { AlertTriangle, ShieldCheck, ClipboardList } from 'lucide-react';
import { cta } from '../builder';

interface SidebarContext {
  propertyId: string;
  signals?: {
    urgentCount?: number;
    gapCount?: number;
    atRisk?: number;
  };
  missingData?: {
    hasInventory?: boolean;
  };
}

interface SidebarAction {
  id: string;
  title: string;
  description: string;
  icon: any;
  href: string;
  priority: string;
  badge?: string;
}

export function buildSidebarActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = `/dashboard/properties/${ctx.propertyId}`;

  // Urgent alerts action
  if (ctx.signals?.urgentCount && ctx.signals.urgentCount > 0) {
    const href = cta('review-urgent-alerts', 'SidebarActionsExample')
      .promises('Review urgent alerts')
      .withCount(ctx.signals.urgentCount, 'urgent issues')
      .withPriority('high')
      .navigatesTo('/dashboard/resolution-center')
      .withParams({
        propertyId: ctx.propertyId,
        filter: 'urgent',
        sort: 'priority',
        expectedCount: ctx.signals.urgentCount,
      })
      .requires('filter-urgent')
      .requires('sort-priority')
      .requires('expected-count-validation')
      .buildHref();

    actions.push({
      id: 'review-urgent-alerts',
      title: 'Review urgent alerts',
      description: `${ctx.signals.urgentCount} urgent issue${ctx.signals.urgentCount > 1 ? 's' : ''} detected`,
      icon: AlertTriangle,
      href,
      priority: 'high',
      badge: 'Urgent',
    });
  }

  // Coverage gaps action
  if (ctx.signals?.gapCount && ctx.signals.gapCount > 0) {
    const href = cta('review-coverage-gaps', 'SidebarActionsExample')
      .promises('Review coverage gaps')
      .withCount(ctx.signals.gapCount, 'gaps')
      .withPriority('high')
      .navigatesTo(`${propPath}/tools/coverage-analysis`)
      .withParams({
        filter: 'gaps',
        highlight: 'true',
        expectedCount: ctx.signals.gapCount,
        source: 'sidebar',
      })
      .requires('filter-gaps')
      .requires('highlight-items')
      .requires('expected-count-validation')
      .buildHref();

    actions.push({
      id: 'review-coverage-gaps',
      title: 'Review coverage gaps',
      description: `${ctx.signals.gapCount} gap${ctx.signals.gapCount > 1 ? 's' : ''} identified`,
      icon: ShieldCheck,
      href,
      priority: 'high',
      badge: 'Action needed',
    });
  }

  // Risk exposure action
  if (ctx.signals?.atRisk && ctx.signals.atRisk > 0) {
    const href = cta('review-risk-exposure', 'SidebarActionsExample')
      .promises('Review risk exposure')
      .withAmount(ctx.signals.atRisk, 'at risk', 'USD')
      .withPriority('medium')
      .navigatesTo(`${propPath}/risk-assessment`)
      .withParams({
        focus: 'exposure',
        amount: ctx.signals.atRisk.toString(),
        highlight: 'true',
      })
      .requires('focus-exposure')
      .requires('amount-validation')
      .buildHref();

    actions.push({
      id: 'review-risk-exposure',
      title: 'Review risk exposure',
      description: `$${Math.round(ctx.signals.atRisk).toLocaleString()} at risk`,
      icon: AlertTriangle,
      href,
      priority: 'medium',
    });
  }

  // Age assessment action
  if (ctx.missingData?.hasInventory === false) {
    const href = cta('complete-age-assessment', 'SidebarActionsExample')
      .promises('Complete age assessment')
      .withPriority('medium')
      .navigatesTo(`${propPath}/inventory`)
      .withParams({
        filter: 'missing-age',
        highlight: 'age-fields',
        action: 'add-ages',
        source: 'sidebar',
      })
      .requires('filter-missing-age')
      .requires('highlight-fields')
      .buildHref();

    actions.push({
      id: 'complete-age-assessment',
      title: 'Complete age assessment',
      description: 'Add appliance ages for better insights',
      icon: ClipboardList,
      href,
      priority: 'medium',
    });
  }

  return actions;
}

/**
 * Example usage in a component
 */
export function SidebarActionsExample({ propertyId }: { propertyId: string }) {
  const context: SidebarContext = {
    propertyId,
    signals: {
      urgentCount: 3,
      gapCount: 5,
      atRisk: 12450,
    },
    missingData: {
      hasInventory: false,
    },
  };

  const actions = buildSidebarActions(context);

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <a
          key={action.id}
          href={action.href}
          className="flex items-start gap-3 rounded-lg border p-3 hover:bg-gray-50"
        >
          <action.icon className="h-5 w-5 text-gray-600" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{action.title}</span>
              {action.badge && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  {action.badge}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{action.description}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
