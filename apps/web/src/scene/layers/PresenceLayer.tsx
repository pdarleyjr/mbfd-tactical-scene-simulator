import { Group, Layer, Text } from 'react-konva'

export function PresenceLayer({ presence }: { presence: Array<Record<string, unknown>> }) {
  return <Layer listening={false}>{presence.map((state, index) => {
    const cursor = state.cursor as { x?: number; y?: number } | undefined
    const user = state.user as { name?: string; unit?: string } | undefined
    if (typeof cursor?.x !== 'number' || typeof cursor.y !== 'number') return null
    return <Group key={`${user?.name ?? 'user'}-${index}`} x={cursor.x} y={cursor.y}><Text text="◆" fill="#57a8df" fontSize={18}/><Text x={16} y={2} text={`${user?.unit ?? ''} ${user?.name ?? ''}`.trim()} fill="#fff" fontSize={12}/></Group>
  })}</Layer>
}
