import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sim = any

/**
 * Private versus shared simulations, driven through the real start screen with
 * several independent browser contexts (each one is a different person with
 * their own storage). Nothing here is shared unless a test shares it on purpose.
 */

async function person(browser: Browser, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport })
  return { context, page: await context.newPage() }
}

async function ready(page: Page) {
  await expect(page.locator('.app[data-ready][data-live="live"]')).toBeVisible()
  await page.waitForFunction(() => Boolean((window as Sim).__sim))
  await page.waitForTimeout(150)
}

async function startOwn(page: Page) {
  await page.goto('/')
  await page.getByTestId('start-own').click()
  await page.waitForURL(/\/s\/[a-z0-9]{12}$/)
  await ready(page)
  return new URL(page.url()).pathname.split('/').pop()!
}

async function startShared(page: Page) {
  await page.goto('/')
  await page.getByTestId('start-shared').click()
  await page.waitForURL(/\/s\/[a-z0-9]{12}$/)
  await ready(page)
  return new URL(page.url()).pathname.split('/').pop()!
}

async function joinByInvite(page: Page, invite: string) {
  await page.goto('/')
  await page.getByTestId('join-code').fill(invite)
  await page.getByTestId('join-shared').click()
  await page.waitForURL(/\/s\/[a-z0-9]+$/)
}

async function clickWorld(page: Page, x: number, y: number) {
  const point = await page.evaluate(([wx, wy]) => (window as Sim).__sim.toScreen(wx, wy), [x, y] as const)
  await page.mouse.click(point.x, point.y)
}

async function placeUnit(page: Page, unit: string, x: number, y: number) {
  await page.keyboard.press('a')
  await page.locator(`[data-unit="${unit}"]`).click()
  await clickWorld(page, x, y)
  await page.keyboard.press('Escape')
}

const units = (page: Page) => page.evaluate(() => (window as Sim).__sim.board().objects.filter((object: Sim) => object.type === 'apparatus').map((object: Sim) => object.templateId as string))
const peers = (page: Page) => page.getByTestId('live-status').getAttribute('data-peers')

async function closeAll(...contexts: BrowserContext[]) {
  for (const context of contexts) await context.close()
}

test.describe('Start screen', () => {
  test('a plain visit shows the choice and opens nobody’s scene', async ({ page }) => {
    const sockets: string[] = []
    // Only the simulation connection counts; Vite's own hot-reload socket is not one.
    page.on('websocket', (socket) => { if (new URL(socket.url()).pathname.startsWith('/sync/')) sockets.push(socket.url()) })
    await page.goto('/')
    await expect(page.getByTestId('entry-screen')).toBeVisible()
    await expect(page.getByTestId('start-own')).toHaveText(/Start My Own Simulation/)
    await expect(page.getByTestId('start-shared')).toHaveText(/Start a Shared Simulation/)
    await expect(page.getByTestId('join-code')).toBeVisible()
    await expect(page.locator('.app')).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(sockets).toEqual([])
    // A malformed scene address is not quietly treated as the main scene either.
    await page.goto('/s/NOT*A*SCENE')
    await expect(page.getByTestId('entry-screen')).toBeVisible()
    expect(sockets).toEqual([])
  })

  test('works on a phone: both choices are visible without scrolling sideways and are big enough to tap', async ({ browser }) => {
    const phone = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })
    const page = await phone.newPage()
    try {
      await page.goto('/')
      await expect(page.getByTestId('start-own')).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      for (const id of ['start-own', 'start-shared', 'join-shared']) {
        const box = await page.getByTestId(id).boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(42)
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(375)
      }
      await page.getByTestId('start-own').tap()
      await page.waitForURL(/\/s\/[a-z0-9]{12}$/)
      await ready(page)
    } finally {
      await closeAll(phone)
    }
  })

  test('bad invites are explained, and a code that matches nothing is refused without creating anything', async ({ browser }) => {
    const guest = await person(browser)
    try {
      await guest.page.goto('/')
      await guest.page.getByTestId('join-shared').click()
      await expect(guest.page.getByRole('alert')).toContainText('invite')
      await joinByInvite(guest.page, 'zzzzzzzzzzzz')
      await expect(guest.page.getByTestId('room-gate')).toHaveAttribute('data-code', 'not-found')
      await expect(guest.page.getByTestId('room-gate')).toContainText('not found')
      // The way forward is always one tap away.
      await guest.page.getByTestId('gate-back').click()
      await expect(guest.page.getByTestId('entry-screen')).toBeVisible()
    } finally {
      await closeAll(guest.context)
    }
  })
})

