import { Droplets, Flame, MapPin } from 'lucide-react'
import { apparatusCatalog, evolutionCatalog, type EvolutionId } from '@mbfd/domain'
import { useRef } from 'react'

export function IncidentRail(props: {
  availableApparatus: string[]
  availableEvolutions: string[]
  placementTemplateId?: string | undefined
  selectedEvolutionId?: EvolutionId | undefined
  hydrantActive: boolean
  disabled?: boolean
  onTemplateSelect: (id: string) => void
  onEvolutionSelect: (id: EvolutionId) => void
  onHydrant: () => void
  onTemplateDrop: (id: string, point: { x: number; y: number }) => void
}) {
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined)
  const suppressClick = useRef(false)
  return <aside className="incident-rail" aria-label="Incident equipment">
    {apparatusCatalog.filter((item) => props.availableApparatus.includes(item.id)).map((item) => <button key={item.id} disabled={props.disabled} className="rail-tool" aria-pressed={props.placementTemplateId === item.id} title={`${item.designation}: tap then tap map, or drag onto map`} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return }; props.onTemplateSelect(item.id) }} onPointerDown={(event) => { dragStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerUp={(event) => { const start = dragStart.current; const dragged = Boolean(start && Math.hypot(event.clientX-start.x,event.clientY-start.y)>8); suppressClick.current=dragged; if (dragged) props.onTemplateDrop(item.id,{x:event.clientX,y:event.clientY}); event.currentTarget.releasePointerCapture(event.pointerId) }}><img src={item.assetPath} alt=""/><strong className="display">{item.id}</strong></button>)}
    <button disabled={props.disabled} className="rail-tool" aria-pressed={props.hydrantActive} onClick={props.onHydrant}><MapPin className="mx-auto mb-1 text-[#57a8df]" size={30}/><strong className="display">Hydrant</strong></button>
    {evolutionCatalog.filter((item) => props.availableEvolutions.includes(item.id)).map((item) => <button key={item.id} disabled={props.disabled || Boolean(props.selectedEvolutionId)} className="rail-tool" aria-pressed={props.selectedEvolutionId === item.id} title={props.selectedEvolutionId ? 'Complete the active evolution before starting another.' : item.summary} onClick={() => props.onEvolutionSelect(item.id)}>{item.id.includes('lay') ? <Droplets className="mx-auto mb-1 text-[#57a8df]" size={28}/> : <Flame className="mx-auto mb-1 text-[#d9c8a5]" size={28}/>}<strong className="display text-[.68rem]">{item.label}</strong></button>)}
  </aside>
}
