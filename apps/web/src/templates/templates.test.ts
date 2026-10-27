import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { boardSchema, scenarioKey } from '@mbfd/domain'
import { boardFromTemplate, defaultTemplate, findTemplate, templates } from '.'

const publicDir = path.resolve(__dirname, '../../public')

describe('scenario templates', () => {
  it('keeps Waterfront Estate as the default scenario, unchanged', () => {
    expect(defaultTemplate.id).toBe('waterfront-estate')
    const waterfront = findTemplate('waterfront-estate')!
    expect(waterfront.scenario.title).toBe('Residential Structure Fire — Waterfront Estate')
    expect(waterfront.scenario.background).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/background.webp' })
    expect(waterfront.scenario.video).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/initial-conditions.mp4' })
    expect(waterfront.scenario.world).toEqual({ width: 1586, height: 992 })
    expect(waterfront.objects.map((object) => object.type)).toEqual(['hydrant'])
  })

  it('offers the Oceanfront Condominium as a second scenario with no video', () => {
    const oceanfront = findTemplate('oceanfront-condo')!
    expect(templates.map((template) => template.id)).toEqual(['waterfront-estate', 'oceanfront-condo'])
    expect(oceanfront.scenario.video).toBeUndefined()
    expect(oceanfront.scenario.poster).toBeUndefined()
    expect(oceanfront.objects).toEqual([])
    // About 2.2 map pixels per foot on the 2× map, from two 11 ft lanes.
    expect(1 / oceanfront.scenario.calibration!.feetPerWorldUnit).toBeCloseTo(98 / 22, 6)
  })

  it('builds valid boards and ships every map and thumbnail it points to', () => {
    for (const template of templates) {
      const board = boardFromTemplate(template)
      expect(boardSchema.safeParse(board).success).toBe(true)
      expect(scenarioKey(board)).toBe(template.id)
      const background = template.scenario.background
      if (background.kind === 'builtin') expect(existsSync(path.join(publicDir, background.url))).toBe(true)
      expect(existsSync(path.join(publicDir, template.thumbnailUrl))).toBe(true)
    }
  })
})
