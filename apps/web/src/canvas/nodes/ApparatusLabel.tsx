import { memo } from 'react'
import { Group, Label, Tag, Text } from 'react-konva'
import type { ApparatusObject } from '@mbfd/domain'
import type { ApparatusSize } from '@mbfd/fire-model'
import { ink, verticalExtent } from '../interaction'

/** Upright, constant-size unit label under each vehicle. */
export const ApparatusLabel = memo(function ApparatusLabel({ object, size, inv, scale, supply }: { object: ApparatusObject; size: ApparatusSize; inv: number; scale: number; supply: 'hydrant' | 'tank' | 'none' }) {
  const offset = verticalExtent(size, object.rotation) + 5 * inv
  const accent = supply === 'hydrant' ? ink.ok : supply === 'tank' ? '#5cb8ff' : ink.tan
  return (
    <Group x={object.x} y={object.y + offset} scaleX={inv * scale} scaleY={inv * scale} listening={false}>
      <Label x={0} y={0}>
        <Tag fill={ink.label} stroke={accent} strokeWidth={1.5} cornerRadius={4} pointerDirection="up" pointerWidth={8} pointerHeight={4} />
        <Text text={object.label} fontFamily="Barlow" fontStyle="700" fontSize={14} padding={4} fill={ink.labelText} letterSpacing={0.4} />
      </Label>
      {object.assignment && (
        <Label x={0} y={27}>
          <Tag fill="rgba(11,16,19,0.82)" cornerRadius={3} pointerDirection="up" pointerWidth={0} pointerHeight={0} />
          <Text text={object.assignment.toUpperCase()} fontFamily="Barlow" fontStyle="600" fontSize={10.5} padding={3} fill={ink.tan} letterSpacing={0.6} />
        </Label>
      )}
    </Group>
  )
})
