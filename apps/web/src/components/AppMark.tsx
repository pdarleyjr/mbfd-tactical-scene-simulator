import { Link } from '@tanstack/react-router'

export function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 no-underline" aria-label="MBFD Tactical home">
      <span className="grid h-10 w-10 place-items-center border border-[#d9c8a5] bg-[#be241f] display text-sm">MB</span>
      {!compact && <span><strong className="display block leading-none">Tactical Scene</strong><small className="muted">Simulator V2</small></span>}
    </Link>
  )
}
