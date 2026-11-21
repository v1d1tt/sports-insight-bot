import { expect, test } from '@playwright/test'

test('the page loads and shows the Analyst status from the API', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', model: 'google/gemma-4-26b-a4b-it' } }),
  )

  await page.goto('/')

  await expect(page).toHaveTitle('Sports Insight Bot')
  await expect(page.getByRole('heading', { name: 'Sports Insight Bot' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Analyst online')
  await expect(page.getByRole('status')).toContainText('google/gemma-4-26b-a4b-it')
})
