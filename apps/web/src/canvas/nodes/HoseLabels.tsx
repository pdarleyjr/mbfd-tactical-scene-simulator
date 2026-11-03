import { memo } from 'react'
import { Group, Rect, Text } from 'react-konva'
import { ink } from '../interaction'
import { labelMetrics, type PlacedLabel } from '../labels'

export interface HoseLabelView extends PlacedLabel {
  text: string
  /** The hose color, used for the pill's outline so each label matches its line. */
  color: string
  tone: 'normal' | 'over' | 'uncalibrated'
  selected: boolean
}

const toneText: Record<HoseLabelView['tone'], string> = { normal: '#ffffff', over: ink.warning, uncalibrated: '#e8d9b5' }

/**
 * Hose lengths in solid, outlined pills: upright, screen-sized, and set beside
 * their line by `layoutLineLabels`, so they read on a phone and across a
 * classroom and never sit on top of the hose.
 */
export const HoseLengthLabels = memo(function HoseLengthLabels({ labels, inv }: { labels: readonly HoseLabelView[]; inv: number }) {
  return (
    <Group listening={false} name="hose-length-labels">
      {labels.map((label) => {
        const metrics = labelMetrics(label.fontPx)
        const stroke = label.selected ? ink.select : label.tone === 'over' ? ink.warning : label.color
        return (
          <Group key={label.id} x={label.x} y={label.y} scaleX={inv} scaleY={inv} name="hose-length-label" id={`label-${label.id}`}>
            <Rect
              x={-label.width / 2}
              y={-label.height / 2}
              width={label.width}
              height={label.height}
              cornerRadius={label.height / 2}
              fill={label.tone === 'over' ? '#2b1c05' : '#0b1013'}
              stroke={stroke}
              strokeWidth={label.selected ? metrics.strokePx + 1 : metrics.strokePx}
              perfectDrawEnabled={false}
            />
            <Text
              name="hose-length-text"
              x={-label.width / 2}
              y={-label.height / 2}
              width={label.width}
              height={label.height}
              align="center"
              verticalAlign="middle"
              text={label.text}
              fontFamily="Barlow"
              fontStyle="700"
              fontSize={label.fontPx}
              fill={toneText[label.tone]}
              wrap="none"
              perfectDrawEnabled={false}
            />
          </Group>
        )
      })}
    </Group>
  )
})
