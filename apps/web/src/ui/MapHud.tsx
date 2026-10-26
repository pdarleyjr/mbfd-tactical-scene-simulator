import { useEffect, useRef, useState } from 'react'
import { Layers, Maximize, Minus, Navigation, Plus, Wind } from 'lucide-react'
import { scaleBar } from '@mbfd/fire-model'
import { useBoard } from '../store/board'
import { useUi, type Layers as LayerState } from '../store/ui'
import { canvasApi } from '../canvas/api'
import { compassPoint } from '../lib/format'

const layerLabels: Record<keyof LayerState, string> = {
  labels: 'Unit and hydrant labels',
  hoseLengths: 'Hose lengths',
  flow: 'Water flow animation',
  markers: 'Markers, notes, arrows',
}

/** Zoom, scale bar, calibration status, layers, and the compass. */
export function MapHud() {
  const view = useUi((state) => state.view)
  const presenting = useUi((state) => state.presenting)
  const calibration = useBoard((state) => state.board.scenario.calibration)
  const conditions = useBoard((state) => state.board.scenario.conditions)
  const bar = scaleBar(view.scale, calibration)
  return (
    <>
      {(conditions.windFromDeg !== null || conditions.northDeg !== 0) && (
        <div className={`compass ${presenting ? 'compass--presenting' : ''}`} data-testid="compass" aria-label="Scene conditions">
          {conditions.northDeg !== 0 && <span className="compass__item" title="North"><Navigation size={18} style={{ transform: `rotate(${conditions.northDeg}deg)` }} /> N</span>}
          {conditions.windFromDeg !== null && (
            <span className="compass__item" title={`Wind from ${compassPoint(conditions.windFromDeg)}`}>
              <Wind size={16} />
              <span className="compass__arrow" style={{ transform: `rotate(${conditions.windFromDeg + 180}deg)` }} aria-hidden>↑</span>
              From {compassPoint(conditions.windFromDeg)}{conditions.windNote ? ` · ${conditions.windNote}` : ''}
            </span>
          )}
        </div>
      )}
      <div className={`hud ${presenting ? 'hud--presenting' : ''}`} data-testid="map-hud">
        <div className="scale" aria-label={`Scale bar ${bar.label}`}>
          <span className="scale__bar" style={{ width: bar.pixels }} />
          <span className="scale__label">{bar.label}</span>
        </div>
        {!presenting && (
          <button type="button" className={`calibration-badge ${calibration ? 'is-ok' : 'is-warning'}`} onClick={() => useUi.getState().setTool('calibrate')} data-testid="calibration-badge" title={calibration ? `Calibrated from a ${calibration.distanceFt} ft reference` : 'Distances are in map units until you calibrate'}>
            {calibration ? 'Calibrated' : 'Not calibrated'}
          </button>
        )}
        <div className="zoom" role="group" aria-label="Zoom">
          <button type="button" className="icon-btn" aria-label="Zoom out" onClick={() => canvasApi.current?.zoomBy(1 / 1.25)}><Minus size={18} /></button>
          <output className="zoom__level" data-testid="zoom-level">{Math.round(view.scale * 100)}%</output>
          <button type="button" className="icon-btn" aria-label="Zoom in" onClick={() => canvasApi.current?.zoomBy(1.25)}><Plus size={18} /></button>
          <button type="button" className="icon-btn" aria-label="Fit scene to screen (F)" title="Fit scene (F)" onClick={() => canvasApi.current?.fit()}><Maximize size={17} /></button>
        </div>
        {!presenting && <LayersMenu />}
      </div>
    </>
  )
}

function LayersMenu() {
  const layers = useUi((state) => state.layers)
  const toggle = useUi((state) => state.toggleLayer)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="menu menu--up" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Map layers" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Layers size={18} /></button>
      {open && (
        <div className="menu__list" role="group" aria-label="Map layers">
          {(Object.keys(layerLabels) as Array<keyof LayerState>).map((key) => (
            <label key={key} className="menu__item menu__item--check">
              <input type="checkbox" checked={layers[key]} onChange={() => toggle(key)} />
              <span>{layerLabels[key]}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
