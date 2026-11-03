import { expect, test, type Page } from '@playwright/test'
import { board, clickWorld, dragScreen, dragWorld, fires, hoses, nodeCenter, open, placeUnit, portAt, rendered, screenshotPath, toScreen, ui, unitOf, type Sim } from './helpers'

function expectPoints(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, index) => expect(actual[index]).toBeCloseTo(value, 3))
}

const anchor = (page: Page, name: string) => page.evaluate((anchorName) => (window as Sim).__sim.anchor(anchorName), name)

test.describe('Placing apparatus', () => {
  test('a wobbly tap selects without moving, a middle-drag pans without moving, and the rotate handle turns freely', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E1', 900, 600)
    const placed = await unitOf(page, 'E1')

    // A press that wobbles 3 px is a tap: it selects the unit and never nudges it.
    const center = await toScreen(page, placed.x, placed.y)
    await dragScreen(page, center, { x: center.x + 3, y: center.y + 2 }, { steps: 3 })
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'apparatus')
    expect((await unitOf(page, 'E1')).x).toBe(placed.x)
    expect((await unitOf(page, 'E1')).y).toBe(placed.y)

    // Middle-drag on the truck pans the map; the truck stays where it is on the map.
    const before = (await ui(page)).view
    await dragScreen(page, center, { x: center.x + 90, y: center.y + 40 }, { button: 'middle' })
    const after = (await ui(page)).view
    expect(after.x - before.x).toBeCloseTo(90, 0)
    expect((await unitOf(page, 'E1')).x).toBe(placed.x)

    // The rotate handle is a big, easy target, and it turns the unit to any angle (only snapping right next to 15° steps).
    const rotater = await anchor(page, 'rotater')
    expect(rotater).not.toBeNull()
    expect(rotater!.width).toBeGreaterThanOrEqual(26)
    const middle = await toScreen(page, placed.x, placed.y)
    const reach = Math.hypot(rotater!.x - middle.x, rotater!.y - middle.y)
    const angle = 40 * Math.PI / 180
    await dragScreen(page, rotater!, { x: middle.x + Math.sin(angle) * reach, y: middle.y - Math.cos(angle) * reach }, { steps: 12 })
    const turned = await unitOf(page, 'E1')
    expect(Math.abs(turned.rotation - 40)).toBeLessThan(1.5)
    expect(turned.x).toBeCloseTo(placed.x, 6)

    // Fine adjustment from the keyboard.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+]')
    const nudged = await unitOf(page, 'E1')
    expect(nudged.x).toBeCloseTo(placed.x + 1, 6)
    expect(Math.abs(nudged.rotation - (turned.rotation + 1))).toBeLessThan(1e-6)
  })

  test('a selected unit is unmistakable and drags smoothly without jumping', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'L1', 820, 560)
    const placed = await unitOf(page, 'L1')
    await clickWorld(page, placed.x, placed.y)
    await expect.poll(() => rendered(page, 'selection-frame')).toBe(1)
    // A slow drag in small steps follows the pointer exactly.
    const start = await toScreen(page, placed.x, placed.y)
    const scale = (await ui(page)).view.scale
    await dragScreen(page, start, { x: start.x + 50, y: start.y + 30 }, { steps: 25 })
    const moved = await unitOf(page, 'L1')
    expect((moved.x - placed.x) * scale).toBeCloseTo(50, 0)
    expect((moved.y - placed.y) * scale).toBeCloseTo(30, 0)
  })
})

