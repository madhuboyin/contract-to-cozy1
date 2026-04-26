// apps/frontend/src/lib/sidebar/dynamicSidebarActions.ts
/**
 * Dynamic Sidebar Intelligence Rail
 * 
 * Centralized system for generating page-aware, context-sensitive sidebar actions.
 * Actions adapt based on current route, property context, signals, and user intent.
 */

import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  CalendarClock,
  Plus,
  ShieldCheck,
  FileText,
  Home,
  Wrench,
  TrendingUp,
  Upload,
  Search,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Package,
  Camera,
  ClipboardList,
  MapPin,
  Sparkles,
  Calculator,
  FileCheck,
  Building,
  Zap,
} from 'lucide-react';

export type SidebarActionPriority = 'high' | 'medium' | 'low';

export type SidebarActionGroup = 
  | 'recommended-next'
  | 'contextual-actions'
  | 'missing-info'
  | 'protection-opportunities'
  | 'quick-actions';

export interface SidebarAction {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  onClickAction?: string;
  priority?: SidebarActionPriority;
  badge?: string;
  confidenceLabel?: string;
  sourceLabel?: string;
  group?: SidebarActionGroup;
}

export interface SidebarContext {
  route: string;
  propertyId?: string;
  signals?: {
    urgentCount?: number;
    atRisk?: number;
    gapCount?: number;
    highConfidence?: number;
  };
  missingData?: {
    hasInsurance?: boolean;
    hasWarranties?: boolean;
    hasInventory?: boolean;
    hasDocuments?: boolean;
    hasFinanceSnapshot?: boolean;
    hasRooms?: boolean;
  };
  activeTool?: string;
  currentAsset?: string;
  currentRoom?: string;
  currentGuidanceStep?: string;
  property?: {
    address?: string;
    type?: string;
    yearBuilt?: number;
  };
}

type RouteFamily = 
  | 'today'
  | 'my-home'
  | 'protect'
  | 'save'
  | 'fix'
  | 'vault'
  | 'home-lab'
  | 'inventory'
  | 'rooms'
  | 'guidance'
  | 'tools'
  | 'documents'
  | 'unknown';

function getRouteFamily(route: string): RouteFamily {
  if (route.includes('/today') || route === '/dashboard') return 'today';
  if (route.includes('/my-home') || route.includes('/properties/') && !route.includes('/tools/')) return 'my-home';
  if (route.includes('/protect')) return 'protect';
  if (route.includes('/save')) return 'save';
  if (route.includes('/fix') || route.includes('/resolution-center')) return 'fix';
  if (route.includes('/vault')) return 'vault';
  if (route.includes('/home-lab')) return 'home-lab';
  if (route.includes('/inventory')) return 'inventory';
  if (route.includes('/rooms')) return 'rooms';
  if (route.includes('/guidance')) return 'guidance';
  if (route.includes('/tools/')) return 'tools';
  if (route.includes('/documents')) return 'documents';
  return 'unknown';
}

function getPropertyPath(propertyId?: string): string {
  return propertyId ? `/dashboard/properties/${propertyId}` : '/dashboard';
}

// ============================================================================
// ACTION GENERATORS BY ROUTE FAMILY
// ============================================================================

function getTodayActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // High priority: Urgent issues
  if (ctx.signals?.urgentCount && ctx.signals.urgentCount > 0) {
    actions.push({
      id: 'review-urgent-alerts',
      title: ctx.signals.urgentCount === 1 ? 'Review urgent issue' : 'Review urgent issues',
      description: `${ctx.signals.urgentCount} urgent issue${ctx.signals.urgentCount > 1 ? 's' : ''} detected`,
      icon: AlertTriangle,
      href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}&filter=urgent&sort=priority`,
      priority: 'high',
      badge: 'Urgent',
      group: 'recommended-next',
    });
  }

  // Run full scan
  actions.push({
    id: 'run-full-scan',
    title: 'Run full scan',
    description: 'Refresh home signals',
    icon: BarChart3,
    onClickAction: 'refresh-signals',
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Missing data opportunities
  if (ctx.missingData?.hasInventory === false) {
    actions.push({
      id: 'complete-age-assessment',
      title: 'Complete age assessment',
      description: 'Add appliance ages for better insights',
      icon: ClipboardList,
      href: `${propPath}/inventory`,
      priority: 'medium',
      group: 'missing-info',
    });
  }

  // Add appliance
  actions.push({
    id: 'add-appliance',
    title: 'Add appliance',
    description: 'Track a new home item',
    icon: Plus,
    href: `${propPath}/inventory`,
    priority: 'low',
    group: 'contextual-actions',
  });

  // Schedule maintenance
  actions.push({
    id: 'schedule-maintenance',
    title: 'Schedule maintenance',
    description: 'Stay ahead of issues',
    icon: CalendarClock,
    href: '/dashboard/maintenance',
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getMyHomeActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Missing rooms
  if (ctx.missingData?.hasRooms === false) {
    actions.push({
      id: 'add-room',
      title: 'Add room',
      description: 'Map your home layout',
      icon: MapPin,
      href: `${propPath}/rooms`,
      priority: 'high',
      group: 'recommended-next',
    });
  }

  // Add appliance
  actions.push({
    id: 'add-appliance',
    title: 'Add appliance',
    description: 'Track home systems and items',
    icon: Plus,
    href: `${propPath}/inventory`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Upload document
  if (ctx.missingData?.hasDocuments === false) {
    actions.push({
      id: 'upload-property-document',
      title: 'Upload property document',
      description: 'Add inspection or appraisal',
      icon: Upload,
      href: `${propPath}/vault`,
      priority: 'medium',
      group: 'missing-info',
    });
  }

  // Run property scan
  actions.push({
    id: 'run-property-scan',
    title: 'Run property scan',
    description: 'Refresh home intelligence',
    icon: BarChart3,
    onClickAction: 'refresh-signals',
    priority: 'medium',
    group: 'contextual-actions',
  });

  // View health score
  actions.push({
    id: 'view-health-score',
    title: 'View health score',
    description: 'Check property wellness',
    icon: Sparkles,
    href: `${propPath}/health-score`,
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getProtectActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Coverage gaps
  if (ctx.signals?.gapCount && ctx.signals.gapCount > 0) {
    actions.push({
      id: 'review-coverage-gaps',
      title: 'Review coverage gaps',
      description: `${ctx.signals.gapCount} gap${ctx.signals.gapCount > 1 ? 's' : ''} identified`,
      icon: ShieldCheck,
      href: `${propPath}/tools/coverage-analysis?filter=gaps&highlight=true&expectedCount=${ctx.signals.gapCount}`,
      priority: 'high',
      badge: 'Action needed',
      group: 'recommended-next',
    });
  }

  // Upload insurance policy
  if (ctx.missingData?.hasInsurance === false) {
    actions.push({
      id: 'upload-insurance-policy',
      title: 'Upload insurance policy',
      description: 'Track coverage details',
      icon: Upload,
      href: `${propPath}/vault`,
      priority: 'high',
      group: 'missing-info',
    });
  }

  // Check warranty coverage
  if (ctx.missingData?.hasWarranties === false) {
    actions.push({
      id: 'check-warranty-coverage',
      title: 'Check warranty coverage',
      description: 'Review appliance warranties',
      icon: FileCheck,
      href: `${propPath}/inventory`,
      priority: 'medium',
      group: 'protection-opportunities',
    });
  }

  // Run coverage assessment
  actions.push({
    id: 'run-coverage-assessment',
    title: 'Run coverage assessment',
    description: 'Analyze protection posture',
    icon: BarChart3,
    href: `${propPath}/tools/coverage-analysis`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Review risk exposure
  if (ctx.signals?.atRisk && ctx.signals.atRisk > 0) {
    actions.push({
      id: 'review-risk-exposure',
      title: 'Review risk exposure',
      description: `$${Math.round(ctx.signals.atRisk).toLocaleString()} at risk`,
      icon: AlertTriangle,
      href: `${propPath}/risk-assessment?focus=exposure&amount=${Math.round(ctx.signals.atRisk)}`,
      priority: 'medium',
      group: 'contextual-actions',
    });
  }

  return actions;
}

function getSaveActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Review savings opportunities
  actions.push({
    id: 'review-savings-opportunities',
    title: 'Review savings opportunities',
    description: 'Find cost reduction paths',
    icon: DollarSign,
    href: `${propPath}/tools/home-savings`,
    priority: 'high',
    group: 'recommended-next',
  });

  // Compare cost growth
  actions.push({
    id: 'compare-cost-growth',
    title: 'Compare cost growth',
    description: 'Track expense trends',
    icon: TrendingUp,
    href: `${propPath}/tools/cost-growth`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Run sell vs hold vs rent
  actions.push({
    id: 'run-sell-hold-rent',
    title: 'Run sell vs hold vs rent simulator',
    description: 'Compare ownership scenarios',
    icon: Calculator,
    href: `${propPath}/tools/sell-hold-rent`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Review recurring cost increases
  actions.push({
    id: 'review-recurring-costs',
    title: 'Review recurring cost increases',
    description: 'Identify expense drivers',
    icon: TrendingUp,
    href: `${propPath}/tools/cost-growth`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Check tax/insurance trends
  if (ctx.missingData?.hasFinanceSnapshot === false) {
    actions.push({
      id: 'check-tax-insurance-trends',
      title: 'Check tax / insurance trends',
      description: 'Add finance snapshot for insights',
      icon: FileText,
      href: `${propPath}`,
      priority: 'low',
      group: 'missing-info',
    });
  }

  return actions;
}

function getFixActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Urgent maintenance
  if (ctx.signals?.urgentCount && ctx.signals.urgentCount > 0) {
    actions.push({
      id: 'review-urgent-maintenance',
      title: 'Review urgent maintenance',
      description: `${ctx.signals.urgentCount} priority item${ctx.signals.urgentCount > 1 ? 's' : ''}`,
      icon: Wrench,
      href: `/dashboard/resolution-center?propertyId=${ctx.propertyId}`,
      priority: 'high',
      badge: 'Urgent',
      group: 'recommended-next',
    });
  }

  // Start repair guidance
  actions.push({
    id: 'start-repair-guidance',
    title: 'Start repair guidance',
    description: 'Get step-by-step help',
    icon: Sparkles,
    href: `${propPath}/guidance`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Add contractor quote
  actions.push({
    id: 'add-contractor-quote',
    title: 'Add contractor quote',
    description: 'Compare repair costs',
    icon: FileText,
    href: `${propPath}/bookings`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Validate repair cost
  actions.push({
    id: 'validate-repair-cost',
    title: 'Validate repair cost',
    description: 'Check market rates',
    icon: Calculator,
    href: `${propPath}/tools/cost-explainer`,
    priority: 'low',
    group: 'contextual-actions',
  });

  // Schedule maintenance
  actions.push({
    id: 'schedule-maintenance',
    title: 'Schedule maintenance',
    description: 'Book service appointment',
    icon: CalendarClock,
    href: '/dashboard/maintenance',
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getVaultActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Upload document
  actions.push({
    id: 'upload-document',
    title: 'Upload document',
    description: 'Add property records',
    icon: Upload,
    href: `${propPath}/vault`,
    priority: 'high',
    group: 'recommended-next',
  });

  // Add warranty
  if (ctx.missingData?.hasWarranties === false) {
    actions.push({
      id: 'add-warranty',
      title: 'Add warranty',
      description: 'Track coverage expiration',
      icon: FileCheck,
      href: `${propPath}/inventory`,
      priority: 'medium',
      group: 'missing-info',
    });
  }

  // Add receipt
  actions.push({
    id: 'add-receipt',
    title: 'Add receipt',
    description: 'Document home expenses',
    icon: FileText,
    href: `${propPath}/vault`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Review missing documents
  if (ctx.missingData?.hasDocuments === false) {
    actions.push({
      id: 'review-missing-documents',
      title: 'Review missing documents',
      description: 'Complete property records',
      icon: ClipboardList,
      href: `${propPath}/vault`,
      priority: 'medium',
      group: 'missing-info',
    });
  }

  // Organize property records
  actions.push({
    id: 'organize-property-records',
    title: 'Organize property records',
    description: 'Tag and categorize files',
    icon: FileText,
    href: `${propPath}/vault`,
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getHomeLabActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Run experiment
  actions.push({
    id: 'run-experiment',
    title: 'Run experiment / simulator',
    description: 'Test ownership scenarios',
    icon: Zap,
    href: '/dashboard/home-lab',
    priority: 'high',
    group: 'recommended-next',
  });

  // Review insights
  actions.push({
    id: 'review-insights',
    title: 'Review insights',
    description: 'Explore property intelligence',
    icon: Sparkles,
    href: `${propPath}`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Compare scenarios
  actions.push({
    id: 'compare-scenarios',
    title: 'Compare scenarios',
    description: 'Analyze different outcomes',
    icon: BarChart3,
    href: `${propPath}/tools/sell-hold-rent`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Explore tools
  actions.push({
    id: 'explore-tools',
    title: 'Explore property intelligence tools',
    description: 'Discover analysis features',
    icon: Search,
    href: '/dashboard/home-lab',
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getInventoryActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Add inventory item
  actions.push({
    id: 'add-inventory-item',
    title: 'Add inventory item',
    description: 'Track appliance or system',
    icon: Plus,
    href: `${propPath}/inventory`,
    priority: 'high',
    group: 'recommended-next',
  });

  // Scan room
  actions.push({
    id: 'scan-room',
    title: 'Scan room',
    description: 'Quick capture with camera',
    icon: Camera,
    href: `${propPath}/inventory`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Review uncovered assets
  if (ctx.signals?.gapCount && ctx.signals.gapCount > 0) {
    actions.push({
      id: 'review-uncovered-assets',
      title: 'Review uncovered assets',
      description: `${ctx.signals.gapCount} item${ctx.signals.gapCount > 1 ? 's' : ''} without coverage`,
      icon: ShieldCheck,
      href: `${propPath}/tools/coverage-analysis`,
      priority: 'medium',
      group: 'protection-opportunities',
    });
  }

  // Add purchase date
  actions.push({
    id: 'add-purchase-date',
    title: 'Add purchase date',
    description: 'Improve age tracking',
    icon: CalendarClock,
    href: `${propPath}/inventory`,
    priority: 'low',
    group: 'missing-info',
  });

  // Add warranty details
  if (ctx.missingData?.hasWarranties === false) {
    actions.push({
      id: 'add-warranty-details',
      title: 'Add warranty details',
      description: 'Track coverage expiration',
      icon: FileCheck,
      href: `${propPath}/inventory`,
      priority: 'low',
      group: 'missing-info',
    });
  }

  return actions;
}

function getRoomsActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Add room
  actions.push({
    id: 'add-room',
    title: 'Add room',
    description: 'Map your home layout',
    icon: MapPin,
    href: `${propPath}/rooms`,
    priority: 'high',
    group: 'recommended-next',
  });

  // Add inventory to room
  actions.push({
    id: 'add-inventory-to-room',
    title: 'Add inventory item',
    description: 'Track items in this room',
    icon: Package,
    href: `${propPath}/inventory`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Scan room
  actions.push({
    id: 'scan-room',
    title: 'Scan room',
    description: 'Quick capture with camera',
    icon: Camera,
    href: `${propPath}/inventory`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  return actions;
}

function getGuidanceActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Continue guidance journey
  if (ctx.currentGuidanceStep) {
    actions.push({
      id: 'continue-guidance-journey',
      title: 'Continue current guidance journey',
      description: 'Complete next step',
      icon: Sparkles,
      href: `${propPath}/guidance`,
      priority: 'high',
      group: 'recommended-next',
    });
  }

  // Check coverage for item
  if (ctx.currentAsset) {
    actions.push({
      id: 'check-coverage-for-item',
      title: 'Check coverage for this item',
      description: 'Review warranty and insurance',
      icon: ShieldCheck,
      href: `${propPath}/tools/coverage-analysis`,
      priority: 'medium',
      group: 'contextual-actions',
    });
  }

  // Validate repair vs replace
  if (ctx.currentAsset) {
    actions.push({
      id: 'validate-repair-vs-replace',
      title: 'Validate repair vs replace',
      description: 'Compare cost scenarios',
      icon: Calculator,
      href: `${propPath}/inventory/items/${ctx.currentAsset}/replace-repair`,
      priority: 'medium',
      group: 'contextual-actions',
    });
  }

  // Add provider quote
  actions.push({
    id: 'add-provider-quote',
    title: 'Add provider quote',
    description: 'Compare service costs',
    icon: FileText,
    href: `${propPath}/bookings`,
    priority: 'low',
    group: 'contextual-actions',
  });

  // Mark issue resolved
  actions.push({
    id: 'mark-issue-resolved',
    title: 'Mark issue resolved',
    description: 'Close this guidance',
    icon: CheckCircle,
    onClickAction: 'mark-resolved',
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getToolsActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Tool-specific actions based on active tool
  if (ctx.activeTool?.includes('coverage')) {
    actions.push({
      id: 'upload-insurance-policy',
      title: 'Upload insurance policy',
      description: 'Improve coverage analysis',
      icon: Upload,
      href: `${propPath}/vault`,
      priority: 'high',
      group: 'recommended-next',
    });
  }

  if (ctx.activeTool?.includes('break-even') || ctx.activeTool?.includes('sell-hold-rent')) {
    actions.push({
      id: 'add-finance-snapshot',
      title: 'Add mortgage details',
      description: 'Enable debt-aware modeling',
      icon: Building,
      href: `${propPath}`,
      priority: 'high',
      badge: 'Recommended',
      group: 'recommended-next',
    });
  }

  // Compare related tools
  actions.push({
    id: 'compare-related-tools',
    title: 'Compare related tools',
    description: 'Explore other analyses',
    icon: BarChart3,
    href: '/dashboard/home-lab',
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Export report
  actions.push({
    id: 'export-report',
    title: 'Export report',
    description: 'Download analysis results',
    icon: FileText,
    onClickAction: 'export-report',
    priority: 'low',
    group: 'contextual-actions',
  });

  return actions;
}

function getFallbackActions(ctx: SidebarContext): SidebarAction[] {
  const actions: SidebarAction[] = [];
  const propPath = getPropertyPath(ctx.propertyId);

  // Complete home profile
  actions.push({
    id: 'complete-home-profile',
    title: 'Complete home profile',
    description: 'Add property details',
    icon: Home,
    href: `${propPath}`,
    priority: 'medium',
    group: 'missing-info',
  });

  // Add appliance
  actions.push({
    id: 'add-appliance',
    title: 'Add appliance',
    description: 'Track home systems',
    icon: Plus,
    href: `${propPath}/inventory`,
    priority: 'medium',
    group: 'contextual-actions',
  });

  // Upload document
  actions.push({
    id: 'upload-document',
    title: 'Upload document',
    description: 'Add property records',
    icon: Upload,
    href: `${propPath}/vault`,
    priority: 'low',
    group: 'contextual-actions',
  });

  // Run home scan
  actions.push({
    id: 'run-home-scan',
    title: 'Run home scan',
    description: 'Refresh property signals',
    icon: BarChart3,
    onClickAction: 'refresh-signals',
    priority: 'low',
    group: 'quick-actions',
  });

  return actions;
}

// ============================================================================
// MAIN EXPORT: getSidebarActions
// ============================================================================

export function getSidebarActions(ctx: SidebarContext): SidebarAction[] {
  const routeFamily = getRouteFamily(ctx.route);

  let actions: SidebarAction[] = [];

  switch (routeFamily) {
    case 'today':
      actions = getTodayActions(ctx);
      break;
    case 'my-home':
      actions = getMyHomeActions(ctx);
      break;
    case 'protect':
      actions = getProtectActions(ctx);
      break;
    case 'save':
      actions = getSaveActions(ctx);
      break;
    case 'fix':
      actions = getFixActions(ctx);
      break;
    case 'vault':
      actions = getVaultActions(ctx);
      break;
    case 'home-lab':
      actions = getHomeLabActions(ctx);
      break;
    case 'inventory':
      actions = getInventoryActions(ctx);
      break;
    case 'rooms':
      actions = getRoomsActions(ctx);
      break;
    case 'guidance':
      actions = getGuidanceActions(ctx);
      break;
    case 'tools':
      actions = getToolsActions(ctx);
      break;
    case 'documents':
      actions = getVaultActions(ctx); // Same as vault
      break;
    default:
      actions = getFallbackActions(ctx);
  }

  // Limit to 3-5 actions, prioritize by priority level
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = actions.sort((a, b) => {
    const aPriority = priorityOrder[a.priority || 'low'];
    const bPriority = priorityOrder[b.priority || 'low'];
    return aPriority - bPriority;
  });

  return sorted.slice(0, 5);
}

export function getPageAwareSubtitle(route: string, signals?: SidebarContext['signals']): string {
  const routeFamily = getRouteFamily(route);

  switch (routeFamily) {
    case 'today':
      return 'Suggested from this page';
    case 'protect':
      return signals?.gapCount ? 'Relevant to coverage gaps' : 'Protection opportunities';
    case 'save':
      return 'Financial optimization';
    case 'fix':
      return signals?.urgentCount ? 'Relevant to urgent issues' : 'Maintenance actions';
    case 'vault':
      return 'Document management';
    case 'inventory':
      return 'Inventory actions';
    case 'rooms':
      return 'Room management';
    case 'guidance':
      return 'Guidance next steps';
    case 'tools':
      return 'Tool-specific actions';
    case 'my-home':
      return 'Based on missing home details';
    default:
      return 'Contextual actions';
  }
}
