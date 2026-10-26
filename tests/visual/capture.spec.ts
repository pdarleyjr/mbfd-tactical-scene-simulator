import { test, type Page } from '@playwright/test'

/**
 * Visual review captures (not assertions). Run with:
 *   pnpm exec playwright test tests/visual --config playwright.visual.config.ts
 * Images land in test-results/visual/.
 */

const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900, scale: 1 },
  { name: 'display-1080p', width: 1920, height: 1080, scale: 1 },
  { name: 'display-4k', width: 3840, height: 2160, scale: 1 },
  { name: 'tablet-landscape', width: 1194, height: 834, scale: 2 },
  { name: 'tablet-portrait', width: 834, height: 1194, scale: 2 },
  { name: 'phone', width: 390, height: 844, scale: 3 },
]

async function setup(page: Page) {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__sim))
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const sim = (window as any).__sim
    const objects = [...sim.board().objects]
    const add = (o: any) => objects.push({ rotation: 0, locked: false, assignment: '', ...o })
    add({ id: 'e1', type: 'apparatus', templateId: 'E1', label: 'E1', x: 1000, y: 610, rotation: 180, assignment: 'Fire attack' })
    add({ id: 'e2', type: 'apparatus', templateId: 'E2', label: 'E2', x: 760, y: 560, rotation: 160 })
    add({ id: 'l1', type: 'apparatus', templateId: 'L1', label: 'L1', x: 770, y: 450, rotation: 200, assignment: 'Ventilation' })
    objects.push({ id: 's1', type: 'hose', hoseType: 'supply5', purpose: 'supply', points: [0, 0, 1030, 690, 0, 0], from: { objectId: '2cbde021-f9b7-4507-b478-813a06010de5', portId: 'storz' }, to: { objectId: 'e1', portId: 'intake' }, evolution: 'forward-lay', layDirection: 'forward', loadFt: 500, label: '', locked: false })
    objects.push({ id: 'a1', type: 'hose', hoseType: 'attack175', purpose: 'attack', points: [0, 0, 860, 520, 700, 470, 560, 360], from: { objectId: 'e1', portId: 'discharge-1.5' }, evolution: 'jumpline', loadFt: 100, label: '', locked: false })
    add({ id: 'm1', type: 'marker', markerType: 'command-post', label: 'Waterfront IC', x: 880, y: 700 })
    add({ id: 'm2', type: 'marker', markerType: 'fire', label: '', x: 430, y: 330 })
    add({ id: 'm3', type: 'marker', markerType: 'collapse-zone', label: '', x: 520, y: 260, radius: 120 })
    add({ id: 'n1', type: 'note', text: 'Primary search: Side A door', x: 600, y: 420 })
    sim.store.getState().commit(objects, 'Visual setup')
    sim.store.getState().updateScenario((s: any) => ({ ...s, calibration: { feetPerWorldUnit: 0.42, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, distanceFt: 42, reference: 'test', calibratedAt: new Date().toISOString() }, conditions: { ...s.conditions, windFromDeg: 90, windNote: '12 mph' } }))
    sim.fit()
  })
  await page.waitForTimeout(500)
}

for (const viewport of viewports) {
  test(`capture ${viewport.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.scale, hasTouch: viewport.width < 1300 })
    const page = await context.newPage()
    await setup(page)
    const shot = (name: string) => page.screenshot({ path: `test-results/visual/${viewport.name}-${name}.png` })
    await shot('scene')
    await page.evaluate(() => (window as any).__sim.uiStore.getState().select(['a1']))
    await page.waitForTimeout(300)
    await shot('hose-selected')
    await page.evaluate(() => { const ui = (window as any).__sim.uiStore.getState(); ui.select([]); ui.setPanel('training') })
    await page.waitForTimeout(300)
    await shot('training')
    await page.evaluate(() => { const ui = (window as any).__sim.uiStore.getState(); ui.setPanel('supply') })
    await page.waitForTimeout(300)
    await shot('supply')
    await page.evaluate(() => { const ui = (window as any).__sim.uiStore.getState(); ui.setPanel('none'); ui.setTool('hose') })
    await page.waitForTimeout(300)
    await shot('hose-tool')
    await page.evaluate(() => { const ui = (window as any).__sim.uiStore.getState(); ui.setTool('select'); (window as any).__sim.store.getState().revealInject('occupant-report'); ui.showInjectBanner('occupant-report'); ui.setPresenting(true) })
    await page.waitForTimeout(500)
    await shot('present')
    await page.evaluate(() => { const ui = (window as any).__sim.uiStore.getState(); ui.setPresenting(false); ui.showInjectBanner(null); ui.openDialog('library') })
    await page.waitForTimeout(600)
    await shot('library')
    await page.evaluate(() => { const ui = (window as any).__sim.uiStore.getState(); ui.closeDialog(); ui.openDialog('settings') })
    await page.waitForTimeout(400)
    await shot('settings')
    await context.close()
  })
}
