import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Toasts } from './Toasts'

type Tone = 'default' | 'primary' | 'danger' | 'quiet'

export function Button({ tone = 'default', icon, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <button type="button" className={`btn btn--${tone} ${className}`} {...props}>
      {icon}
      {children && <span>{children}</span>}
    </button>
  )
}

export function IconButton({ label, children, active, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} aria-pressed={active} {...props}>
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: { value: T; options: Array<{ value: T; label: ReactNode; title?: string }>; onChange: (value: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} title={option.title} className={value === option.value ? 'is-active' : ''} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  )
}

export function Section({ title, aside, children, className = '' }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel-section ${className}`}>
      <header className="panel-section__head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  )
}

/**
 * Text input that edits locally and commits once, on blur or Enter, so typing
 * a label creates one undo step instead of one per keystroke.
 */
export function CommitText({ value, onCommit, multiline = false, required = false, className = 'input', ...props }: { value: string; onCommit: (value: string) => void; multiline?: boolean; required?: boolean; className?: string; id?: string; maxLength?: number; placeholder?: string; rows?: number; list?: string; autoFocus?: boolean; 'aria-label'?: string; 'data-testid'?: string }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const cancelled = useRef(false)
  const shown = focused ? draft : value
  function commit() {
    if (cancelled.current) { cancelled.current = false; setDraft(value); return }
    const next = draft.trim()
    if (required && !next) { setDraft(value); return }
    if (next !== value.trim()) onCommit(next)
  }
  const shared = {
    ...props,
    className,
    value: shown,
    onFocus: () => { setDraft(value); setFocused(true) },
    onBlur: () => { setFocused(false); commit() },
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
  }
  return multiline
    ? <textarea {...shared} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) (event.target as HTMLTextAreaElement).blur() }} />
    : <input {...shared} onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); if (event.key === 'Escape') { cancelled.current = true; (event.target as HTMLInputElement).blur() } }} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

/** Modal dialog using the native <dialog> element for focus and Escape. */
export function Modal({ title, subtitle, onClose, children, footer, size = 'md', testId }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg'; testId?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal modal--${size}`}
      aria-label={title}
      data-testid={testId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === ref.current) onClose() }}
    >
      <div className="modal__frame">
        <header className="modal__head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
      {/* A modal dialog makes the rest of the page inert; keep toasts (and Undo) usable. */}
      <Toasts />
    </dialog>
  )
}
