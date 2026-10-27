import { expect, test, type Browser, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sim = any

/** Every test works in its own live scene, so parallel tests never share one. */
function freshSceneId() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

async function ready(page: Page) {
  await expect(page.locator('.app[data-ready][data-live="live"]')).toBeVisible()
  await page.waitForFunction(() => Boolean((window as Sim).__sim))
  await page.waitForTimeout(150)
}

async function open(page: Page, sceneId = freshSceneId(), query = '') {
  await page.goto(`/s/${sceneId}${query}`)
  await ready(page)
  return sceneId
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
    await expect(page.getByTestId('live-status')).toHaveAttribute('data-connection', 'live')
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

  test('saves on the server, restores after reload, and resets without losing work', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'L3', 800, 600)
    await placeUnit(page, 'E2', 860, 600)
    await page.waitForTimeout(900)
    // Clear this browser's cached copy: what comes back must come from the server.
    await page.evaluate(() => new Promise((resolve) => { const request = indexedDB.deleteDatabase('mbfd-tactical-scene-simulator'); request.onsuccess = request.onerror = request.onblocked = () => resolve(null) }))
    await page.reload()
    await ready(page)
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

  test('exports a portable scene file and imports it as a separate scene', async ({ page }, testInfo) => {
    await open(page)
    await placeUnit(page, 'E4', 820, 640)
    const original = await board(page)
    await page.getByTestId('scene-title').click()
    await expect(page.getByTestId('library-dialog')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-scene').click()])
    const path = testInfo.outputPath('scene.mbfd-scene.json')
    await download.saveAs(path)
    const before = page.url()
    await page.getByTestId('import-input').setInputFiles(path)
    // An import opens as a new separate scene with its own link; nobody's work is replaced.
    await page.waitForURL((url) => url.href !== before && /\/s\/[a-z0-9]+$/.test(url.pathname))
    await ready(page)
    const imported = await board(page)
    expect(imported.id).not.toBe(original.id)
    expect(imported.objects.filter((object: Sim) => object.type === 'apparatus').map((object: Sim) => object.label)).toEqual(['E4'])
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

test.describe('Shared live scenes', () => {
  async function secondBrowser(browser: Browser) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    return { context, page: await context.newPage() }
  }

  test('two people in the same scene see each other’s work live, and undo is per person', async ({ page, browser }) => {
    const sceneId = await open(page)
    const other = await secondBrowser(browser)
    try {
      await open(other.page, sceneId)
      await expect(page.getByTestId('live-status')).toHaveAttribute('data-peers', '2')
      await expect(other.page.getByTestId('in-use-banner')).toBeVisible()

      await placeUnit(page, 'E1', 900, 600)
      await expect.poll(async () => (await unitOf(other.page, 'E1'))?.x).toBeCloseTo(900, 0)
      await placeUnit(other.page, 'L1', 1000, 640)
      await expect.poll(async () => Boolean(await unitOf(page, 'L1'))).toBe(true)

      // A move shows up for the other person, and their unit list stays in step.
      await dragWorld(page, [900, 600], [960, 660])
      await expect.poll(async () => (await unitOf(other.page, 'E1'))?.x ?? 0).toBeGreaterThan(940)

      // Undo takes back only this person's last change, never the other person's unit.
      await page.keyboard.press('Control+z')
      await page.keyboard.press('Control+z')
      await expect.poll(async () => Boolean(await unitOf(other.page, 'E1'))).toBe(false)
      expect(Boolean(await unitOf(page, 'L1'))).toBe(true)
      expect(Boolean(await unitOf(other.page, 'L1'))).toBe(true)

      await other.page.close()
      await expect(page.getByTestId('live-status')).toHaveAttribute('data-peers', '1')
    } finally {
      await other.context.close()
    }
  })

  test('starts a separate scene with its own link that does not touch the first', async ({ page, browser }) => {
    const sceneId = await open(page)
    const other = await secondBrowser(browser)
    try {
      await open(other.page, sceneId)
      await other.page.getByTestId('banner-separate-scene').click()
      await other.page.waitForURL((url) => !url.pathname.endsWith(sceneId))
      await ready(other.page)
      expect(new URL(other.page.url()).pathname).toMatch(/^\/s\/[a-z0-9]{8}$/)
      await placeUnit(other.page, 'E3', 700, 500)
      await page.waitForTimeout(500)
      expect(await unitOf(page, 'E3')).toBeUndefined()
      await expect(page.getByTestId('live-status')).toHaveAttribute('data-peers', '1')
      await expect(other.page.getByTestId('scene-title')).toContainText('Separate scene')
    } finally {
      await other.context.close()
    }
  })

  test('the classroom display shows the scene live and cannot be edited', async ({ page, browser }) => {
    const sceneId = await open(page)
    await placeUnit(page, 'E2', 850, 600)
    const tv = await secondBrowser(browser)
    try {
      await open(tv.page, sceneId, '?view=present')
      await expect(tv.page.locator('.app[data-display]')).toBeVisible()
      await expect(tv.page.getByTestId('present-overlay')).toBeVisible()
      await expect(tv.page.getByTestId('present-live')).toContainText('Live')
      await expect(tv.page.getByTestId('tool-dock')).toHaveCount(0)
      await expect(tv.page.getByTestId('topbar')).toHaveCount(0)
      await expect.poll(() => tv.page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(1)

      // Work done at the table appears on the TV without anyone touching it.
      await placeUnit(page, 'L3', 980, 640)
      await expect.poll(() => tv.page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(2)
      await page.getByTestId('training-toggle').click()
      await page.getByTestId('start-timer').click()
      await page.getByTestId('reveal-occupant-report').click()
      await expect(tv.page.getByTestId('inject-banner')).toContainText('Occupant report')

      // Dragging on the TV never moves a unit.
      const before = await unitOf(tv.page, 'E2')
      await dragWorld(tv.page, [850, 600], [920, 660])
      await tv.page.waitForTimeout(300)
      expect((await unitOf(page, 'E2')).x).toBe(before.x)

      // The presenter's own Present view offers the display link.
      await page.keyboard.press('Escape')
      await page.getByTestId('present-button').click()
      await expect(page.getByTestId('present-display-link')).toBeVisible()
      await expect(page.getByTestId('present-live')).toContainText('2 connected')
    } finally {
      await tv.context.close()
    }
  })

  test('keeps working through a dropped connection and shares the edits when it returns', async ({ page, browser }) => {
    const sceneId = await open(page)
    const other = await secondBrowser(browser)
    try {
      await open(other.page, sceneId)
      await page.evaluate(() => (window as Sim).__sim.dropConnection())
      await expect(page.getByTestId('live-status')).not.toHaveAttribute('data-connection', 'live')
      await placeUnit(page, 'E4', 760, 560)
      await expect(page.locator('.app[data-live="live"]')).toBeVisible({ timeout: 15_000 })
      await expect.poll(async () => Boolean(await unitOf(other.page, 'E4')), { timeout: 10_000 }).toBe(true)
    } finally {
      await other.context.close()
    }
  })
})

test.describe('Scenarios and fire effects', () => {
  async function switchTo(page: Page, templateId: string) {
    await page.getByTestId('scene-title').click()
    await page.getByTestId(`switch-to-${templateId}`).click()
  }

  test('switching scenario moves everyone, and each scenario keeps its own work', async ({ page, browser }) => {
    const sceneId = await open(page)
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const other = await context.newPage()
    try {
      await open(other, sceneId)
      await placeUnit(page, 'E1', 900, 600)

      await switchTo(page, 'oceanfront-condo')
      await expect.poll(async () => (await board(other)).templateId).toBe('oceanfront-condo')
      await expect(other.getByTestId('scene-title')).toContainText('Oceanfront Condominium')
      await expect.poll(async () => (await board(page)).templateId).toBe('oceanfront-condo')
      expect((await board(page)).scenario.video).toBeUndefined()
      expect(await unitOf(page, 'E1')).toBeUndefined()
      await placeUnit(other, 'L1', 800, 700)
      await expect.poll(async () => Boolean(await unitOf(page, 'L1'))).toBe(true)

      // Back to the Waterfront: its work is exactly as it was, untouched by the other scenario.
      await page.waitForTimeout(2100)
      await switchTo(other, 'waterfront-estate')
      await expect.poll(async () => (await board(page)).templateId).toBe('waterfront-estate')
      await expect.poll(async () => (await unitOf(page, 'E1'))?.x).toBeCloseTo(900, 0)
      expect(await unitOf(page, 'L1')).toBeUndefined()
      expect((await board(page)).objects.filter((object: Sim) => object.type === 'hydrant').map((object: Sim) => object.label)).toEqual(['H1'])

      await page.waitForTimeout(2100)
      await switchTo(page, 'oceanfront-condo')
      await expect.poll(async () => Boolean(await unitOf(other, 'L1'))).toBe(true)
      expect(await unitOf(other, 'E1')).toBeUndefined()
    } finally {
      await context.close()
    }
  })

  test('a device that was offline during a switch rejoins on the new scenario without carrying old edits into it', async ({ page, browser }) => {
    const sceneId = await open(page)
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const other = await context.newPage()
    try {
      await open(other, sceneId)
      await page.evaluate(() => (window as Sim).__sim.dropConnection())
      await placeUnit(page, 'E3', 760, 560)
      await switchTo(other, 'oceanfront-condo')
      await expect(page.locator('.app[data-live="live"]')).toBeVisible({ timeout: 15_000 })
      await expect.poll(async () => (await board(page)).templateId).toBe('oceanfront-condo')
      await page.waitForTimeout(500)
      expect(await unitOf(page, 'E3')).toBeUndefined()
      expect(await unitOf(other, 'E3')).toBeUndefined()
    } finally {
      await context.close()
    }
  })

  test('rotates and stretches flames and smoke with on-map handles and the inspector', async ({ page }) => {
    await open(page)
    await page.keyboard.press('m')
    await page.locator('[data-marker="flames"]').click()
    await clickWorld(page, 800, 500)
    await page.keyboard.press('v')
    const flame = async () => (await board(page)).objects.find((object: Sim) => object.markerType === 'flames')
    const start = await flame()
    await clickWorld(page, 800, 500 - start.radius)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'marker')

    const handle = (name: string) => page.evaluate((anchor) => {
      const stage = (window as Sim).Konva.stages[0]
      const box = stage.findOne('Transformer').findOne(`.${anchor}`).getClientRect()
      const host = document.querySelector('[data-testid="scene-canvas"]')!.getBoundingClientRect()
      return { x: host.left + box.x + box.width / 2, y: host.top + box.y + box.height / 2 }
    }, name)
    const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      for (let step = 1; step <= 8; step += 1) await page.mouse.move(from.x + dx * step / 8, from.y + dy * step / 8)
      await page.mouse.up()
    }

    // Drag the top handle up: taller flames.
    await drag(await handle('top-center'), 0, -80)
    expect((await flame()).stretch).toBeGreaterThan(2)
    // Drag the round handle around: the flames turn.
    await drag(await handle('rotater'), 150, 120)
    expect((await flame()).rotation).toBeGreaterThan(45)
    // The corner handle resizes evenly (dragged away from the middle, whichever way the flames now face).
    const before = await flame()
    const corner = await handle('bottom-right')
    const middle = await page.evaluate(() => {
      const box = (window as Sim).Konva.stages[0].findOne('Transformer').getClientRect()
      const host = document.querySelector('[data-testid="scene-canvas"]')!.getBoundingClientRect()
      return { x: host.left + box.x + box.width / 2, y: host.top + box.y + box.height / 2 }
    })
    const away = Math.hypot(corner.x - middle.x, corner.y - middle.y)
    await drag(corner, (corner.x - middle.x) / away * 50, (corner.y - middle.y) / away * 50)
    expect((await flame()).radius).toBeGreaterThan(before.radius * 1.2)
    expect((await flame()).stretch).toBeCloseTo(before.stretch, 5)
    // The drawn flames follow.
    expect(await page.evaluate(() => (window as Sim).Konva.stages[0].findOne('.effect').rotation())).toBeCloseTo((await flame()).rotation, 5)

    // The inspector does the same with numbers.
    await page.getByTestId('effect-height').fill('150')
    await expect.poll(async () => (await flame()).stretch).toBeCloseTo(1.5, 5)
    const rotation = (await flame()).rotation
    await page.getByRole('button', { name: 'Rotate 15° right' }).click()
    await expect.poll(async () => (await flame()).rotation).toBeCloseTo((rotation + 15) % 360, 5)
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await flame()).rotation).toBeCloseTo(rotation, 5)
  })

  test('places, sizes, and moves flames and a smoke plume that everyone sees', async ({ page, browser }) => {
    const sceneId = await open(page)
    await page.keyboard.press('m')
    await page.locator('[data-marker="flames"]').click()
    await clickWorld(page, 700, 400)
    await page.locator('[data-marker="smoke"]').click()
    await clickWorld(page, 820, 380)
    await page.keyboard.press('Escape')
    const effects = (await board(page)).objects.filter((object: Sim) => object.type === 'marker' && ['flames', 'smoke'].includes(object.markerType))
    expect(effects.map((object: Sim) => object.markerType)).toEqual(['flames', 'smoke'])
    // Real-world sizes: 12 ft and 18 ft radius on the calibrated map.
    const feetPerUnit = (await board(page)).scenario.calibration.feetPerWorldUnit
    expect(effects[0].radius * feetPerUnit).toBeCloseTo(12, 5)
    expect(effects[1].radius * feetPerUnit).toBeCloseTo(18, 5)
    await expect.poll(() => page.evaluate(() => (window as Sim).__sim.rendered('effect'))).toBe(2)

    // Tap to select, drag to move, and set the size in feet.
    await page.keyboard.press('v')
    await dragWorld(page, [700, 400], [740, 440])
    const flame = (await board(page)).objects.find((object: Sim) => object.markerType === 'flames')
    expect(flame.x).toBeGreaterThan(720)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'marker')
    const size = page.getByTestId('inspector').getByLabel(/Size/)
    await size.fill('20')
    await expect.poll(async () => (await board(page)).objects.find((object: Sim) => object.markerType === 'flames').radius * feetPerUnit).toBeCloseTo(20, 1)

    // The classroom display shows them too.
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
    const tv = await context.newPage()
    try {
      await open(tv, sceneId, '?view=present')
      await expect.poll(() => tv.evaluate(() => (window as Sim).__sim.rendered('effect'))).toBe(2)
    } finally {
      await context.close()
    }
  })
})