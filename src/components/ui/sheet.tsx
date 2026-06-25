import * as React from "react"
import { cn } from "@/lib/utils"
import { X } from "lucide-react"

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const SheetContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
} | null>(null)

export function Sheet({ open = false, onOpenChange, children }: SheetProps) {
  const [internalOpen, setInternalOpen] = React.useState(open)
  const isControlled = onOpenChange !== undefined
  const activeOpen = isControlled ? open : internalOpen
  const activeOnOpenChange = isControlled ? onOpenChange : setInternalOpen

  return (
    <SheetContext.Provider value={{ open: activeOpen, onOpenChange: activeOnOpenChange }}>
      {children}
    </SheetContext.Provider>
  )
}

export function SheetTrigger({ asChild, children, ...props }: { asChild?: boolean, children: React.ReactNode, [key: string]: any }) {
  const context = React.useContext(SheetContext)
  if (!context) throw new Error("SheetTrigger must be used inside Sheet")

  const child = children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>

  return React.cloneElement(child, {
    onClick: (e: React.MouseEvent) => {
      context.onOpenChange(true)
      if (child.props && child.props.onClick) {
        child.props.onClick(e)
      }
    },
    ...props
  } as any)
}

export function SheetPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export function SheetOverlay({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(SheetContext)
  if (!context) return null
  if (!context.open) return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm transition-all duration-100",
        className
      )}
      onClick={() => context.onOpenChange(false)}
      {...props}
    />
  )
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "bottom" | "left" | "right"
}

export function SheetContent({ className, side = "right", children, ...props }: SheetContentProps) {
  const context = React.useContext(SheetContext)
  if (!context) return null
  if (!context.open) return null

  const sideStyles = {
    top: "inset-x-0 top-0 border-b max-h-[400px] h-full",
    bottom: "inset-x-0 bottom-0 border-t max-h-[400px] h-full",
    left: "inset-y-0 left-0 border-r max-w-md w-full h-full",
    right: "inset-y-0 right-0 border-l max-w-md w-full h-full"
  }

  return (
    <React.Fragment>
      <SheetOverlay />
      <div
        className={cn(
          "fixed z-50 bg-card p-6 shadow-lg transition ease-in-out duration-300 flex flex-col h-full overflow-y-auto border-border",
          sideStyles[side],
          className
        )}
        {...props}
      >
        {children}
        <button
          onClick={() => context.onOpenChange(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer text-slate-400 hover:text-slate-100"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </React.Fragment>
  )
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-2 mb-4", className)} {...props} />
  )
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2 mt-auto pt-4", className)} {...props} />
  )
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-lg font-semibold text-slate-100", className)} {...props} />
  )
}

export function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
}
