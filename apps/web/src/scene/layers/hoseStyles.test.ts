import { describe, expect, it } from 'vitest'
import { hoseStyles } from './hoseStyles.js'

describe('hose visual semantics', () => {
  it('uses the required training colors and relative widths', () => {
    expect(hoseStyles.attack175).toEqual(expect.objectContaining({ color: '#35a854', width: 6 }))
    expect(hoseStyles.hose3).toEqual(expect.objectContaining({ color: '#f4f4ee', width: 8 }))
    expect(hoseStyles.supply5).toEqual(expect.objectContaining({ color: '#f2c230', width: 11 }))
    expect(hoseStyles.supply5.width).toBeGreaterThan(hoseStyles.hose3.width)
    expect(hoseStyles.hose3.width).toBeGreaterThan(hoseStyles.attack175.width)
  })
})
