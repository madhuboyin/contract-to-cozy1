'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronDown, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import APP_NAV_CONFIG from '@/components/navigation/appNavConfig';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type AppSidebarProps = {
  pathname: string;
  propertyId?: string;
  mobile?: boolean;
  onNavigate?: () => void;
};

const SIDEBAR_COLLAPSED_KEY = 'ctc:sidebar:collapsed';
const SIDEBAR_SECTION_OPEN_KEY = 'ctc:sidebar:section-open';

const DEFAULT_SECTION_OPEN_STATE = APP_NAV_CONFIG.sections.reduce<Record<string, boolean>>((acc, section) => {
  acc[section.key] = true;
  return acc;
}, {});

function readBooleanStorage(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw == null) return fallback;
  return raw === 'true';
}

function readObjectStorage(key: string, fallback: Record<string, boolean>): Record<string, boolean> {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...fallback, ...parsed };
  } catch {
    return fallback;
  }
}

function NavItemLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        collapsed && 'justify-center px-2',
        active
          ? 'bg-teal-50 text-brand-primary'
          : 'text-gray-700 hover:bg-teal-50 hover:text-brand-primary'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export default function AppSidebar({ pathname, propertyId, mobile = false, onNavigate }: AppSidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [sectionOpen, setSectionOpen] = React.useState<Record<string, boolean>>(DEFAULT_SECTION_OPEN_STATE);
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (mobile || hydratedRef.current) return;
    hydratedRef.current = true;
    setCollapsed(readBooleanStorage(SIDEBAR_COLLAPSED_KEY, false));
    setSectionOpen(readObjectStorage(SIDEBAR_SECTION_OPEN_KEY, DEFAULT_SECTION_OPEN_STATE));
  }, [mobile]);

  React.useEffect(() => {
    if (mobile || !hydratedRef.current) return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed, mobile]);

  React.useEffect(() => {
    if (!hydratedRef.current) return;
    window.localStorage.setItem(SIDEBAR_SECTION_OPEN_KEY, JSON.stringify(sectionOpen));
  }, [sectionOpen]);

  const isCollapsed = mobile ? false : collapsed;

  const toggleSection = (sectionKey: string) => {
    setSectionOpen((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className={cn(
          'flex h-full flex-col border-r border-black/10 bg-white/95 backdrop-blur-sm',
          mobile ? 'w-full' : 'transition-[width] duration-200',
          isCollapsed ? 'w-[84px]' : 'w-72'
        )}
      >
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <nav aria-label="Main Navigation" className="space-y-3">
            <div>
              {!isCollapsed && (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pinned</p>
              )}
              <div className="space-y-1">
                {APP_NAV_CONFIG.pinned.map((item) => (
                  <NavItemLink
                    key={item.key}
                    href={item.getHref({ propertyId })}
                    label={item.label}
                    icon={item.icon}
                    active={item.isActive(pathname)}
                    collapsed={isCollapsed}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>

            {APP_NAV_CONFIG.sections.map((section) => {
              const open = sectionOpen[section.key] ?? true;

              return (
                <section key={section.key}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => toggleSection(section.key)}
                          aria-expanded={open}
                          aria-controls={`sidebar-section-${section.key}`}
                          aria-label={`Toggle ${section.label}`}
                          className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-md text-[10px] font-semibold uppercase tracking-wide text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                        >
                          {section.label.charAt(0)}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {section.label} {open ? '(collapse)' : '(expand)'}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSection(section.key)}
                      aria-expanded={open}
                      aria-controls={`sidebar-section-${section.key}`}
                      className="mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                      <span>{section.label}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : 'rotate-0')} />
                    </button>
                  )}

                  {open && (
                    <div id={`sidebar-section-${section.key}`} className="space-y-1">
                      {section.items.map((item) => (
                        <NavItemLink
                          key={item.key}
                          href={item.getHref({ propertyId })}
                          label={item.label}
                          icon={item.icon}
                          active={item.isActive(pathname)}
                          collapsed={isCollapsed}
                          onNavigate={onNavigate}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </nav>
        </div>

        {!mobile && (
          <div className="border-t border-black/10 p-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'h-9 w-full justify-start text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                isCollapsed && 'justify-center px-2'
              )}
            >
              <PanelLeft className={cn('h-4 w-4 shrink-0', isCollapsed && 'rotate-180')} />
              {!isCollapsed && <span className="ml-2">Collapse</span>}
            </Button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}
