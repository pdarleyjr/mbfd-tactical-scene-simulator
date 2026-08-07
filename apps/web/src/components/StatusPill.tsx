export function StatusPill({ status }: { status: 'connecting' | 'connected' | 'offline' | 'error' }) {
  const colors = { connecting: '#d49c33', connected: '#45a179', offline: '#9aabb4', error: '#e0524d' }
  return <span className="flex min-h-10 items-center gap-2 px-2 text-sm" style={{ color: colors[status] }}><i className="status-dot" />{status}</span>
}