test.describe('Supply and attack lines', () => {
  test('shows every coupling a line can connect to, and a line end dropped anywhere on the truck connects to its intake', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E1', 980, 600)
    const engine = await unitOf(page, 'E1')
    const hydrant = (await board(page)).objects.find((object: Sim) => object.type === 'hydrant')
    await page.keyboard.press('h')
    await page.locator('[data-hose="supply5"]').click()
    // Free 5″ couplings light up before the first tap: the hydrant and the engine intake.
    await expect.poll(() => rendered(page, 'connect-target')).toBeGreaterThanOrEqual(2)
    await clickWorld(page, hydrant.x, hydrant.y)
    await clickWorld(page, 820, 780)
    await page.getByTestId('finish-line').click()
    let [line] = await hoses(page)
    expect(line.from).toEqual({ objectId: hydrant.id, portId: 'storz' })
    expect(line.to).toBeUndefined()

    // Select it and drag its open end onto the middle of the engine (not the intake itself).
    await page.keyboard.press('v')
    await clickWorld(page, (hydrant.x + 820) / 2, (hydrant.y + 780) / 2)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'hose')
    await dragWorld(page, [820, 780], [engine.x + 2, engine.y + 6])
    ;[line] = await hoses(page)
    expect(line.to).toEqual({ objectId: engine.id, portId: 'intake' })
    const intake = await portAt(page, engine.id, 'intake')
    expect(line.points.at(-2)).toBeCloseTo(intake.x, 3)
    expect(line.points.at(-1)).toBeCloseTo(intake.y, 3)
    // Hose mode and line editing never move the truck.
    expect((await unitOf(page, 'E1')).x).toBe(engine.x)
  })

  test('adds a bend with a tap on +, removes it with a tap on the bend, and from the inspector', async ({ page }) => {
    await open(page)
    await page.keyboard.press('h')
    await page.locator('[data-hose="attack175"]').click()
    await clickWorld(page, 700, 500)
    await clickWorld(page, 1000, 500)
    await page.getByTestId('finish-line').click()
    await page.keyboard.press('v')
    await clickWorld(page, 760, 500)
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'hose')

    // Tap the + in the middle of the line: a bend appears there.
    await clickWorld(page, 850, 500)
    let [line] = await hoses(page)
    expectPoints(line.points, [700, 500, 850, 500, 1000, 500])

    // Drag the bend out, then tap it: its Remove button takes it away.
    await dragWorld(page, [850, 500], [850, 430])
    ;[line] = await hoses(page)
    expect(line.points[3]).toBeLessThan(450)
    // Past the double-tap window, so this is a plain tap on the bend.
    await page.waitForTimeout(500)
    await clickWorld(page, line.points[2], line.points[3])
    await expect.poll(() => nodeCenter(page, 'remove-bend')).not.toBeNull()
    const remove = await nodeCenter(page, 'remove-bend')
    await page.mouse.click(remove!.x, remove!.y)
    await expect.poll(async () => (await hoses(page))[0].points.length).toBe(4)
    ;[line] = await hoses(page)
    expectPoints(line.points, [700, 500, 1000, 500])

    // The inspector does the same without aiming.
    await page.getByTestId('add-bend').click()
    expect((await hoses(page))[0].points).toHaveLength(6)
    await page.getByTestId('remove-bend-button').click()
    expect((await hoses(page))[0].points).toHaveLength(4)
    await page.keyboard.press('Delete')
    expect(await hoses(page)).toHaveLength(0)
  })

  test('an attack line routed past a building entry point goes through the door', async ({ page }) => {
    await open(page)
    await placeUnit(page, 'E2', 900, 600)
    const engine = await unitOf(page, 'E2')
    await page.keyboard.press('m')
    await page.locator('[data-marker="entry"]').click()
    await clickWorld(page, 760, 470)
    await page.keyboard.press('h')
    await page.locator('[data-evolution="jumpline"]').click()
    await clickWorld(page, engine.x, engine.y)
    // A tap a little off the marker lands on it.
    await clickWorld(page, 767, 476)
    await clickWorld(page, 700, 430)
    await page.getByTestId('finish-line').click()
    const [attack] = await hoses(page)
    const door = (await board(page)).objects.find((object: Sim) => object.type === 'marker' && object.markerType === 'entry')
    expect(attack.from.objectId).toBe(engine.id)
    // Exactly on the marker, not where the tap landed.
    expect(attack.points.slice(2, 4)).toEqual([door.x, door.y])
  })
})

const sizes = [
  { name: '1366x768', width: 1366, height: 768, minFontPx: 15 },
  { name: '3840x2160', width: 3840, height: 2160, minFontPx: 24 },
]

/** A busy scene: a supply line and three attack lines running side by side, plus fire on three buildings. */
async function busyScene(page: Page) {
  await page.evaluate(() => {
    const sim = (window as Sim).__sim
    const hydrant = sim.board().objects.find((object: Sim) => object.type === 'hydrant')
    const objects = [...sim.board().objects]
    objects.push({ id: 'e1', type: 'apparatus', templateId: 'E1', label: 'E1', assignment: 'Fire attack', x: 990, y: 600, rotation: 180, locked: false })
    objects.push({ id: 'l1', type: 'apparatus', templateId: 'L1', label: 'L1', assignment: '', x: 760, y: 470, rotation: 200, locked: false })
    objects.push({ id: 's1', type: 'hose', hoseType: 'supply5', purpose: 'supply', points: [0, 0, 1030, 690, 0, 0], from: { objectId: hydrant.id, portId: 'storz' }, to: { objectId: 'e1', portId: 'intake' }, evolution: 'forward-lay', layDirection: 'forward', loadFt: 800, label: '', locked: false })
    objects.push({ id: 'a1', type: 'hose', hoseType: 'attack175', purpose: 'attack', points: [0, 0, 860, 520, 700, 470, 560, 360], from: { objectId: 'e1', portId: 'discharge-1.5' }, evolution: 'jumpline', loadFt: 200, label: '', locked: false })
    objects.push({ id: 'a2', type: 'hose', hoseType: 'attack175', purpose: 'attack', points: [0, 0, 870, 540, 710, 490, 570, 380], from: { objectId: 'e1', portId: 'discharge-1.5b' }, evolution: 'jumpline', loadFt: 200, label: '', locked: false })
    objects.push({ id: 'f3', type: 'hose', hoseType: 'hose3', purpose: 'feeder', points: [880, 560, 720, 510, 580, 400], evolution: 'skid-load', loadFt: 800, label: '', locked: false })
    sim.store.getState().commit(objects, 'Busy scene')
  })
}

