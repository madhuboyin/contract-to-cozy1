// apps/frontend/src/components/page-header.tsx

import { cn } from "@/lib/utils"
import * as React from "react"

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export function PageHeader({ className, children, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex max-w-[980px] flex-col items-start gap-2 pt-8 pb-8 md:pt-12 md:pb-12",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

// Sub-component for the main heading
interface PageHeaderHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export function PageHeaderHeading({ className, ...props }: PageHeaderHeadingProps) {
  return (
    <h1
      className={cn(
        // FIXED: Reduced from text-3xl md:text-5xl to text-2xl md:text-3xl (24px → 36px)
        // FIXED: Reduced from font-bold (700) to font-semibold (600)
        "text-2xl font-semibold leading-tight tracking-tighter md:text-3xl lg:leading-[1.1]",
        className
      )}
      {...props}
    />
  )
}

// Sub-component for the description text
interface PageHeaderDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export function PageHeaderDescription({ className, ...props }: PageHeaderDescriptionProps) {
  return (
    <p
      className={cn(
        "max-w-[750px] text-lg text-muted-foreground sm:text-xl",
        className
      )}
      {...props}
    />
  )
}