import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// sandbox environments pre-install chromium here; elsewhere let Playwright resolve it
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'

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
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
