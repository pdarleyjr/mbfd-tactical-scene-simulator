import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { ActivityResponse } from '../../api/types'
import { LiveActivityTable } from './LiveActivityTable'

export function ActivityDialog(props: { open: boolean; activity: ActivityResponse | undefined; onClose: () => void; title?: string }) {
  const [unit, setUnit] = useState('ALL')
  const units = useMemo(() => props.activity?.units.map((item) => item.unit) ?? [], [props.activity])
  const filtered = useMemo<ActivityResponse | undefined>(() => props.activity ? { ...props.activity, evolutions: props.activity.evolutions.filter((item) => unit === 'ALL' || item.unit === unit), benchmarks: unit === 'ALL' ? props.activity.benchmarks : [] } : undefined, [props.activity, unit])
  if (!props.open) return null
  return <div className="activity-dialog" role="dialog" aria-modal="true" aria-labelledby="activity-title">
    <section className="activity-dialog-panel"><header className="activity-dialog-header"><div className="min-w-0 flex-1"><p className="eyebrow">Live and after-action data</p><h2 id="activity-title" className="display truncate text-2xl">{props.title ?? 'Scenario activity table'}</h2></div><label className="activity-unit-filter"><span className="font-semibold">View</span><select className="field" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="ALL">Complete scenario</option>{units.map((item) => <option key={item} value={item}>{item} only</option>)}</select></label><button className="btn btn-secondary !h-12 !w-12 !p-0" onClick={props.onClose} aria-label="Close activity table"><X/></button></header>
      <LiveActivityTable activity={filtered} pageSize={6}/>
    </section>
  </div>
}
