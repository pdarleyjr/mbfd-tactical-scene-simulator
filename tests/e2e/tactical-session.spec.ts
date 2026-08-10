import { expect, test, type APIRequestContext, type Browser } from '@playwright/test'

async function createSession(request: APIRequestContext, mode300: 'independent' | 'live' = 'independent') {
  const login = await request.post('/api/instructor/session', { data: { pin: '2300' } })
  const instructorToken = (await login.json()).token as string
  const scenarios = await request.get('/api/scenarios')
  const scenario = (await scenarios.json()).items[0] as { id: string; benchmarks: Array<{ id: string }> }
  const roomResponse = await request.post('/api/rooms', { headers: { authorization: `Bearer ${instructorToken}` }, data: { name: `E2E Training Room ${Date.now()}` } })
  const room = await roomResponse.json() as { id: string; name: string }
  const response = await request.post('/api/sessions', { headers: { authorization: `Bearer ${instructorToken}` }, data: { roomId: room.id, scenarioId: scenario.id, participatingUnits: ['E1','E2','E3','E4','L1','L3','300'], mode300, benchmarkIds: scenario.benchmarks.map((item) => item.id) } })
  return { instructorToken, room, session: await response.json() as { id: string } }
}

async function startAndArrive(request: APIRequestContext, instructorToken: string, sessionId: string, units: string[]) {
  const headers = { authorization: `Bearer ${instructorToken}` }
  await request.patch(`/api/sessions/${sessionId}`, { headers, data: { status: 'running' } })
  for (const unit of units) await request.patch(`/api/sessions/${sessionId}/units/${unit}`, { headers, data: { status: 'arrived' } })
}

async function join(browser: Browser, roomId: string, name: string, unit: string, command = false) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/join/${roomId}`)
  await page.getByLabel('Your name').fill(name)
  if (command) await page.getByRole('button', { name: 'Command 300' }).click()
  else await page.getByLabel('Assigned unit').selectOption(unit)
  await page.getByRole('button', { name: 'Enter training room' }).click()
  await expect(page.getByLabel('Interactive tactical scene map')).toBeVisible()
  return { context, page }
}

test('home lists named rooms and touch targets remain usable', async ({ page, request }) => {
  const { room } = await createSession(request)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Build the incident/ })).toBeVisible()
  await expect(page.getByText('Select the named room your instructor opened. A PIN is requested only when that instructor chose to lock the room.')).toBeVisible()
  await page.getByRole('button', { name: 'Instructor setup' }).click()
  await expect(page.getByText(/Instructor PIN:/)).toContainText('2300')
  await page.getByLabel('Available training rooms').selectOption(room.id)
  await page.getByRole('button', { name: 'Continue to participant setup' }).click()
  await expect(page).toHaveURL(new RegExp(`/join/${room.id}$`))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  const shortTargets = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().height < 44).length)
  expect(shortTargets).toBe(0)
})

test('a newly created room loads its instructor console without a bootstrap cache', async ({ page, request }) => {
  const { instructorToken, room, session } = await createSession(request)
  await page.addInitScript(({ token }) => { sessionStorage.setItem('mbfd-firesim-instructor-token', token) }, { token: instructorToken })
  await page.goto(`/instructor/${session.id}`)
  await expect(page.getByText(`Instructor · ${room.name}`)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Session control' })).toBeVisible()
  await expect(page.getByText('connected', { exact: true })).toBeVisible()
})

test('instructor setup creates a named room and opens its console', async ({ page }) => {
  const roomName = `Touch Setup Room ${Date.now()}`
  await page.goto('/')
  await page.getByRole('button', { name: 'Instructor setup' }).click()
  await page.getByLabel('Instructor PIN').fill('2300')
  await page.getByRole('button', { name: 'Open instructor setup' }).click()
  await expect(page.getByRole('heading', { name: 'Edit scenario' })).toBeVisible()
  await page.getByLabel('New room name').fill(roomName)
  await page.getByRole('button', { name: 'Open instructor console' }).click()
  await expect(page.getByRole('heading', { name: 'Session control' })).toBeVisible()
  await expect(page.getByText(`Instructor · ${roomName}`)).toBeVisible()
})

test('participants remain staged until arrival, then can timestamp an evolution', async ({ page, request }) => {
  const { instructorToken, room, session } = await createSession(request, 'live')
  await request.patch(`/api/sessions/${session.id}`, { headers: { authorization: `Bearer ${instructorToken}` }, data: { status: 'running' } })
  await page.goto(`/join/${room.id}`)
  await page.getByLabel('Your name').fill('Staged Firefighter')
  await page.getByLabel('Assigned unit').selectOption('E1')
  await page.getByRole('button', { name: 'Enter training room' }).click()
  await expect(page.getByRole('heading', { name: 'Scenario will load once you make arrival' })).toBeVisible()
  await request.patch(`/api/sessions/${session.id}/units/E1`, { headers: { authorization: `Bearer ${instructorToken}` }, data: { status: 'arrived' } })
  await expect(page.getByLabel('Interactive tactical scene map')).toBeVisible()
  await page.getByRole('button', { name: /Jumpline/ }).click()
  await expect(page.getByText('Active evolution · E1')).toBeVisible()
  await page.getByRole('button', { name: '1¾ attack' }).click()
  const canvas = page.getByLabel('Interactive tactical scene map')
  await canvas.click({ position: { x: 350, y: 420 } })
  await canvas.click({ position: { x: 520, y: 470 } })
  await page.getByRole('button', { name: 'Finish hose' }).click()
  await expect(page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await page.getByRole('button', { name: 'Mark complete' }).click()
  await expect(page.getByText(/Jumpline complete/)).toBeVisible()
})

test('two companies converge on Operations while Independent 300 remains isolated', async ({ browser, request }) => {
  const { instructorToken, room, session } = await createSession(request, 'independent')
  await startAndArrive(request, instructorToken, session.id, ['E1', 'E2', '300'])
  const first = await join(browser, room.id, 'Captain One', 'E1')
  const second = await join(browser, room.id, 'Captain Two', 'E2')
  const command = await join(browser, room.id, 'Command', '300', true)
  await first.page.getByRole('button', { name: 'E1', exact: true }).click()
  await first.page.getByLabel('Interactive tactical scene map').click({ position: { x: 650, y: 430 } })
  await expect(first.page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await expect(first.page.getByText('E1 positioning')).toBeVisible()
  await first.page.getByRole('button', { name: '+1°' }).click()
  await expect(first.page.getByText('1°', { exact: true })).toBeVisible()
  await expect(second.page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await expect(command.page.getByTestId('object-count')).toHaveText('0 tactical objects')
  await expect(command.page.getByText(/Independent 300 plan is private/)).toBeVisible()
  await Promise.all([first.context.close(), second.context.close(), command.context.close()])
})
