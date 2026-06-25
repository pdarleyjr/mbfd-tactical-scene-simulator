import * as React from "react"
import { cn } from "@/lib/utils"

interface DropdownMenuProps {
  children: React.ReactNode
}

const DropdownContext = React.createContext<{
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={containerRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

export function DropdownMenuTrigger({ asChild, children, ...props }: { asChild?: boolean, children: React.ReactNode, [key: string]: any }) {
  const context = React.useContext(DropdownContext)
  if (!context) throw new Error("DropdownMenuTrigger must be used inside DropdownMenu")

  const child = children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>

  return React.cloneElement(child, {
    onClick: (e: React.MouseEvent) => {
      context.setOpen(!context.open)
      if (child.props && child.props.onClick) {
        child.props.onClick(e)
      }
    },
    ...props
  } as any)
}

export function DropdownMenuContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(DropdownContext)
  if (!context) return null
  if (!context.open) return null

  return (
    <div
      className={cn(
        "absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-md border border-border bg-card p-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none flex flex-col animate-in fade-in zoom-in-95",
        className
      )}
      onClick={() => context.setOpen(false)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-left w-full touch-target",
        className
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("px-2 py-1.5 text-xs font-semibold text-slate-400", className)}
      {...props}
    />
  )
}
