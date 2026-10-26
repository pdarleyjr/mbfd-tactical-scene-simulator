import { expect, test, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sim = any

async function open(page: Page) {
  await page.goto('/')
  await expect(page.locator('.app[data-ready]')).toBeVisible()
  await page.waitForFunction(() => Boolean((window as Sim).__sim))
  await page.waitForTimeout(150)
}

const board = (page: Page) => page.evaluate(() => (window as Sim).__sim.board())

async function toScreen(page: Page, x: number, y: number) {
  return page.evaluate(([wx, wy]) => (window as Sim).__sim.toScreen(wx, wy), [x, y] as const)
}

async function clickWorld(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y)
  await page.mouse.click(point.x, point.y)
}

async function dragWorld(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from)
  const b = await toScreen(page, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) await page.mouse.move(a.x + (b.x - a.x) * step / 8, a.y + (b.y - a.y) * step / 8)
  await page.mouse.up()
}


async function placeUnit(page: Page, unit: string, x: number, y: number) {
  await page.keyboard.press('a')
  await page.locator(`[data-unit="${unit}"]`).click()
  await clickWorld(page, x, y)
  await page.keyboard.press('Escape')
}

const unitOf = async (page: Page, templateId: string) => (await board(page)).objects.find((object: Sim) => object.type === 'apparatus' && object.templateId === templateId)
const portAt = (page: Page, objectId: string, portId: string) => page.evaluate(([id, port]) => (window as Sim).__sim.portAt(id, port), [objectId, portId] as const)

