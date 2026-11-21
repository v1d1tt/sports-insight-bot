import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  server: {
    // In dev, send /api requests to the local FastAPI server (same paths as on Vercel).
    proxy: { '/api': 'http://127.0.0.1:8000' },
    // The Fielding restrictions file lives in backend/ (docs/adr/0003); let dev serve it.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), '../backend/app/fielding/restrictions.json'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest-setup.ts'],
    // Only unit and component tests. Playwright owns the e2e/ folder.
    include: ['src/**/*.test.ts'],
    unstubGlobals: true,
  },
})
