import { expect, test, type APIRequestContext, type Browser } from '@playwright/test'

async function createSession(request: APIRequestContext, mode300: 'independent' | 'live' = 'independent') {
  const login = await request.post('/api/instructor/session', { data: { pin: '2300' } })
  const instructorToken = (await login.json()).token as string
  const scenarios = await request.get('/api/scenarios')
  const scenario = (await scenarios.json()).items[0] as { id: string; benchmarks: Array<{ id: string }> }
  const roomResponse = await request.post('/api/rooms', { headers: { authorization: `Bearer ${instructorToken}` }, data: { name: `E2E Training Room ${Date.now()}` } })
  const room = await roomResponse.json() as { id: string; name: string }
  const response = await request.post('/api/sessions', { headers: { authorization: `Bearer ${instructorToken}` }, data: { roomId: room.id, scenarioId: scenario.id, participatingUnits: ['E1','E2','E3','E4','L1','L3','300'], mode300, benchmarkIds: scenario.benchmarks.map((item) => item.id) } })
  return { instructorToken, room, scenario, session: await response.json() as { id: string } }
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

async function expectNoPageScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    bodyHorizontal: document.body.scrollWidth - document.body.clientWidth,
    bodyVertical: document.body.scrollHeight - document.body.clientHeight,
  }))
  expect(overflow, 'the browser document must remain a fixed, no-scroll workspace').toEqual({
    horizontal: 0,
    vertical: 0,
    bodyHorizontal: 0,
    bodyVertical: 0,
  })
}

test('home lists instructor-authored scenario titles and touch targets remain usable', async ({ page, request }) => {
  const { room, scenario } = await createSession(request)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Build the incident/ })).toBeVisible()
  await expect(page.getByText('Select the scenario title your instructor opened. A PIN appears only when that instructor chose to lock its room.')).toBeVisible()
  await page.getByRole('button', { name: 'Instructor setup' }).click()
  await expect(page.getByText(/Instructor PIN:/)).toContainText('2300')
  await expectNoPageScroll(page)
  await expect(page.getByLabel('Available scenarios').locator(`option[value="${room.id}"]`)).toContainText(scenario.title)
  await page.getByLabel('Available scenarios').selectOption(room.id)
  await page.getByRole('button', { name: 'Continue to participant setup' }).click()
  await expect(page).toHaveURL(new RegExp(`/join/${room.id}$`))
  await expectNoPageScroll(page)
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
  await page.getByRole('tab', { name: 'Room' }).click()
  await page.getByLabel('New room name').fill(roomName)
  await page.getByRole('button', { name: 'Open instructor console' }).click()
  await expect(page.getByRole('heading', { name: 'Session control' })).toBeVisible()
  await expect(page.getByText(`Instructor · ${roomName}`)).toBeVisible()
})

test('setup fits short laptop and phone windows without scrolling and keeps every editor reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Instructor setup' }).click()
  await page.getByLabel('Instructor PIN').fill('2300')
  await page.getByRole('button', { name: 'Open instructor setup' }).click()
  await expect(page.getByRole('heading', { name: 'Edit scenario' })).toBeVisible()
  await expectNoPageScroll(page)

  for (const tab of ['Details', 'Resources', 'Benchmarks', 'Injects', 'Map', 'Room']) {
    await page.getByRole('tab', { name: tab }).click()
    const panel = page.getByRole('tabpanel', { name: tab })
    await expect(panel).toBeVisible()
    await expectNoPageScroll(page)
    const panelOverflow = await panel.evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
    expect(panelOverflow.x, `${tab} must not require horizontal panel scrolling`).toBeLessThanOrEqual(1)
    expect(panelOverflow.y, `${tab} must not require vertical panel scrolling`).toBeLessThanOrEqual(1)
  }

  await page.getByRole('tab', { name: 'Map' }).click()
  await expect(page.getByLabel('Interactive tactical scene map')).toBeVisible()
  const initialZoom = await page.getByTestId('map-zoom-level').textContent()
  await page.getByRole('button', { name: 'Zoom map in' }).click()
  await expect(page.getByTestId('map-zoom-level')).not.toHaveText(initialZoom ?? '')

  await page.setViewportSize({ width: 390, height: 844 })
  for (const tab of ['Details', 'Resources', 'Benchmarks', 'Injects', 'Map', 'Room']) {
    await page.getByRole('tab', { name: tab }).click()
    const panel = page.getByRole('tabpanel', { name: tab })
    await expect(panel).toBeVisible()
    await expectNoPageScroll(page)
    const panelOverflow = await panel.evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
    expect(panelOverflow.x, `${tab} phone panel must not require horizontal scrolling`).toBeLessThanOrEqual(1)
    expect(panelOverflow.y, `${tab} phone panel must not require vertical scrolling`).toBeLessThanOrEqual(1)
  }
})

