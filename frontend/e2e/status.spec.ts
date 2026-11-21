import { expect, test } from '@playwright/test'
import { mockApi } from './mock-api.ts'

test('the page loads with its title and an empty Chat', async ({ page }) => {
  await mockApi(page)

  await page.goto('/')

  await expect(page).toHaveTitle('Sports Insight Bot')
  await expect(page.getByRole('heading', { name: 'Sports Insight Bot' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible()
  await expect(page.getByRole('log', { name: 'Messages' }).getByRole('article')).toHaveCount(0)
})
