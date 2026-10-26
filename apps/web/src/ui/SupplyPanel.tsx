import { useMemo } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { hoseCatalog, type ApparatusObject, type HoseObject } from '@mbfd/domain'
import { objectName, readHose } from '@mbfd/fire-model'
import { useWaterSupply } from '../store/selectors'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { canvasApi } from '../canvas/api'
import { IconButton, Section } from './primitives'

/** How water reaches each unit, and what is still open, at a glance. */
export function SupplyPanel() {
  const objects = useBoard((state) => state.board.objects)
  const scenario = useBoard((state) => state.board.scenario)
  const report = useWaterSupply()
  const index = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects])
  const units = objects.filter((object): object is ApparatusObject => object.type === 'apparatus')
  const hoses = objects.filter((object): object is HoseObject => object.type === 'hose')
  const totals = hoses.reduce<Record<string, number>>((sum, hose) => {
    const reading = readHose(hose, scenario.hoseLoads, scenario.calibration)
    sum[hose.hoseType] = (sum[hose.hoseType] ?? 0) + (reading.length.feet ?? reading.length.world)
    return sum
  }, {})

  function focus(id: string) {
    const object = index.get(id)
    if (!object) return
    useUi.getState().setTool('select')
    useUi.getState().select([id])
    const point = 'x' in object ? { x: object.x, y: object.y } : { x: object.points[0]!, y: object.points[1]! }
    canvasApi.current?.centerOn(point)
  }

  return (
    <div className="supply" data-testid="supply-panel">
      <header className="inspector__head">
        <div className="inspector__titles">
          <h2>Water supply</h2>
          <p>How lines are connected. No pressure or flow is calculated.</p>
        </div>
        <IconButton label="Close water supply panel" onClick={() => useUi.getState().setPanel('none')}><X size={18} /></IconButton>
      </header>
      <Section title="Units">
        {units.length === 0 && <p className="fine-print">Place apparatus to see their water supply here.</p>}
        <ul className="list">
          {units.map((unit) => {
            const supply = report.apparatus.get(unit.id)
            const state = supply?.supplied ? 'hydrant' : supply?.outputLineIds.length ? 'tank' : 'idle'
            const supplyLine = supply?.supplyLineIds[0] ? index.get(supply.supplyLineIds[0]) as HoseObject | undefined : undefined
            const supplyReading = supplyLine ? readHose(supplyLine, scenario.hoseLoads, scenario.calibration) : undefined
            return (
              <li key={unit.id} className="list__item list__item--button">
                <button type="button" className="list__hit" onClick={() => focus(unit.id)} aria-label={`Show ${unit.label} on the map`} />
                <span className={`state-pill state-pill--${state}`}>{state === 'hydrant' ? 'Hydrant' : state === 'tank' ? 'Tank' : 'Idle'}</span>
                <div className="list__text">
                  <strong>{unit.label}{unit.assignment ? ` · ${unit.assignment}` : ''}</strong>
                  <span>
                    {supply?.supplied
                      ? `From ${supply.hydrantIds.map((id) => objectName(index.get(id))).join(', ')}${supplyReading ? ` · ${supplyReading.length.text}` : ''}`
                      : 'No supply line connected'}
                    {supply?.outputLineIds.length ? ` · ${supply.outputLineIds.length} line${supply.outputLineIds.length > 1 ? 's' : ''} out` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>
      <Section title={`Needs attention · ${report.issues.length}`}>
        {report.issues.length === 0 && <p className="fine-print">Every line is connected at both ends.</p>}
        <ul className="list">
          {report.issues.map((issue) => (
            <li key={issue.id} className="list__item list__item--button">
              <button type="button" className="list__hit" onClick={() => focus(issue.objectId)} aria-label="Show on the map" />
              {issue.severity === 'warning' ? <AlertTriangle size={17} className="icon-warning" /> : <Info size={17} className="icon-info" />}
              <span className="list__text"><span>{issue.message}</span></span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Hose on the ground">
        <ul className="legend">
          {(Object.keys(hoseCatalog) as Array<keyof typeof hoseCatalog>).map((type) => (
            <li key={type}>
              <span className="legend__swatch" style={{ background: hoseCatalog[type].color, height: hoseCatalog[type].width }} />
              <span>{hoseCatalog[type].label}</span>
              <strong>{totals[type] ? `${Math.round(totals[type]!)} ${scenario.calibration ? 'ft' : 'u'}` : 'None'}</strong>
            </li>
          ))}
        </ul>
        <p className="fine-print">Moving blue dashes show a line connected back to a hydrant (bright) or an apparatus tank (faint).</p>
      </Section>
    </div>
  )
}
