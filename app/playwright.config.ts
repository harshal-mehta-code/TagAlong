import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// sandbox environments pre-install chromium here; elsewhere let Playwright resolve it
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'

const FAKE_MEDIA_ARGS = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
]

// The mp4 pre-render needs an AAC encoder, which OSS Chromium lacks — that
// path can only be exercised against branded Chrome, locally.
const HAS_BRANDED_CHROME =
  !process.env.CI && existsSync('/Applications/Google Chrome.app')

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    permissions: ['camera', 'microphone'],
    launchOptions: {
      executablePath:
        !process.env.CI && existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
      args: FAKE_MEDIA_ARGS,
    },
  },
  projects: [
    { name: 'chromium', testIgnore: /prerender\.spec/ },
    ...(HAS_BRANDED_CHROME
      ? [{
          name: 'chrome-prerender',
          testMatch: /prerender\.spec/,
          use: {
            channel: 'chrome' as const,
            launchOptions: { executablePath: undefined, args: FAKE_MEDIA_ARGS },
          },
        }]
      : []),
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
