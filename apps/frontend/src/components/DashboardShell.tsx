// apps/frontend/src/components/DashboardShell.tsx

import * as React from "react"
import { cn } from "@/lib/utils" // Assuming standard utility import

interface DashboardShellProps extends React.HTMLAttributes<HTMLDivElement> {}

export function DashboardShell({ children, className, ...props }: DashboardShellProps) {
  return (
    <main className={cn("grid items-start gap-8", className)} {...props}>
      {children}
    </main>
  )
}