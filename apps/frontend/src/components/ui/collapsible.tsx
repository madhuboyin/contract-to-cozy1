"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

interface CollapsibleProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const CollapsibleContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>({
  open: false,
  onOpenChange: () => {},
})

const Collapsible = React.forwardRef<
  HTMLDivElement,
  CollapsibleProps & React.HTMLAttributes<HTMLDivElement>
>(({ open: controlledOpen, onOpenChange, children, className, ...props }, ref) => {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = controlledOpen ?? internalOpen
  const handleOpenChange = onOpenChange ?? setInternalOpen

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div ref={ref} className={cn(className)} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  )
})
Collapsible.displayName = "Collapsible"

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ asChild = false, className, onClick, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(CollapsibleContext)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onOpenChange(!open)
      onClick?.(e)
    }

    if (asChild) {
      return (
        <Slot onClick={handleClick}>
          {React.cloneElement(props.children as React.ReactElement, {
            ref,
            ...props,
          })}
        </Slot>
      )
    }

    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        className={cn(className)}
        aria-expanded={open}
        {...props}
      />
    )
  }
)
CollapsibleTrigger.displayName = "CollapsibleTrigger"

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  forceMount?: boolean
}

const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ className, forceMount, children, ...props }, ref) => {
    const { open } = React.useContext(CollapsibleContext)

    if (!open && !forceMount) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          "overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1",
          className
        )}
        data-state={open ? "open" : "closed"}
        {...props}
      >
        {children}
      </div>
    )
  }
)
CollapsibleContent.displayName = "CollapsibleContent"

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