test.describe('MBFD Tactical Scene Simulator', () => {
  test('opens straight into the calibrated Waterfront Estate scene with no sign-in', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('scene-title')).toContainText('Residential Structure Fire')
    await expect(page.getByText(/PIN|Join a room|Sign in/i)).toHaveCount(0)
    const current = await board(page)
    expect(current.templateId).toBe('waterfront-estate')
    expect(current.objects.filter((object: Sim) => object.type === 'hydrant').map((object: Sim) => object.label)).toEqual(['H1'])
    expect(current.scenario.injects).toHaveLength(2)
    expect(current.scenario.benchmarks).toHaveLength(5)
    expect(current.scenario.hoseLoads.loadLengthFt.jumpline).toBe(200)
    await expect(page.getByTestId('save-status')).toContainText(/Saved on this device|Saved|Not saving/)
    await expect(page.getByTestId('calibration-badge')).toHaveText('Calibrated')
  })

  test('places each unit once, then it can be moved right away', async ({ page }) => {
    await open(page)
    await page.keyboard.press('a')
    await page.locator('[data-unit="E1"]').click()
    await clickWorld(page, 900, 600)
    const e1 = await unitOf(page, 'E1')
    expect(e1.label).toBe('E1')
    // Placing hands the unit straight to the Select tool, selected.
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'apparatus')
    await dragWorld(page, [900, 600], [960, 650])
    const moved = await unitOf(page, 'E1')
    expect(moved.x).toBeGreaterThan(940)
    expect(moved.y).toBeGreaterThan(630)

    // A placed unit cannot be placed again: its card selects the one on the map.
    await page.keyboard.press('a')
    await expect(page.locator('[data-unit="E1"]')).toHaveAttribute('data-placed', 'true')
    await page.locator('[data-unit="E1"]').click()
    let units = (await board(page)).objects.filter((object: Sim) => object.type === 'apparatus')
    expect(units).toHaveLength(1)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'apparatus')

    await placeUnit(page, 'R2', 800, 700)
    await placeUnit(page, 'L3', 760, 500)
    units = (await board(page)).objects.filter((object: Sim) => object.type === 'apparatus')
    expect(units.map((unit: Sim) => unit.label).sort()).toEqual(['E1', 'L3', 'R2'])
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+d')
    expect((await board(page)).objects.filter((object: Sim) => object.type === 'apparatus')).toHaveLength(3)
  })

  test('positions precisely: drag, rotate, nudge, undo', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E2', 900, 600)
    const placed = await unitOf(page, 'E2')
    await clickWorld(page, 900, 600)
    await page.keyboard.press(']')
    await page.keyboard.press('Shift+]')
    expect((await unitOf(page, 'E2')).rotation).toBe(16)
    await page.getByRole('button', { name: 'Move right 1 ft' }).click()
    const nudged = await unitOf(page, 'E2')
    const unitsPerFt = 1 / (await board(page)).scenario.calibration.feetPerWorldUnit
    expect(nudged.x - placed.x).toBeCloseTo(unitsPerFt, 3)
    await page.getByRole('button', { name: 'Pull forward' }).click()
    expect((await unitOf(page, 'E2')).y).toBeLessThan(nudged.y)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    expect((await unitOf(page, 'E2')).x).toBeCloseTo(placed.x, 6)
    await page.keyboard.press('Control+Shift+z')
    expect((await unitOf(page, 'E2')).x).toBeCloseTo(nudged.x, 6)
  })

  test('keeps the map still: dragging empty map never pans it', async ({ page }) => {
    await open(page)
    const before = await page.evaluate(() => (window as Sim).__sim.ui().view)
    await dragWorld(page, [500, 300], [700, 450])
    await page.keyboard.press('a')
    await page.locator('[data-unit="E4"]').click()
    await dragWorld(page, [500, 700], [650, 650])
    const after = await page.evaluate(() => (window as Sim).__sim.ui().view)
    expect(after).toEqual(before)
    expect(await unitOf(page, 'E4')).toBeUndefined()
  })

  test('lays 5″ supply from the hydrant to a tapped engine, and it follows the engine', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E1', 980, 600)
    const engine = await unitOf(page, 'E1')
    const hydrant = (await board(page)).objects.find((object: Sim) => object.type === 'hydrant')
    await page.keyboard.press('h')
    await page.locator('[data-evolution="forward-lay"]').click()
    await clickWorld(page, hydrant.x, hydrant.y)
    await clickWorld(page, 1010, 690)
    // Tapping the engine body, not a precise port, completes the lay at its intake.
    await clickWorld(page, engine.x + 2, engine.y + 8)
    let hose = (await board(page)).objects.find((object: Sim) => object.type === 'hose')
    expect(hose.from).toEqual({ objectId: hydrant.id, portId: 'storz' })
    expect(hose.to).toEqual({ objectId: engine.id, portId: 'intake' })
    expect(hose.layDirection).toBe('forward')
    expect(hose.loadFt).toBe(800)
    expect((await unitOf(page, 'E1')).x).toBe(engine.x)

    await page.keyboard.press('Escape')
    await page.keyboard.press('v')
    await dragWorld(page, [engine.x, engine.y], [engine.x - 50, engine.y - 50])
    hose = (await board(page)).objects.find((object: Sim) => object.type === 'hose')
    const intake = await portAt(page, engine.id, 'intake')
    expect(hose.points.at(-2)).toBeCloseTo(intake.x, 3)
    expect(hose.points.at(-1)).toBeCloseTo(intake.y, 3)

    await page.keyboard.press('Escape')
    await page.getByTestId('supply-toggle').click()
    await expect(page.getByTestId('supply-panel')).toContainText('From H1')
  })

  test('starting a supply line at the engine makes it a reverse lay', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E3', 980, 600)
    const engine = await unitOf(page, 'E3')
    const hydrant = (await board(page)).objects.find((object: Sim) => object.type === 'hydrant')
    await page.keyboard.press('h')
    await page.locator('[data-evolution="forward-lay"]').click()
    await clickWorld(page, engine.x, engine.y)
    await clickWorld(page, hydrant.x, hydrant.y)
    const hose = (await board(page)).objects.find((object: Sim) => object.type === 'hose')
    expect(hose.evolution).toBe('reverse-lay')
    expect(hose.layDirection).toBe('reverse')
    expect(hose.from).toEqual({ objectId: hydrant.id, portId: 'storz' })
    expect(hose.to).toEqual({ objectId: engine.id, portId: 'intake' })
  })

  test('pulls a 200′ preconnect from a tapped engine and finishes with a nozzle', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E1', 980, 600)
    const engine = await unitOf(page, 'E1')
    await page.keyboard.press('h')
    await page.locator('[data-evolution="jumpline"]').click()
    await clickWorld(page, engine.x, engine.y)
    await clickWorld(page, 900, 520)
    await clickWorld(page, 860, 470)
    await expect(page.getByTestId('draft-length')).toContainText('of 200 ft')
    await page.getByTestId('finish-line').click()
    const objects = (await board(page)).objects
    const attack = objects.find((object: Sim) => object.type === 'hose')
    expect(attack.from.objectId).toBe(engine.id)
    expect(attack.from.portId).toMatch(/^discharge-1\.5/)
    expect(attack.loadFt).toBe(200)
    expect(objects.filter((object: Sim) => object.type === 'nozzle')).toHaveLength(1)
    expect((await unitOf(page, 'E1')).x).toBe(engine.x)
  })

  test('3″ to a gated wye places the wye, an attack line, and a nozzle', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E3', 900, 600)
    const engine = await unitOf(page, 'E3')
    await clickWorld(page, engine.x, engine.y)
    await page.getByRole('button', { name: '3″ to gated wye' }).click()
    await clickWorld(page, 860, 520)
    await page.getByTestId('finish-line').click()
    await clickWorld(page, 820, 470)
    await page.getByTestId('finish-line').click()
    const objects = (await board(page)).objects
    const hoses = objects.filter((object: Sim) => object.type === 'hose')
    expect(hoses.map((hose: Sim) => hose.hoseType).sort()).toEqual(['attack175', 'hose3'])
    expect(objects.filter((object: Sim) => object.type === 'appliance')).toHaveLength(1)
    expect(objects.filter((object: Sim) => object.type === 'nozzle')).toHaveLength(1)
  })


  test('reshapes a hose by dragging a bend handle', async ({ page }) => {
    await open(page)
    await page.keyboard.press('h')
    await page.locator('[data-hose="attack175"]').click()
    await clickWorld(page, 900, 500)
    await clickWorld(page, 1100, 500)
    await page.getByTestId('finish-line').click()
    await page.keyboard.press('v')
    await clickWorld(page, 950, 500)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'hose')
    await dragWorld(page, [1000, 500], [1000, 440])
    const hose = (await board(page)).objects.find((object: Sim) => object.type === 'hose')
    expect(hose.points.length).toBe(6)
    expect(hose.points[3]).toBeLessThan(470)
  })

  test('calibrates from a reference and reads distances in feet', async ({ page }) => {
    await open(page)
    await page.keyboard.press('c')
    await clickWorld(page, 900, 300)
    await clickWorld(page, 1100, 300)
    await expect(page.getByTestId('calibration-dialog')).toBeVisible()
    await page.getByTestId('calibration-feet').fill('100')
    await page.getByTestId('apply-calibration').click()
    const calibration = (await board(page)).scenario.calibration
    expect(calibration.feetPerWorldUnit).toBeCloseTo(0.5, 5)
    await expect(page.getByTestId('calibration-badge')).toHaveText('Calibrated')
    await page.keyboard.press('r')
    await clickWorld(page, 900, 400)
    await clickWorld(page, 1200, 400)
    await expect(page.getByTestId('draft-length')).toContainText('150 ft')
  })

  test('autosaves, restores after reload, and resets without losing work', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'L3', 800, 600)
    await placeUnit(page, 'E2', 860, 600)
    await expect(page.getByTestId('save-status')).toContainText('Saved', { timeout: 5000 })
    await page.waitForTimeout(700)
    await page.reload()
    await open(page)
    expect((await board(page)).objects.filter((object: Sim) => object.type === 'apparatus')).toHaveLength(2)

    await page.getByTestId('more-menu').click()
    await page.getByRole('menuitem', { name: 'Reset to original scenario' }).click()
    await page.getByTestId('confirm-reset').click()
    let current = await board(page)
    expect(current.objects.map((object: Sim) => object.type)).toEqual(['hydrant'])
    expect(current.snapshots).toHaveLength(1)
    await page.keyboard.press('Control+z')
    current = await board(page)
    expect(current.objects.filter((object: Sim) => object.type === 'apparatus')).toHaveLength(2)
  })

  test('exports a portable scene file and imports it as a new board', async ({ page }, testInfo) => {
    await open(page)
    await placeUnit(page, 'E4', 820, 640)
    const original = await board(page)
    await page.getByTestId('scene-title').click()
    await expect(page.getByTestId('library-dialog')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-scene').click()])
    const path = testInfo.outputPath('scene.mbfd-scene.json')
    await download.saveAs(path)
    await page.getByTestId('import-input').setInputFiles(path)
    await expect(page.getByTestId('library-dialog')).toHaveCount(0)
    const imported = await board(page)
    expect(imported.id).not.toBe(original.id)
    expect(imported.objects.filter((object: Sim) => object.type === 'apparatus').map((object: Sim) => object.label)).toEqual(['E4'])
    await page.getByTestId('scene-title').click()
    await expect(page.getByTestId('board-list').locator('li')).toHaveCount(2)
  })

  test('runs the training flow: dispatch, video, timer, injects, benchmarks', async ({ page }) => {
    await open(page)
    await page.getByTestId('training-toggle').click()
    await expect(page.getByTestId('dispatch-text')).toContainText('Residential structure fire')
    await page.getByTestId('play-video').click()
    await expect(page.getByTestId('initial-video')).toHaveAttribute('src', /initial-conditions\.mp4/)
    await page.keyboard.press('Escape')
    await page.getByTestId('start-timer').click()
    await page.getByTestId('reveal-occupant-report').click()
    await expect(page.getByTestId('inject-banner')).toContainText('Occupant report')
    await page.getByTestId('benchmark-command-established').click()
    await expect(page.getByTestId('benchmark-command-established')).toHaveAttribute('aria-checked', 'true')
    const training = (await board(page)).training
    expect(training.timer.running).toBe(true)
    expect(Object.keys(training.revealed)).toEqual(['occupant-report'])
    expect(Object.keys(training.completed)).toEqual(['command-established'])
  })

  test('presents in classroom mode and replays the recorded run', async ({ page }) => {
    await open(page)
    await page.getByTestId('training-toggle').click()
    await page.getByTestId('start-timer').click()
    await page.getByTestId('training-toggle').click()
    await page.waitForTimeout(400)
    await placeUnit(page, 'L1', 900, 620)
    await page.keyboard.press('p')
    await expect(page.getByTestId('present-overlay')).toBeVisible()
    await expect(page.getByTestId('tool-dock')).toHaveCount(0)
    await page.getByTestId('exit-present').click()
    await expect(page.getByTestId('present-overlay')).toHaveCount(0)

    await page.getByTestId('training-toggle').click()
    await page.getByTestId('start-review').click()
    await expect(page.getByTestId('review-bar')).toBeVisible()
    await page.getByTestId('review-scrubber').fill('0')
    await expect.poll(() => page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(0)
    const max = await page.getByTestId('review-scrubber').getAttribute('max')
    await page.getByTestId('review-scrubber').fill(max!)
    await expect.poll(() => page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(1)
    await page.getByTestId('exit-review').click()
    await expect(page.getByTestId('review-bar')).toHaveCount(0)
  })

  test('stays responsive with 100 apparatus and 40 hose lines', async ({ page }) => {
    await open(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const elapsed = await page.evaluate(() => {
      const sim = (window as Sim).__sim
      const ids = ['E1', 'E2', 'E3', 'E4', 'L1', 'L3']
      const objects = [...sim.board().objects]
      for (let index = 0; index < 100; index += 1) {
        const templateId = ids[index % ids.length]
        objects.push({ id: `stress-${index}`, type: 'apparatus', templateId, label: `${templateId}-S${index}`, assignment: '', x: 120 + (index % 20) * 66, y: 140 + Math.floor(index / 20) * 150, rotation: (index * 15) % 360, locked: false })
      }
      for (let index = 0; index < 40; index += 1) {
        objects.push({ id: `stress-hose-${index}`, type: 'hose', hoseType: ['attack175', 'hose3', 'supply5'][index % 3], purpose: 'attack', points: [100 + index * 30, 900, 160 + index * 30, 860, 200 + index * 30, 920], label: '', locked: false })
      }
      const started = performance.now()
      sim.store.getState().commit(objects, 'Stress scene')
      return performance.now() - started
    })
    expect(elapsed).toBeLessThan(1000)
    await expect.poll(() => page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(100)
    await page.keyboard.press('v')
    const started = Date.now()
    await dragWorld(page, [120, 140], [150, 170])
    expect(Date.now() - started).toBeLessThan(4000)
    const moved = (await board(page)).objects.find((object: Sim) => object.id === 'stress-0')
    expect(moved.x).toBeGreaterThan(130)
    expect(errors).toEqual([])
  })
})
