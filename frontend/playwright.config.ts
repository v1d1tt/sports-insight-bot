import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production build (vite preview).
// The tests mock /api, so they need no Python server.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
