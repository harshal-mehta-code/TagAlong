import { test, type Page } from '@playwright/test'

const SHOT_DIR = process.env.SHOT_DIR || '/tmp/shots'
const vp = { width: 390, height: 844 }

async function shoot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` })
}

async function record(page: Page, singMs = 2500) {
  await page.getByTestId('record-button').click({ timeout: 15_000 })
  await page.waitForTimeout(2800 + singMs)
  await page.getByTestId('stop-button').click()
  await page.getByTestId('save-take').waitFor({ timeout: 15_000 })
}

test('capture design screenshots', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'screenshot capture only')
  await page.setViewportSize(vp)
  await page.goto('/')

  await shoot(page, '01-onboarding')
  await page.getByTestId('onboard-name').fill('Harshal')
  await page.getByTestId('part-bari').click()
  await page.getByTestId('onboard-go').click()
  await shoot(page, '02-home-empty')

  await page.getByTestId('empty-start').click()
  await page.getByTestId('tag-title').fill('Lost Chord')
  await page.getByTestId('part-lead').click()
  await shoot(page, '03-start-setup')

  await page.getByTestId('to-record').click()
  await page.getByTestId('record-button').waitFor({ timeout: 15_000 })
  await shoot(page, '04-record-ready')
  await page.getByTestId('record-button').click()
  await page.waitForTimeout(1200)
  await shoot(page, '05-countin')
  await page.waitForTimeout(1600 + 2500)
  await page.getByTestId('stop-button').click()
  await page.getByTestId('save-take').waitFor({ timeout: 15_000 })
  await shoot(page, '06-sync-check')
  await page.getByTestId('save-take').click()
  await page.waitForURL(/\/t\//, { timeout: 15_000 })
  await shoot(page, '07-tag-detail')

  for (const part of ['tenor', 'bari', 'bass'] as const) {
    await page.getByTestId(`join-${part}`).click()
    if (part === 'tenor') await shoot(page, '08-join-preflight')
    await page.getByTestId('headphones-check').check()
    await page.getByTestId('to-record').click()
    if (part === 'bari') {
      await page.getByTestId('record-button').waitFor({ timeout: 15_000 })
      await shoot(page, '08b-join-record-grid')
    }
    await record(page)
    await page.getByTestId('save-take').click()
    if (part === 'bass') {
      await page.getByTestId('see-performance').waitFor({ timeout: 20_000 })
      await shoot(page, '09-celebrate')
    } else {
      await page.waitForURL(/\/t\//, { timeout: 15_000 })
    }
  }

  await page.getByTestId('see-performance').click()
  await page.getByTestId('grid-play').waitFor()
  await shoot(page, '10-performance')

  await page.goto('/#/')
  await shoot(page, '11-home-feed')
  await page.getByTestId('tab-open').click()
  await shoot(page, '12-home-inprogress')
  await page.goto('/#/profile')
  await shoot(page, '13-profile')
})
