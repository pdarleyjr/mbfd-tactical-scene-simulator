import { expect, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Sim = any

/**
 * Starts a simulation through the same API the start screen uses and makes
 * this browser its host, so each test works in a scene of its own.
 */
export async function newRoom(page: Page, kind: 'solo' | 'shared') {
  const response = await page.request.post('/sync-api/rooms', { data: { kind } })
  expect(response.status()).toBe(201)
  const room = await response.json() as { id: string; hostKey: string }
  await page.addInitScript(([id, hostKey, roomKind]) => {
    const list = JSON.parse(localStorage.getItem('mbfd-hosted-rooms') ?? '[]') as Array<{ id: string }>
    if (!list.some((item) => item.id === id)) localStorage.setItem('mbfd-hosted-rooms', JSON.stringify([{ id, kind: roomKind, hostKey, createdAt: Date.now() }, ...list]))
  }, [room.id, room.hostKey, kind] as const)
  return room.id
}

export async function ready(page: Page) {
  await expect(page.locator('.app[data-ready][data-live="live"]')).toBeVisible()
  await page.waitForFunction(() => Boolean((window as Sim).__sim))
  await page.waitForTimeout(150)
}

export async function open(page: Page, sceneId?: string, query = '', kind: 'solo' | 'shared' = 'solo') {
  sceneId ??= await newRoom(page, kind)
  await page.goto(`/s/${sceneId}${query}`)
  await ready(page)
  return sceneId
}

export const board = (page: Page) => page.evaluate(() => (window as Sim).__sim.board())
export const ui = (page: Page) => page.evaluate(() => { const state = (window as Sim).__sim.ui(); return { tool: state.tool, selection: state.selection, view: state.view } })
export const rendered = (page: Page, name: string) => page.evaluate((node) => (window as Sim).__sim.rendered(node), name)

export async function toScreen(page: Page, x: number, y: number) {
  return page.evaluate(([wx, wy]) => (window as Sim).__sim.toScreen(wx, wy), [x, y] as const)
}

export async function clickWorld(page: Page, x: number, y: number) {
  const point = await toScreen(page, x, y)
  await page.mouse.click(point.x, point.y)
}

export async function dragScreen(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, options: { button?: 'left' | 'middle' | 'right'; steps?: number } = {}) {
  const steps = options.steps ?? 8
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: options.button ?? 'left' })
  for (let step = 1; step <= steps; step += 1) await page.mouse.move(from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps)
  await page.mouse.up({ button: options.button ?? 'left' })
}

export async function dragWorld(page: Page, from: [number, number], to: [number, number]) {
  await dragScreen(page, await toScreen(page, ...from), await toScreen(page, ...to))
}

export async function placeUnit(page: Page, unit: string, x: number, y: number) {
  await page.keyboard.press('a')
  await page.locator(`[data-unit="${unit}"]`).click()
  await clickWorld(page, x, y)
  await page.keyboard.press('Escape')
}

export const unitOf = async (page: Page, templateId: string) => (await board(page)).objects.find((object: Sim) => object.type === 'apparatus' && object.templateId === templateId)
export const hoses = async (page: Page) => (await board(page)).objects.filter((object: Sim) => object.type === 'hose')
export const fires = async (page: Page) => (await board(page)).objects.filter((object: Sim) => object.type === 'marker' && (object.markerType === 'flames' || object.markerType === 'smoke'))
export const portAt = (page: Page, objectId: string, portId: string) => page.evaluate(([id, port]) => (window as Sim).__sim.portAt(id, port), [objectId, portId] as const)

/** A named canvas node's center in page pixels. */
export async function nodeCenter(page: Page, name: string) {
  return page.evaluate((nodeName) => {
    const node = (window as Sim).Konva.stages[0].findOne(`.${nodeName}`)
    if (!node) return null
    const box = node.getClientRect()
    const host = document.querySelector('[data-testid="scene-canvas"]')!.getBoundingClientRect()
    return { x: host.left + box.x + box.width / 2, y: host.top + box.y + box.height / 2 }
  }, name)
}

/** Where review screenshots go: UX_SCREENSHOT_DIR when set, else the test's own output folder. */
export function screenshotPath(fallbackDir: string, name: string) {
  const dir = process.env.UX_SCREENSHOT_DIR || fallbackDir
  return `${dir.replace(/[\\/]$/, '')}/${name}`
}
