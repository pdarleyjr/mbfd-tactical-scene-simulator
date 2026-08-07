import { Link } from '@tanstack/react-router'

export function NotFoundPage() {
  return <main className="shell grid min-h-dvh place-items-center p-5 text-center"><div><p className="eyebrow">404</p><h1 className="display mt-2 text-4xl">Scene not found</h1><p className="muted mt-3">The requested tactical workspace does not exist.</p><Link to="/" className="btn btn-primary mt-6 no-underline">Return home</Link></div></main>
}
