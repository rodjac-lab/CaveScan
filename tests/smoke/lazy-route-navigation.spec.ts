import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

test('lazy routes load without blank screen', async ({ page }) => {
  test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Smoke env not configured')

  await login(page)

  await page.goto('/decouvrir')
  await expect(page.getByText('Celestin').first()).toBeVisible()

  await page.goto('/degustations')
  await expect(page.getByText('Historique de vos dégustations')).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByText('Paramètres')).toBeVisible()
})
