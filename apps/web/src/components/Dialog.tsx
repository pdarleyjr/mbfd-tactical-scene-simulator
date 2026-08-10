import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Dialog({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <div className="panel dialog-panel">
        <div className="dialog-header"><h2 className="display text-xl">{title}</h2><button className="btn btn-secondary !min-h-12 !w-12 !p-0" onClick={onClose} aria-label="Close dialog"><X /></button></div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}