for (const size of sizes) {
  test(`hose distances are readable and never overlap at ${size.name}, with fire on several buildings`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Sized explicitly; one browser project is enough.')
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } })
    const page = await context.newPage()
    try {
      await open(page)
      await busyScene(page)
      await page.keyboard.press('b')
      // Clear of the Fire tray on the left.
      for (const [x, y] of [[430, 320], [560, 250], [640, 340]] as const) await clickWorld(page, x, y)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.evaluate(() => (window as Sim).__sim.fit())
      await expect.poll(() => rendered(page, 'hose-length-label')).toBe(4)
      await expect.poll(() => rendered(page, 'effect')).toBe(3)
      await page.waitForTimeout(400)

      const labels = await page.evaluate(() => (window as Sim).__sim.hoseLabels()) as Array<{ id: string; text: string; fontPx: number; x: number; y: number; width: number; height: number }>
      expect(labels).toHaveLength(4)
      for (const label of labels) expect(label.fontPx, `${label.text} font size`).toBeGreaterThanOrEqual(size.minFontPx)
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const a = labels[i]!
          const b = labels[j]!
          const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
          expect(overlap, `${a.text} overlaps ${b.text}`).toBe(false)
        }
      }
      expect(labels.find((label) => label.id === 's1')!.text).toMatch(/^5″ supply · \d+ ft · \d+ × 100′$/)
      expect(labels.find((label) => label.id === 'a1')!.text).toMatch(/^1¾″ attack · /)
      await page.screenshot({ path: screenshotPath(testInfo.outputDir, `labels-and-fire-${size.name}.png`) })

      // Labels keep their screen size at any zoom.
      await page.evaluate(() => (window as Sim).__sim.uiStore.getState().setView((view: Sim) => ({ ...view, scale: view.scale * 2 })))
      await page.waitForTimeout(200)
      const zoomed = await page.evaluate(() => (window as Sim).__sim.hoseLabels()) as Array<{ fontPx: number }>
      expect(Math.abs(zoomed[0]!.fontPx - labels[0]!.fontPx)).toBeLessThan(0.5)
    } finally {
      await context.close()
    }
  })
}

