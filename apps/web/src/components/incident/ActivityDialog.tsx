import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { ActivityResponse, SessionBenchmarkView } from '../../api/types'

function clock(milliseconds: number | undefined): string {
  if (milliseconds === undefined) return '—'
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`
}

export function ActivityDialog(props: { open: boolean; activity: ActivityResponse | undefined; onClose: () => void; title?: string }) {
  const [unit, setUnit] = useState('ALL')
  const units = useMemo(() => props.activity?.units.map((item) => item.unit) ?? [], [props.activity])
  if (!props.open) return null
  const evolutions = props.activity?.evolutions.filter((item) => unit === 'ALL' || item.unit === unit) ?? []
  const benchmarks: SessionBenchmarkView[] = unit === 'ALL' ? props.activity?.benchmarks ?? [] : []
  return <div className="fixed inset-0 z-[100] grid bg-black/75 p-3 md:p-8" role="dialog" aria-modal="true" aria-labelledby="activity-title">
    <section className="panel mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden"><header className="flex items-center gap-3 border-b border-[#34434c] p-4"><div className="min-w-0 flex-1"><p className="eyebrow">Live and after-action data</p><h2 id="activity-title" className="display text-2xl">{props.title ?? 'Scenario activity table'}</h2></div><label className="hidden items-center gap-2 sm:flex"><span className="font-semibold">View</span><select className="field !w-44" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="ALL">Complete scenario</option>{units.map((item) => <option key={item} value={item}>{item} only</option>)}</select></label><button className="btn btn-secondary !h-12 !w-12 !p-0" onClick={props.onClose} aria-label="Close activity table"><X/></button></header>
      <div className="border-b border-[#34434c] p-3 sm:hidden"><select className="field" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="ALL">Complete scenario</option>{units.map((item) => <option key={item} value={item}>{item} only</option>)}</select></div>
      <div className="min-h-0 flex-1 overflow-auto p-4"><table className="w-full min-w-[720px] border-collapse text-left"><thead className="sticky top-0 bg-[#111a1f]"><tr>{['Type', 'Unit', 'Task or benchmark', 'Started', 'Completed', 'Duration'].map((label) => <th key={label} className="border-b border-[#53646e] p-3 text-xs uppercase tracking-wide text-[#d9c8a5]">{label}</th>)}</tr></thead><tbody>
        {evolutions.map((run) => <tr key={run.id} className="border-b border-[#34434c]"><td className="p-3">Evolution</td><td className="display p-3">{run.unit}</td><td className="p-3 font-semibold">{run.label}</td><td className="p-3 tabular-nums">{clock(run.startedElapsedMs)}</td><td className="p-3 tabular-nums">{clock(run.completedElapsedMs)}</td><td className="p-3 tabular-nums">{run.completedElapsedMs === undefined ? 'In progress' : clock(run.completedElapsedMs - run.startedElapsedMs)}</td></tr>)}
        {benchmarks.map((benchmark) => <tr key={benchmark.id} className="border-b border-[#34434c]"><td className="p-3">Benchmark</td><td className="display p-3">ALL</td><td className="p-3"><strong className="block">{benchmark.label}</strong><small className="muted">{benchmark.description}</small></td><td className="p-3">—</td><td className="p-3 tabular-nums">{clock(benchmark.completedElapsedMs)}</td><td className="p-3">—</td></tr>)}
        {!evolutions.length && !benchmarks.length && <tr><td colSpan={6} className="p-8 text-center muted">No timed activity has been recorded for this view.</td></tr>}
      </tbody></table></div>
    </section>
  </div>
}
