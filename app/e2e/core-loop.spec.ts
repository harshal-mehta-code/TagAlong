import { expect, test, type Page } from '@playwright/test'

/**
 * The whole product in one test: onboard → start a tag (record lead) →
 * tag-along the other three parts → performance auto-completes → plays back.
 * Chromium's fake media device supplies camera+mic.
 */

async function recordCurrentPart(page: Page) {
  // record screen: wait for camera, start, sing ~2.5s of "audio", stop
  await page.getByTestId('record-button').click({ timeout: 15_000 })
  // count-in (~2.6s) then REC state appears
  await expect(page.getByTestId('stop-button')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(6_000) // count-in + ~3s singing
  await page.getByTestId('stop-button').click()
  // sync check
  await expect(page.getByTestId('save-take')).toBeVisible({ timeout: 15_000 })
}

test('core loop: start, tag along ×3, performance completes and plays', async ({ page }) => {
  await page.goto('/')

  // --- onboarding
  await page.getByTestId('onboard-name').fill('Harshal')
  await page.getByTestId('part-bari').click()
  await page.getByTestId('onboard-go').click()

  // --- empty feed invites starting a tag
  await expect(page.getByTestId('empty-start')).toBeVisible()
  await page.getByTestId('empty-start').click()

  // --- start flow: setup
  await page.getByTestId('tag-title').fill('Lost Chord')
  await page.getByTestId('part-lead').click()
  await page.getByTestId('key-B♭').click()
  await page.getByTestId('pitch-pipe').click() // must not throw
  await page.getByTestId('to-record').click()

  await recordCurrentPart(page)

  // nudge slider works and reports value
  await page.getByTestId('nudge-slider').fill('35')
  await expect(page.getByTestId('nudge-value')).toHaveText('+35 ms')
  await page.getByTestId('save-take').click()

  // --- lands on tag detail with 3 open parts
  await expect(page).toHaveURL(/\/t\//, { timeout: 15_000 })
  await expect(page.getByTestId('join-tenor')).toBeVisible()
  await expect(page.getByTestId('join-bari')).toBeVisible()
  await expect(page.getByTestId('join-bass')).toBeVisible()

  // --- join the remaining three parts
  let expectedGuides = 1 // lead exists when tenor joins; grows each round
  for (const part of ['tenor', 'bari', 'bass'] as const) {
    await page.getByTestId(`join-${part}`).click()
    await page.getByTestId('headphones-check').check()
    await page.getByTestId('to-record').click()
    // record screen shows the guide parts as videos alongside the camera
    await expect(page.getByTestId('record-button')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('video')).toHaveCount(1 + expectedGuides)
    await expect(page.getByTestId('record-pitch-pipe')).toBeVisible()
    expectedGuides += 1
    await recordCurrentPart(page)
    await page.getByTestId('save-take').click()
    if (part === 'bass') {
      // last part completes the combination → celebration
      await expect(page.getByTestId('see-performance')).toBeVisible({ timeout: 20_000 })
    } else {
      await expect(page).toHaveURL(/\/t\//, { timeout: 15_000 })
    }
  }

  // --- performance page: grid plays, all four singers credited
  await page.getByTestId('see-performance').click()
  await expect(page.getByTestId('grid-play')).toBeVisible()
  await page.getByTestId('grid-play').click()
  await page.waitForTimeout(2_500)
  // all four quadrant videos should be progressing
  const times = await page.$$eval('video', (els) =>
    els.map((v) => (v as HTMLVideoElement).currentTime),
  )
  expect(times.filter((t) => t > 0).length).toBeGreaterThanOrEqual(4)
  // audio comes from the stem mixer — every video must stay muted (the iOS
  // one-unmuted-element rule means element audio can never mix a quartet)
  const muted = await page.$$eval('video', (els) =>
    els.map((v) => (v as HTMLVideoElement).muted),
  )
  expect(muted.every(Boolean)).toBe(true)

  // like it
  await page.getByTestId('perf-like').click()
  await expect(page.getByTestId('perf-like')).toHaveText('♥ 1')

  // --- feed now shows the performance
  await page.goto('/#/')
  await expect(page.getByTestId(/perf-card-/)).toBeVisible()

  // --- swap-in path exists from the performance (the Jason case)
  await page.getByTestId(/perf-card-/).locator('a').first().click()
  await expect(page.getByTestId('swap-lead')).toBeVisible()
})

test('learning mode: solo a part on tag detail', async ({ page }) => {
  await page.goto('/')
  // profile persists from previous test? No — fresh context per test. Onboard again.
  await page.getByTestId('onboard-name').fill('Learner')
  await page.getByTestId('onboard-go').click()
  await expect(page.getByTestId('empty-start')).toBeVisible()
  await page.getByTestId('empty-start').click()
  await page.getByTestId('tag-title').fill('Sweet Adeline')
  await page.getByTestId('to-record').click()
  await recordCurrentPart(page)
  await page.getByTestId('save-take').click()
  await expect(page).toHaveURL(/\/t\//, { timeout: 15_000 })

  // solo chip appears for the recorded part (default part = lead)
  await expect(page.getByTestId('solo-lead')).toBeVisible()
  await page.getByTestId('solo-lead').click()
  await expect(page.getByTestId('solo-lead')).toContainText('only')
})

test('cleanup: delete own take and delete tag', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/')
  await page.getByTestId('onboard-name').fill('Cleaner')
  await page.getByTestId('onboard-go').click()
  await page.getByTestId('empty-start').click()
  await page.getByTestId('tag-title').fill('Doomed Tag')
  await page.getByTestId('to-record').click()
  await recordCurrentPart(page)
  await page.getByTestId('save-take').click()
  await expect(page).toHaveURL(/\/t\//, { timeout: 15_000 })

  // delete my own take → slot reopens
  await page.getByTestId('delete-take-lead-0').click()
  await expect(page.getByTestId('join-lead')).toBeVisible()

  // creator deletes the whole tag → back to empty feed
  await page.getByTestId('delete-tag').click()
  await expect(page).toHaveURL(/#\/$/, { timeout: 10_000 })
  await page.getByTestId('tab-open').click()
  await expect(page.getByTestId('empty-start-open')).toBeVisible()
})
