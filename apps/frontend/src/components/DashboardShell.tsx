// apps/frontend/src/components/DashboardShell.tsx

import * as React from "react"
import { cn } from "@/lib/utils"

interface DashboardShellProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DashboardShell({ children, className, ...props }: DashboardShellProps) {
  return (
    <main 
      className={cn(
        "max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8",
        "space-y-4", // UPDATED: Changed to space-y-4 (16px) for tighter spacing
        className
      )} 
      {...props}
    >
      {children}
    </main>
  )
}