test('instructor can create, rename, duplicate, and remove scenarios from the titled library', async ({ page }) => {
  const title = `E2E Scenario ${Date.now()}`
  const renamed = `${title} Renamed`
  await page.goto('/')
  await page.getByRole('button', { name: 'Instructor setup' }).click()
  await page.getByLabel('Instructor PIN').fill('2300')
  await page.getByRole('button', { name: 'Open instructor setup' }).click()
  await page.getByRole('button', { name: 'Create new scenario' }).click()
  await page.getByRole('tab', { name: 'Benchmarks' }).click()
  await expect(page.getByLabel('Benchmark 1 label')).toHaveValue('Command established')
  await page.getByRole('navigation', { name: 'Benchmark pages' }).getByRole('button', { name: 'Next' }).click()
  await expect(page.getByLabel('Benchmark 5 label')).toHaveValue('Primary search complete')
  await page.getByRole('tab', { name: 'Details' }).click()
  await page.getByLabel('Scenario title').fill(title)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('Scenario library')).toContainText(title)
  await page.getByLabel('Scenario title').fill(renamed)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('Scenario library')).toContainText(renamed)
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.getByLabel('Scenario title')).toHaveValue(`${renamed} Copy`)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByLabel('Scenario library')).not.toContainText(`${renamed} Copy`)
})

test('instructor timer controls and presentation link work without clipboard permission', async ({ page, request, context }) => {
  const { instructorToken, session } = await createSession(request)
  await context.grantPermissions([])
  await page.addInitScript(({ token }) => { sessionStorage.setItem('mbfd-firesim-instructor-token', token) }, { token: instructorToken })
  await page.goto(`/instructor/${session.id}`)
  await expectNoPageScroll(page)
  await expect(page.getByRole('tab', { name: 'Session' })).toBeVisible()
  await expect(page.getByTestId('scenario-timer')).toHaveText('00:00')
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByRole('button', { name: 'Freeze' })).toBeEnabled()
  await expect(page.getByTestId('scenario-timer')).not.toHaveText('00:00', { timeout: 4000 })
  await page.getByRole('button', { name: 'Freeze' }).click()
  const frozen = await page.getByTestId('scenario-timer').textContent()
  await page.waitForTimeout(1200)
  await expect(page.getByTestId('scenario-timer')).toHaveText(frozen ?? '')
  await page.getByRole('button', { name: 'Resume' }).click()
  await page.getByRole('tab', { name: 'Display' }).click()
  await page.getByLabel('Display view').selectOption('split')
  await expect(page.getByLabel('Display view')).toHaveValue('split')
  await page.getByRole('button', { name: 'Generate display link' }).click()
  await expect(page.getByLabel('Presentation link')).toHaveValue(new RegExp(`/present/${session.id}#token=`))
  await expect(page.getByRole('link', { name: 'Open display' })).toHaveAttribute('href', new RegExp(`/present/${session.id}#token=`))
  await page.setViewportSize({ width: 390, height: 844 })
  for (const tab of ['Session', 'Units', 'Benchmarks', 'Display', 'More']) {
    await page.getByRole('tab', { name: tab }).click()
    const panel = page.getByRole('tabpanel', { name: tab })
    await expect(panel).toBeVisible()
    await expectNoPageScroll(page)
    const panelOverflow = await panel.evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
    expect(panelOverflow.x, `${tab} instructor controls must fit the phone width`).toBeLessThanOrEqual(1)
    expect(panelOverflow.y, `${tab} instructor controls must fit the phone height`).toBeLessThanOrEqual(1)
  }
})

