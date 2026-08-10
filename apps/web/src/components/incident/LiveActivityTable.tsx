import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Clock3, Radio } from 'lucide-react'
import type { ActivityResponse } from '../../api/types'

function activityClock(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return '—'
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

interface ActivityRow {
  id: string
  type: 'Benchmark' | 'Task'
  unit: string
  label: string
  started?: number
  completed?: number
}

function activityRows(activity: ActivityResponse | undefined): ActivityRow[] {
  if (!activity) return []
  const benchmarks: ActivityRow[] = activity.benchmarks.map((item) => ({ id: `benchmark-${item.id}`, type: 'Benchmark', unit: 'ALL', label: item.label, ...(item.completedElapsedMs === undefined ? {} : { completed: item.completedElapsedMs }) }))
  const tasks: ActivityRow[] = activity.evolutions.map((item) => ({ id: `task-${item.id}`, type: 'Task', unit: item.unit, label: item.label, started: item.startedElapsedMs, ...(item.completedElapsedMs === undefined ? {} : { completed: item.completedElapsedMs }) }))
  return [...benchmarks, ...tasks]
}

export function LiveActivityTable(props: { activity: ActivityResponse | undefined; loading?: boolean; error?: string; pageSize?: number; autoCycle?: boolean }) {
  const pageSize = props.pageSize ?? 7
  const rows = useMemo(() => activityRows(props.activity), [props.activity])
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const [page, setPage] = useState(0)
  const previousRowCount = useRef(0)
  useEffect(() => { setPage((current) => Math.min(current, pages - 1)) }, [pages])
  useEffect(() => {
    if (rows.length > previousRowCount.current) setPage(pages - 1)
    previousRowCount.current = rows.length
  }, [pages, rows.length])
  useEffect(() => {
    if (!props.autoCycle || pages <= 1) return
    const id = window.setInterval(() => setPage((current) => (current + 1) % pages), 8000)
    return () => clearInterval(id)
  }, [pages, props.autoCycle])
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize)
  const completedBenchmarks = props.activity?.benchmarks.filter((item) => item.completedAt).length ?? 0
  const activeTasks = props.activity?.evolutions.filter((item) => item.status === 'active').length ?? 0

  return <section className="live-activity" aria-live="polite"><header className="live-activity-header"><div><p className="eyebrow">Scenario time stamps</p><h2 className="display text-xl">Live activity</h2></div><div className="live-activity-summary"><span><CheckCircle2 size={16}/>{completedBenchmarks}/{props.activity?.benchmarks.length ?? 0} benchmarks</span><span className={activeTasks ? 'active' : ''}><Radio size={16}/>{activeTasks} active</span></div></header>
    {props.error ? <p className="live-activity-error" role="alert">{props.error}</p> : <table className="live-activity-table" aria-label="Live benchmark and task activity"><thead><tr><th>Activity</th><th>Unit</th><th>Started</th><th>Completed</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className={row.completed === undefined ? 'pending' : 'complete'}><td><span className="activity-type">{row.type}</span><strong>{row.label}</strong></td><td className="display">{row.unit}</td><td className="tabular-nums">{activityClock(row.started)}</td><td className="tabular-nums">{row.completed === undefined ? <span className="activity-pending"><Clock3 size={14}/>{row.started === undefined ? 'Pending' : 'Active'}</span> : activityClock(row.completed)}</td></tr>)}{!visible.length && <tr><td colSpan={4} className="live-activity-empty">{props.loading ? 'Loading live activity…' : 'Benchmarks and crew tasks will appear here as the scenario runs.'}</td></tr>}</tbody></table>}
    {pages > 1 && <nav className="live-activity-pages" aria-label="Live activity pages"><button className="btn btn-secondary" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</button><output className="display">{page + 1} / {pages}</output><button className="btn btn-secondary" onClick={() => setPage((current) => Math.min(pages - 1, current + 1))} disabled={page === pages - 1}>Next</button></nav>}
  </section>
}
