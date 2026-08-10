import { Droplets, Flame } from 'lucide-react'
import { apparatusCatalog, evolutionCatalog, type EvolutionId } from '@mbfd/domain'
import { useEffect, useRef, useState } from 'react'

export function IncidentRail(props: {
  availableApparatus: string[]
  availableEvolutions: string[]
  placementTemplateId?: string | undefined
  selectedEvolutionId?: EvolutionId | undefined
  disabled?: boolean
  onTemplateSelect: (id: string) => void
  onEvolutionSelect: (id: EvolutionId) => void
  onTemplateDrop: (id: string, point: { x: number; y: number }) => void
}) {
  const dragStart = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | undefined>(undefined)
  const suppressClick = useRef(false)
  const [dragGhost, setDragGhost] = useState<{ id: string; x: number; y: number }>()
  const onTemplateDrop = props.onTemplateDrop
  useEffect(() => {
    function move(event: PointerEvent) {
      const drag = dragStart.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.moved = true
      if (drag.moved) setDragGhost({ id: drag.id, x: event.clientX, y: event.clientY })
    }
    function finish(event: PointerEvent) {
      const drag = dragStart.current
      if (!drag || drag.pointerId !== event.pointerId) return
      suppressClick.current = drag.moved
      if (drag.moved) onTemplateDrop(drag.id, { x: event.clientX, y: event.clientY })
      dragStart.current = undefined
      setDragGhost(undefined)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish) }
  }, [onTemplateDrop])
  return <aside className="incident-rail" aria-label="Incident equipment">
    {apparatusCatalog.filter((item) => props.availableApparatus.includes(item.id)).map((item) => <button key={item.id} disabled={props.disabled} className="rail-tool" aria-pressed={props.placementTemplateId === item.id} title={`${item.designation}: tap then tap map, or drag onto map`} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return }; props.onTemplateSelect(item.id) }} onPointerDown={(event) => { if (props.disabled) return; dragStart.current = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { const drag = dragStart.current; if (!drag || drag.pointerId !== event.pointerId) return; if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8) drag.moved = true; if (drag.moved) setDragGhost({ id: drag.id, x: event.clientX, y: event.clientY }) }} onPointerUp={(event) => { const drag = dragStart.current; if (!drag || drag.pointerId !== event.pointerId) return; suppressClick.current = drag.moved; if (drag.moved) onTemplateDrop(drag.id, { x: event.clientX, y: event.clientY }); dragStart.current = undefined; setDragGhost(undefined); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}><img src={item.assetPath} alt="" draggable={false}/><strong className="display">{item.id}</strong></button>)}
    {evolutionCatalog.filter((item) => props.availableEvolutions.includes(item.id)).map((item) => <button key={item.id} disabled={props.disabled || Boolean(props.selectedEvolutionId)} className="rail-tool" aria-pressed={props.selectedEvolutionId === item.id} title={props.selectedEvolutionId ? 'Complete the active evolution before starting another.' : item.summary} onClick={() => props.onEvolutionSelect(item.id)}>{item.id.includes('lay') ? <Droplets className="mx-auto mb-1 text-[#57a8df]" size={28}/> : <Flame className="mx-auto mb-1 text-[#d9c8a5]" size={28}/>}<strong className="display text-[.68rem]">{item.label}</strong></button>)}
    {dragGhost && <div className="apparatus-drag-ghost" style={{ left: dragGhost.x, top: dragGhost.y }} aria-hidden="true"><img src={apparatusCatalog.find((item) => item.id === dragGhost.id)?.assetPath} alt=""/><strong className="display">Drop {dragGhost.id} on map</strong></div>}
  </aside>
}