test.describe('Start My Own Simulation', () => {
  test('two people at the same time get separate simulations that never overwrite each other', async ({ browser }) => {
    const one = await person(browser)
    const two = await person(browser)
    try {
      const [idOne, idTwo] = await Promise.all([startOwn(one.page), startOwn(two.page)])
      expect(idOne).not.toBe(idTwo)
      await expect(one.page.getByTestId('live-status')).toHaveAttribute('data-kind', 'solo')
      await expect(one.page.locator('.topbar__eyebrow')).toContainText('My simulation')

      await placeUnit(one.page, 'E1', 900, 600)
      await placeUnit(two.page, 'L1', 1000, 640)
      await one.page.waitForTimeout(600)
      expect(await units(one.page)).toEqual(['E1'])
      expect(await units(two.page)).toEqual(['L1'])
      expect(await peers(one.page)).toBe('1')
      expect(await peers(two.page)).toBe('1')

      // Each person’s own work survives a reload, and the start screen offers it back.
      await one.page.reload()
      await ready(one.page)
      expect(await units(one.page)).toEqual(['E1'])
      await one.page.goto('/')
      await expect(one.page.getByTestId('continue-own')).toBeVisible()
      await one.page.getByTestId('continue-own').click()
      await ready(one.page)
      expect(new URL(one.page.url()).pathname).toBe(`/s/${idOne}`)
      expect(await units(one.page)).toEqual(['E1'])
    } finally {
      await closeAll(one.context, two.context)
    }
  })

  test('cannot be opened by someone who has only the address, but can be shown on a display', async ({ browser }) => {
    const owner = await person(browser)
    const intruder = await person(browser)
    const tv = await person(browser)
    try {
      const id = await startOwn(owner.page)
      await placeUnit(owner.page, 'E2', 850, 600)

      await intruder.page.goto(`/s/${id}`)
      await expect(intruder.page.getByTestId('room-gate')).toHaveAttribute('data-code', 'forbidden')
      await expect(intruder.page.getByTestId('room-gate')).toContainText('private')
      // Nothing of the owner’s scene reached the intruder.
      expect(await units(intruder.page)).toEqual([])

      await tv.page.goto(`/s/${id}?view=present`)
      await expect(tv.page.getByTestId('present-live')).toContainText('Live')
      await expect.poll(() => tv.page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(1)
      await placeUnit(owner.page, 'L3', 980, 640)
      await expect.poll(() => tv.page.evaluate(() => (window as Sim).__sim.rendered('apparatus'))).toBe(2)
      // Whatever the display does locally, the owner’s scene is unchanged.
      await tv.page.evaluate(() => (window as Sim).__sim.store.getState().commit([], 'tamper'))
      await tv.page.waitForTimeout(500)
      expect((await units(owner.page)).sort()).toEqual(['E2', 'L3'])
    } finally {
      await closeAll(owner.context, intruder.context, tv.context)
    }
  })

  test('can be shared later by its owner, and only then can a guest join', async ({ browser }) => {
    const owner = await person(browser)
    const guest = await person(browser)
    try {
      await startOwn(owner.page)
      const invite = owner.page.url()
      await owner.page.getByTestId('live-status').click()
      await owner.page.getByTestId('share-simulation').click()
      await expect(owner.page.getByTestId('live-status')).toHaveAttribute('data-kind', 'shared')
      await joinByInvite(guest.page, invite)
      await ready(guest.page)
      await expect(owner.page.getByTestId('live-status')).toHaveAttribute('data-peers', '2')
    } finally {
      await closeAll(owner.context, guest.context)
    }
  })
})

test.describe('Shared simulations', () => {
  test('two participants join one room by its invite, stay in step, and a third room stays apart', async ({ browser }) => {
    const host = await person(browser)
    const guest = await person(browser)
    const other = await person(browser)
    try {
      const roomId = await startShared(host.page)
      await expect(host.page.getByTestId('live-status')).toHaveAttribute('data-kind', 'shared')
      await joinByInvite(guest.page, host.page.url())
      await ready(guest.page)
      await expect(host.page.getByTestId('live-status')).toHaveAttribute('data-peers', '2')
      expect(new URL(guest.page.url()).pathname).toBe(`/s/${roomId}`)
      // A guest’s own invitation is a choice, so no warning about people already being here.
      await expect(guest.page.getByTestId('in-use-banner')).toHaveCount(0)

      await placeUnit(host.page, 'E1', 900, 600)
      await expect.poll(async () => (await units(guest.page)).includes('E1')).toBe(true)
      await placeUnit(guest.page, 'L1', 1000, 640)
      await expect.poll(async () => (await units(host.page)).includes('L1')).toBe(true)
      expect((await units(host.page)).sort()).toEqual((await units(guest.page)).sort())

      // A third, separate room: invisible to the first two and they to it.
      const otherId = await startShared(other.page)
      expect(otherId).not.toBe(roomId)
      await placeUnit(other.page, 'E3', 700, 500)
      await host.page.waitForTimeout(500)
      expect(await units(host.page)).not.toContain('E3')
      expect(await units(other.page)).toEqual(['E3'])
      expect(await peers(other.page)).toBe('1')
    } finally {
      await closeAll(host.context, guest.context, other.context)
    }
  })

  test('a participant who loses the connection rejoins the same room and catches up', async ({ browser }) => {
    const host = await person(browser)
    const guest = await person(browser)
    try {
      await startShared(host.page)
      await joinByInvite(guest.page, host.page.url())
      await ready(guest.page)
      await guest.page.evaluate(() => (window as Sim).__sim.dropConnection())
      await expect(guest.page.getByTestId('live-status')).not.toHaveAttribute('data-connection', 'live')
      // The host keeps working while the guest is away, and the guest works offline too.
      await placeUnit(host.page, 'E1', 900, 600)
      await placeUnit(guest.page, 'E4', 760, 560)
      await expect(guest.page.locator('.app[data-live="live"]')).toBeVisible({ timeout: 15_000 })
      await expect.poll(async () => (await units(guest.page)).sort(), { timeout: 10_000 }).toEqual(['E1', 'E4'])
      await expect.poll(async () => (await units(host.page)).sort(), { timeout: 10_000 }).toEqual(['E1', 'E4'])
      await expect(host.page.getByTestId('live-status')).toHaveAttribute('data-peers', '2')
    } finally {
      await closeAll(host.context, guest.context)
    }
  })

  test('the host can lock the room, and unlock it', async ({ browser }) => {
    const host = await person(browser)
    const guest = await person(browser)
    const late = await person(browser)
    try {
      await startShared(host.page)
      const invite = host.page.url()
      await joinByInvite(guest.page, invite)
      await ready(guest.page)
      // A guest has no host controls.
      await guest.page.getByTestId('live-status').click()
      await expect(guest.page.getByTestId('lock-simulation')).toHaveCount(0)
      await expect(guest.page.getByTestId('end-simulation')).toHaveCount(0)
      await guest.page.keyboard.press('Escape')

      await host.page.getByTestId('live-status').click()
      await host.page.getByTestId('lock-simulation').click()
      await expect(host.page.getByTestId('live-status')).toHaveAttribute('data-kind', 'shared')

      await joinByInvite(late.page, invite)
      await expect(late.page.getByTestId('room-gate')).toHaveAttribute('data-code', 'locked')
      // People already inside are not removed and still work together.
      await placeUnit(guest.page, 'E2', 850, 600)
      await expect.poll(async () => (await units(host.page)).includes('E2')).toBe(true)

      await host.page.getByTestId('live-status').click()
      await host.page.getByTestId('unlock-simulation').click()
      await late.page.goto(invite)
      await ready(late.page)
      await expect.poll(() => peers(host.page)).toBe('3')
    } finally {
      await closeAll(host.context, guest.context, late.context)
    }
  })

  test('the host ends it for everyone, and can reopen it with the work intact', async ({ browser }) => {
    const host = await person(browser)
    const guest = await person(browser)
    try {
      await startShared(host.page)
      const invite = host.page.url()
      await joinByInvite(guest.page, invite)
      await ready(guest.page)
      await placeUnit(host.page, 'E1', 900, 600)
      await expect.poll(async () => (await units(guest.page)).includes('E1')).toBe(true)

      await host.page.getByTestId('live-status').click()
      await host.page.getByTestId('end-simulation').click()
      await expect(host.page.getByTestId('end-simulation')).toContainText('Tap again')
      await host.page.getByTestId('end-simulation').click()

      await expect(guest.page.getByTestId('room-gate')).toHaveAttribute('data-code', 'ended')
      // A guest cannot bring it back; the host can.
      await expect(guest.page.getByTestId('gate-reopen')).toHaveCount(0)
      await expect(host.page.getByTestId('room-gate')).toHaveAttribute('data-code', 'ended')
      await host.page.getByTestId('gate-reopen').click()
      await ready(host.page)
      expect(await units(host.page)).toEqual(['E1'])
      await guest.page.goto(invite)
      await ready(guest.page)
      expect(await units(guest.page)).toEqual(['E1'])
    } finally {
      await closeAll(host.context, guest.context)
    }
  })

  test('the owner link carries host rights to another device, which can then end the session', async ({ browser }) => {
    const desktop = await person(browser)
    const phone = await person(browser, { width: 390, height: 844 })
    try {
      await startShared(desktop.page)
      const id = new URL(desktop.page.url()).pathname.split('/').pop()!
      const ownerLink = await desktop.page.evaluate(([roomId]) => {
        const room = (JSON.parse(localStorage.getItem('mbfd-hosted-rooms') ?? '[]') as Array<{ id: string; hostKey: string; kind: string }>).find((item) => item.id === roomId)!
        return `${location.origin}/s/${room.id}#host=${room.hostKey}&kind=${room.kind}`
      }, [id] as const)
      await phone.page.goto(ownerLink)
      await ready(phone.page)
      // The key is kept on the phone and removed from the address bar.
      expect(phone.page.url()).not.toContain('host=')
      await phone.page.getByTestId('live-status').click()
      await expect(phone.page.getByTestId('end-simulation')).toBeVisible()
    } finally {
      await closeAll(desktop.context, phone.context)
    }
  })
})