test('presentation keeps the live map and benchmark/task table visible without page scrolling', async ({ page, request }) => {
  const { instructorToken, room, scenario, session } = await createSession(request, 'live')
  await startAndArrive(request, instructorToken, session.id, ['E1'])
  const participant = await request.post('/api/sessions/join', {
    data: { sessionId: session.id, name: 'Live Table Firefighter', role: 'crew', unit: 'E1', clientId: `display-e2e-${Date.now()}` },
  })
  expect(participant.ok()).toBeTruthy()
  const participantToken = (await participant.json()).token as string
  const display = await request.post(`/api/sessions/${session.id}/presentation-token`, {
    headers: { authorization: `Bearer ${instructorToken}` },
  })
  const displayToken = (await display.json()).token as string

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`/present/${session.id}#token=${encodeURIComponent(displayToken)}`)
  await expect(page.getByLabel('Interactive tactical scene map')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Live activity' })).toBeVisible()
  const started = await request.post(`/api/sessions/${session.id}/evolutions`, {
    headers: { authorization: `Bearer ${participantToken}` },
    data: { evolutionId: 'jumpline' },
  })
  expect(started.ok()).toBeTruthy()
  const benchmarkId = scenario.benchmarks[0]!.id
  await request.patch(`/api/sessions/${session.id}/benchmarks/${benchmarkId}`, {
    headers: { authorization: `Bearer ${instructorToken}` },
    data: { completed: true },
  })
  await expect(page.getByRole('table', { name: 'Live benchmark and task activity' })).toContainText('Jumpline')
  await expect(page.getByRole('table', { name: 'Live benchmark and task activity' })).toContainText('Command established')
  await expect(page.getByText(room.name)).toBeVisible()
  await expectNoPageScroll(page)

  const initialZoom = await page.getByTestId('map-zoom-level').textContent()
  await page.getByRole('button', { name: 'Zoom map in' }).click()
  await expect(page.getByTestId('map-zoom-level')).not.toHaveText(initialZoom ?? '')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('heading', { name: 'Live activity' })).toBeVisible()
  await expectNoPageScroll(page)
  const activityOverflow = await page.locator('.live-activity').evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
  expect(activityOverflow.x).toBeLessThanOrEqual(1)
  expect(activityOverflow.y).toBeLessThanOrEqual(1)
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
  await expectNoPageScroll(page)
  const railOverflow = await page.locator('.incident-rail').evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
  expect(railOverflow.x).toBeLessThanOrEqual(1)
  expect(railOverflow.y).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: /Jumpline/ }).click()
  await expect(page.getByRole('button', { name: 'Hydrant' })).toHaveCount(0)
  await expect(page.getByText('Active evolution · E1')).toBeVisible()
  await page.getByRole('button', { name: '1¾ attack' }).click()
  const canvas = page.getByLabel('Interactive tactical scene map')
  await canvas.click({ position: { x: 350, y: 420 } })
  await expect(page.getByTestId('hose-point-count')).toContainText('Start placed')
  await canvas.click({ position: { x: 430, y: 450 } })
  await canvas.click({ position: { x: 520, y: 470 } })
  await expect(page.getByTestId('hose-point-count')).toContainText('3 points connected')
  await page.getByRole('button', { name: 'Finish line' }).click()
  await expect(page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await page.getByRole('button', { name: 'Mark complete' }).click()
  await expect(page.getByText(/Jumpline complete/)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoPageScroll(page)
  for (const selector of ['.incident-rail', '.context-bar']) {
    const overflow = await page.locator(selector).evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
    expect(overflow.x, `${selector} must fit a phone without scrolling`).toBeLessThanOrEqual(1)
    expect(overflow.y, `${selector} must fit a phone without scrolling`).toBeLessThanOrEqual(1)
  }
})

test('after-action review uses pagination instead of document or panel scrolling', async ({ page, request }) => {
  const { instructorToken, session } = await createSession(request)
  await page.addInitScript(({ token }) => { sessionStorage.setItem('mbfd-firesim-instructor-token', token) }, { token: instructorToken })
  await page.setViewportSize({ width: 1024, height: 640 })
  await page.goto(`/review/${session.id}`)
  await expect(page.getByRole('heading', { name: 'Playback state' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()
  await expectNoPageScroll(page)
  const overflow = await page.locator('.timeline-panel').evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }))
  expect(overflow.x).toBeLessThanOrEqual(1)
  expect(overflow.y).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoPageScroll(page)
})

test('two companies converge on Operations while Independent 300 remains isolated', async ({ browser, request }) => {
  const { instructorToken, room, session } = await createSession(request, 'independent')
  await startAndArrive(request, instructorToken, session.id, ['E1', 'E2', '300'])
  const first = await join(browser, room.id, 'Captain One', 'E1')
  const second = await join(browser, room.id, 'Captain Two', 'E2')
  const command = await join(browser, room.id, 'Command', '300', true)
  const apparatus = first.page.getByRole('button', { name: 'E1', exact: true })
  const canvas = first.page.getByLabel('Interactive tactical scene map')
  await expect(apparatus).toBeEnabled()
  const from = await apparatus.boundingBox()
  const to = await canvas.boundingBox()
  expect(from).not.toBeNull()
  expect(to).not.toBeNull()
  await first.page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
  await first.page.mouse.down()
  await first.page.mouse.move(to!.x + to!.width * .55, to!.y + to!.height * .55, { steps: 8 })
  await expect(first.page.getByText('Drop E1 on map')).toBeVisible()
  await first.page.mouse.up()
  await expect(first.page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await expect(first.page.getByText('E1 positioning')).toBeVisible()
  await first.page.getByRole('button', { name: '+1°' }).click()
  await expect(first.page.getByText('1°', { exact: true })).toBeVisible()
  await expect(second.page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await expect(command.page.getByTestId('object-count')).toHaveText('0 tactical objects')
  await expect(command.page.getByText(/Independent 300 plan is private/)).toBeVisible()
  await Promise.all([first.context.close(), second.context.close(), command.context.close()])
})
