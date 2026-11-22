import { expect, test } from '@playwright/test'
import { mockApi } from './mock-api.ts'

test('the example questions follow the Sport focus', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  const examples = page.getByRole('list', { name: 'Example questions' })
  await expect(examples).toContainText('leg-spinner')

  await page.getByRole('combobox', { name: 'Sport' }).selectOption('football')
  await expect(examples).not.toContainText('leg-spinner')
  await expect(examples).toContainText('pressing')
})

test('icon buttons show what they do on hover', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Add a Wagon wheel' }).hover()
  await expect(page.locator('.tooltip')).toHaveText('Add a Wagon wheel: tap where each Shot went')
  await page.getByRole('button', { name: 'Attach images' }).hover()
  await expect(page.locator('.tooltip')).toHaveText('Attach images')
})
