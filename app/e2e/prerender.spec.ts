import { expect, test, type Page } from '@playwright/test'

/**
 * The single-mp4 watch path: after a take exists, the grid pre-renders the
 * whole performance (composited video + AAC premix) into one file and plays
 * THAT — A/V sync by construction. Needs H.264+AAC encoders, so this spec
 * runs only in the chrome-prerender project (branded Chrome, local).
 */

async function recordCurrentPart(page: Page) {
  await page.getByTestId('record-button').click({ timeout: 15_000 })
  await expect(page.getByTestId('stop-button')).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(6_000)
  await page.getByTestId('stop-button').click()
  await expect(page.getByTestId('save-take')).toBeVisible({ timeout: 15_000 })
}

test('grid plays the pre-rendered mp4 with sound', async ({ page }) => {
  await page.goto('/')

  const canEncode = await page.evaluate(async () => {
    const w = window as unknown as {
      VideoEncoder?: { isConfigSupported(c: object): Promise<{ supported?: boolean }> }
      AudioEncoder?: { isConfigSupported(c: object): Promise<{ supported?: boolean }> }
    }
    if (!w.VideoEncoder || !w.AudioEncoder) return false
    const v = await w.VideoEncoder
      .isConfigSupported({ codec: 'avc1.420028', width: 964, height: 1284 })
      .catch(() => null)
    const a = await w.AudioEncoder
      .isConfigSupported({ codec: 'mp4a.40.2', numberOfChannels: 1, sampleRate: 48000 })
      .catch(() => null)
    return !!v?.supported && !!a?.supported
  })
  test.skip(!canEncode, 'this browser cannot encode H.264 + AAC')

  await page.getByTestId('onboard-name').fill('Renderer')
  await page.getByTestId('onboard-go').click()
  await page.getByTestId('empty-start').click()
  await page.getByTestId('tag-title').fill('Render Me')
  await page.getByTestId('to-record').click()
  await recordCurrentPart(page)
  await page.getByTestId('save-take').click()
  await expect(page).toHaveURL(/\/t\//, { timeout: 15_000 })

  // background render lands and swaps in (encodes the whole tag — allow time)
  const rendered = page.getByTestId('grid-render-video')
  await expect(rendered).toBeVisible({ timeout: 60_000 })

  await page.getByTestId('grid-play').click()
  await page.waitForTimeout(2_500)

  // the mp4 is the one playing — audibly (unmuted, audio bytes decoded) and
  // visually (its clock advances); the per-take cell videos stay paused
  const state = await rendered.evaluate((el) => {
    const v = el as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }
    return {
      currentTime: v.currentTime,
      paused: v.paused,
      muted: v.muted,
      audioBytes: v.webkitAudioDecodedByteCount ?? -1,
    }
  })
  expect(state.paused).toBe(false)
  expect(state.muted).toBe(false)
  expect(state.currentTime).toBeGreaterThan(1)
  if (state.audioBytes >= 0) expect(state.audioBytes).toBeGreaterThan(0)

  const cellTimes = await page.$$eval(
    'video:not([data-testid="grid-render-video"])',
    (els) => els.map((v) => (v as HTMLVideoElement).currentTime),
  )
  expect(cellTimes.every((t) => t === 0)).toBe(true)
})
