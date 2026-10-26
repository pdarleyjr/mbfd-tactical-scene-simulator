import { createContext, useContext } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { ApparatusSize } from '@mbfd/fire-model'

export interface NodeInteraction {
  /** Objects respond to pointer input (select tool, not reviewing). */
  interactive: boolean
  pick(id: string, event: KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>): void
  dragStart(id: string, event: KonvaEventObject<DragEvent>): void
  dragMove(id: string, event: KonvaEventObject<DragEvent>): void
  dragEnd(id: string, event: KonvaEventObject<DragEvent>): void
}

const noop = () => undefined

export const InteractionContext = createContext<NodeInteraction>({ interactive: false, pick: noop, dragStart: noop, dragMove: noop, dragEnd: noop })

export function useInteraction() {
  return useContext(InteractionContext)
}

/** Shared palette for canvas drawing; mirrors the CSS tokens. */
export const ink = {
  outline: '#0b1013',
  select: '#5cb8ff',
  selectSoft: 'rgba(92,184,255,0.18)',
  label: '#0f1519',
  labelText: '#f3f1ea',
  muted: '#9fb0b8',
  tan: '#d9c8a5',
  warning: '#ffb020',
  ok: '#4cc38a',
  danger: '#ff4d3d',
}

/** Registry of animated "water moving" overlays, driven by one animation loop. */
export const FlowContext = createContext<{ register(node: Konva.Line): () => void } | null>(null)

/** Vertical extent of a rotated vehicle, so its label sits just below it. */
export function verticalExtent(size: ApparatusSize, rotation: number): number {
  const radians = rotation * Math.PI / 180
  return Math.abs(size.length / 2 * Math.cos(radians)) + Math.abs(size.width / 2 * Math.sin(radians))
}
