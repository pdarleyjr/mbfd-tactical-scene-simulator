import { memo } from 'react'
import { Group, Image, Rect, Text } from 'react-konva'
import { findApparatusTemplate, type ApparatusObject } from '@mbfd/domain'
import type { ApparatusSize } from '@mbfd/fire-model'
import { useHtmlImage } from '../images'
import { ink, useInteraction } from '../interaction'

interface Props {
  object: ApparatusObject
  size: ApparatusSize
  selected: boolean
  /** 1 ÷ zoom, so outlines stay a constant screen thickness. */
  inv: number
  ghost?: boolean
}

export const ApparatusNode = memo(function ApparatusNode({ object, size, selected, inv, ghost }: Props) {
  const template = findApparatusTemplate(object.templateId)
  const { image } = useHtmlImage(template?.assetPath)
  const interaction = useInteraction()
  const { length, width } = size
  const draggable = interaction.interactive && !object.locked && !ghost
  return (
    <Group
      {...(ghost ? {} : { id: object.id, name: 'scene-object apparatus' })}
      x={object.x}
      y={object.y}
      rotation={object.rotation}
      opacity={ghost ? 0.55 : 1}
      listening={!ghost}
      draggable={draggable}
      onPointerDown={(event) => interaction.pick(object.id, event)}
      onDragStart={(event) => interaction.dragStart(object.id, event)}
      onDragMove={(event) => interaction.dragMove(object.id, event)}
      onDragEnd={(event) => interaction.dragEnd(object.id, event)}
    >
      <Rect x={-width / 2 + 1.2} y={-length / 2 + 2.4} width={width} height={length} cornerRadius={width * 0.16} fill="rgba(0,0,0,0.38)" listening={false} />
      {image
        ? <Image image={image} x={-width / 2} y={-length / 2} width={width} height={length} perfectDrawEnabled={false} />
        : <Rect x={-width / 2} y={-length / 2} width={width} height={length} cornerRadius={width * 0.12} fill="#c8372d" stroke="#f3f1ea" strokeWidth={1} />}
      {!image && <Text x={-width / 2} y={-6} width={width} align="center" text={object.label} fontSize={10} fontStyle="bold" fill="#fff" listening={false} />}
      {selected && (
        <Rect
          x={-width / 2 - 4 * inv}
          y={-length / 2 - 4 * inv}
          width={width + 8 * inv}
          height={length + 8 * inv}
          cornerRadius={4 * inv}
          stroke={ink.select}
          strokeWidth={2}
          strokeScaleEnabled={false}
          dash={[7, 4]}
          listening={false}
        />
      )}
      {object.locked && selected && <Text x={-width / 2} y={-length / 2 - 18 * inv} width={width} align="center" text="LOCKED" fontSize={10 * inv} fontStyle="bold" fill={ink.warning} listening={false} />}
    </Group>
  )
})
