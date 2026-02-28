"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PropertyEditSectionProps {
  id: string;
  title: string;
  helperText: string;
  defaultExpandedDesktop?: boolean;
  defaultExpandedMobile?: boolean;
  forceExpandOnMobile?: boolean;
  headerChip?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export default function PropertyEditSection({
  id,
  title,
  helperText,
  defaultExpandedDesktop = true,
  defaultExpandedMobile,
  forceExpandOnMobile = false,
  headerChip,
  className,
  children,
}: PropertyEditSectionProps) {
  const [mobileExpanded, setMobileExpanded] = React.useState(defaultExpandedMobile ?? defaultExpandedDesktop);
  const [desktopExpanded, setDesktopExpanded] = React.useState(defaultExpandedDesktop);

  React.useEffect(() => {
    if (forceExpandOnMobile) {
      setMobileExpanded(true);
    }
  }, [forceExpandOnMobile]);

  return (
    <Card
      id={id}
      data-property-section={id}
      className={cn(
        "border border-black/10 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/40",
        className
      )}
    >
      <CardHeader className="space-y-1.5 p-5 pb-3 sm:p-6 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</CardTitle>
              {headerChip}
            </div>
            <CardDescription className="text-sm text-gray-600 dark:text-slate-400">{helperText}</CardDescription>
          </div>

          <div className="flex items-center gap-1">
            {!defaultExpandedDesktop && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden md:inline-flex"
                onClick={() => setDesktopExpanded((prev) => !prev)}
              >
                {desktopExpanded ? "Hide" : "Show"}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setMobileExpanded((prev) => !prev)}
              aria-expanded={mobileExpanded}
              aria-controls={`${id}-content`}
            >
              <span className="mr-1 text-xs">{mobileExpanded ? "Hide" : "Show"}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", mobileExpanded && "rotate-180")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent
        id={`${id}-content`}
        className={cn(
          "p-5 pt-0 sm:p-6 sm:pt-0",
          !mobileExpanded && "hidden",
          desktopExpanded ? "md:block" : "md:hidden",
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}
