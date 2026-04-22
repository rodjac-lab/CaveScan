import { test, expect } from '@playwright/test'
import { login } from '../helpers/auth'

test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Smoke env not configured')

test('auth and app load', async ({ page }) => {
  await login(page)

  await expect(page.getByText('Ma Cave')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Failed to fetch dynamically imported module')
})