test.describe('Add fire to any building', () => {
  test('taps add as many fires as wanted; each moves, resizes, and is removed on its own', async ({ page }) => {
    await open(page)
    await page.keyboard.press('b')
    await expect(page.getByTestId('fire-tray')).toBeVisible()
    // Spots clear of the tray on the left and the inspector on the right, at desktop and tablet sizes.
    await clickWorld(page, 620, 260)
    await clickWorld(page, 760, 330)
    await clickWorld(page, 900, 250)
    let placed = await fires(page)
    expect(placed.map((fire: Sim) => fire.markerType)).toEqual(['flames', 'flames', 'flames'])
    const feetPerUnit = (await board(page)).scenario.calibration.feetPerWorldUnit
    expect(placed[0].radius * feetPerUnit).toBeCloseTo(12, 5)
    await expect(page.getByTestId('fire-count')).toContainText('3 fires')
    // The newest fire is selected and ready to adjust, without leaving the Fire tool.
    expect((await ui(page)).selection).toEqual([placed[2].id])
    expect((await ui(page)).tool).toBe('fire')
    await expect(page.getByTestId('inspector')).toHaveAttribute('data-type', 'marker')

    // Drag the middle fire: it moves, and no new fire is added.
    const middle = placed[1]
    await dragWorld(page, [middle.x, middle.y - middle.radius * 0.6], [middle.x + 40, middle.y + 30 - middle.radius * 0.6])
    placed = await fires(page)
    expect(placed).toHaveLength(3)
    expect(placed[1].x).toBeCloseTo(middle.x + 40, 0)
    expect((await ui(page)).selection).toEqual([middle.id])

    // Size it from the inspector.
    await page.getByTestId('inspector').getByRole('radio', { name: 'Large' }).click()
    await expect.poll(async () => (await fires(page))[1].radius * feetPerUnit).toBeCloseTo(20, 5)

    // Small smoke and flames together in one tap.
    await page.getByTestId('fire-tray').getByRole('radio', { name: 'Both' }).click()
    await page.getByTestId('fire-tray').getByRole('radio', { name: 'Small' }).click()
    await clickWorld(page, 960, 420)
    placed = await fires(page)
    expect(placed.slice(3).map((fire: Sim) => fire.markerType)).toEqual(['smoke', 'flames'])
    expect(placed[4].radius * feetPerUnit).toBeCloseTo(7, 5)
    expect((await ui(page)).selection).toHaveLength(2)

    // Delete removes just the selected fire and its smoke.
    await page.keyboard.press('Delete')
    expect(await fires(page)).toHaveLength(3)
    // Turn a flame from the keyboard.
    await clickWorld(page, placed[0].x, placed[0].y - placed[0].radius * 0.6)
    expect((await ui(page)).selection).toEqual([placed[0].id])
    await page.keyboard.press(']')
    expect((await fires(page))[0].rotation).toBe(15)
    // Remove all, and Undo brings them back.
    await page.getByTestId('remove-all-fire').click()
    expect(await fires(page)).toHaveLength(0)
    await page.keyboard.press('Control+z')
    expect(await fires(page)).toHaveLength(3)
  })

  test('saves fire layouts and switches between them for everyone, including the classroom display', async ({ page, browser }, testInfo) => {
    const sceneId = await open(page, undefined, '', 'shared')
    await placeUnit(page, 'E1', 980, 600)
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
    const tv = await context.newPage()
    try {
      await open(tv, sceneId, '?view=present')
      await page.keyboard.press('b')
      await clickWorld(page, 600, 300)
      await clickWorld(page, 700, 260)
      await page.getByTestId('layout-name').fill('Kitchen fire')
      await page.getByTestId('save-layout').click()
      await expect(page.getByTestId('fire-layouts')).toContainText('Showing')

      await page.getByTestId('remove-all-fire').click()
      await page.getByTestId('fire-tray').getByRole('radio', { name: 'Both' }).click()
      await clickWorld(page, 1200, 250)
      await page.getByTestId('save-layout').click()
      const layouts = (await board(page)).scenario.fireLayouts
      expect(layouts.map((layout: Sim) => layout.name)).toEqual(['Kitchen fire', 'Fire layout 2'])
      await expect.poll(() => tv.evaluate(() => (window as Sim).__sim.rendered('effect'))).toBe(2)

      // Show the kitchen fire: the fire swaps, the engine stays put, and the TV follows.
      const engine = await unitOf(page, 'E1')
      await page.getByTestId(`show-layout-${layouts[0].id}`).click()
      const shown = await fires(page)
      expect(shown.map((fire: Sim) => [fire.markerType, Math.round(fire.x)])).toEqual([['flames', 600], ['flames', 700]])
      expect((await unitOf(page, 'E1')).x).toBe(engine.x)
      await expect.poll(async () => (await fires(tv)).map((fire: Sim) => Math.round(fire.x))).toEqual([600, 700])
      await expect.poll(async () => (await board(tv)).scenario.fireLayouts?.length).toBe(2)
      await tv.screenshot({ path: screenshotPath(testInfo.outputDir, 'present-view-fire-layout.png') })

      // Layouts belong to the scenario: switching everyone away and back keeps them.
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.getByTestId('scene-title').click()
      await page.getByTestId('switch-to-oceanfront-condo').click()
      await expect.poll(async () => (await board(page)).templateId).toBe('oceanfront-condo')
      expect((await board(page)).scenario.fireLayouts ?? []).toEqual([])
      await page.waitForTimeout(2100)
      await page.getByTestId('scene-title').click()
      await page.getByTestId('switch-to-waterfront-estate').click()
      await expect.poll(async () => (await board(page)).templateId).toBe('waterfront-estate')
      await expect.poll(async () => (await board(page)).scenario.fireLayouts?.map((layout: Sim) => layout.name)).toEqual(['Kitchen fire', 'Fire layout 2'])
      expect(await fires(page)).toHaveLength(2)
    } finally {
      await context.close()
    }
  })
})
