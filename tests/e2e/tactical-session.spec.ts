import { expect, test, type APIRequestContext, type Browser } from '@playwright/test'

async function createSession(request: APIRequestContext, mode300: 'independent' | 'live' = 'independent') {
  const login = await request.post('/api/instructor/session', { data: { pin: '246810' } })
  const instructorToken = (await login.json()).token as string
  const scenarios = await request.get('/api/scenarios')
  const scenarioId = (await scenarios.json()).items[0].id as string
  const response = await request.post('/api/sessions', { headers: { authorization: `Bearer ${instructorToken}` }, data: { scenarioId, participatingUnits: ['E1','E2','E3','E4','L1','L3','300'], mode300 } })
  return { instructorToken, session: await response.json() as { id: string; code: string } }
}

async function join(browser: Browser, code: string, name: string, unit: string, command = false) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/join/${code}`)
  await page.getByLabel('Your name').fill(name)
  if (command) await page.getByRole('button', { name: 'Command 300' }).click()
  else await page.getByLabel('Unit').selectOption(unit)
  await page.getByRole('button', { name: 'Enter tactical scene' }).click()
  await expect(page.getByLabel('Interactive tactical scene map')).toBeVisible()
  return { context, page }
}

test('home and join surfaces are responsive and touch targets remain usable', async ({ page, request }) => {
  const { session } = await createSession(request)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Build the incident/ })).toBeVisible()
  await expect(page.getByText('An instructor creates this six-character room code when starting a training session. It is not a password.')).toBeVisible()
  await page.getByRole('button', { name: 'Instructor setup' }).click()
  await expect(page.getByText('Enter the instructor code, choose a scenario, then select Create room. The new room code appears in the instructor console.')).toBeVisible()
  await page.getByPlaceholder('ABC234').fill(session.code)
  await page.getByRole('button', { name: 'Continue to participant setup' }).click()
  await expect(page).toHaveURL(new RegExp(`/join/${session.code}$`))
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  const shortTargets = await page.locator('button:visible').evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().height < 44).length)
  expect(shortTargets).toBe(0)
})

test('two companies converge on one Operations document while Independent 300 remains isolated', async ({ browser, request }) => {
  const { session } = await createSession(request, 'independent')
  const first = await join(browser, session.code, 'Captain One', 'E1')
  const second = await join(browser, session.code, 'Captain Two', 'E2')
  const command = await join(browser, session.code, 'Command', '300', true)

  await first.page.getByRole('button', { name: 'E1', exact: true }).click()
  await first.page.getByLabel('Interactive tactical scene map').click({ position: { x: 650, y: 430 } })
  await expect(first.page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await expect(second.page.getByTestId('object-count')).toHaveText('1 tactical objects')
  await expect(command.page.getByTestId('object-count')).toHaveText('0 tactical objects')
  await expect(command.page.getByText(/Independent 300 plan is private/)).toBeVisible()

  await Promise.all([first.context.close(), second.context.close(), command.context.close()])
})
