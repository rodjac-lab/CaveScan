import { test, expect } from '@playwright/test'
import { login, requireSmokeEnv } from './helpers/auth'

test.skip(
  !process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD || !process.env.PLAYWRIGHT_DRUNK_BOTTLE_ID,
  'Smoke env not configured'
)

test('tasting save persists on bottle page', async ({ page }) => {
  const bottleId = requireSmokeEnv('PLAYWRIGHT_DRUNK_BOTTLE_ID')

  await login(page)
  await page.goto(`/bottle/${bottleId}`)

  const tastingField = page.locator('#tasting')
  await expect(tastingField).toBeVisible()

  const originalNote = await tastingField.inputValue()
  const smokeNote = `${originalNote}\n[smoke-save-check]`.trim()

  await tastingField.fill(smokeNote)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(tastingField).toHaveValue(smokeNote)

  await page.waitForTimeout(1500)
  await page.reload()
  const reloadedNote = await tastingField.inputValue()
  expect(
    reloadedNote,
    `Expected persisted tasting note to contain smoke marker after reload.\nReloaded note:\n${reloadedNote}`
  ).toContain('[smoke-save-check]')

  await tastingField.fill(originalNote)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(tastingField).toHaveValue(originalNote)
})
