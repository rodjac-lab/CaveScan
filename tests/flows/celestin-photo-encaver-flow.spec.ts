import { test, expect } from '@playwright/test'
import { login } from '../helpers/auth'
import { E2E_PREFIX, TEST_IMAGE, makeExtraction, makeExtractWineResponse } from '../helpers/fixtures'
import { mockBackgroundFunctions, mockExtractWine, mockStorageUploads } from '../helpers/network'
import {
  cleanupE2EData,
  createAuthedSupabase,
  createE2EZone,
  expectBottleField,
} from '../helpers/supabase'

test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Flow env not configured')

test('Celestin photo-only Encaver creates an add-wine prefill and saves it', async ({ page }) => {
  const client = await createAuthedSupabase()
  await cleanupE2EData(client)

  const domaine = `${E2E_PREFIX} Domaine Photo Celestin`
  const zone = await createE2EZone(client, `${E2E_PREFIX} Zone Photo Celestin`)

  await mockBackgroundFunctions(page)
  await mockStorageUploads(page)
  await mockExtractWine(page, makeExtractWineResponse(makeExtraction({
    domaine,
    cuvee: `${E2E_PREFIX} Cuvee Photo Celestin`,
    appellation: `${E2E_PREFIX} Appellation Photo Celestin`,
    millesime: 2023,
    couleur: 'rouge',
  })))

  try {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('questionnaire_dismissed', 'true')
    })
    await login(page)
    await page.goto('/decouvrir')

    await page.locator('input[type="file"]').setInputFiles(TEST_IMAGE)
    await page.locator('form button[type="submit"]').click()
    await expect(page.getByRole('button', { name: 'Encaver' })).toBeVisible()

    await page.getByRole('button', { name: 'Encaver' }).click()
    await expect(page.getByText(`${domaine} — ${E2E_PREFIX} Cuvee Photo Celestin`)).toBeVisible()
    await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page).toHaveURL(/\/add$/)
    await expect(page.getByLabel('Domaine / Producteur')).toHaveValue(domaine)
    await page.locator('#zone').click()
    await page.getByRole('option', { name: zone.name }).click()
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page.getByText("Prenez une photo de l'étiquette ou saisissez manuellement")).toBeVisible()
    await expectBottleField(client, domaine, (row) => row.status, 'in_stock')
    await expectBottleField(client, domaine, (row) => row.zone_id, zone.id)
  } finally {
    await cleanupE2EData(client)
    await client.auth.signOut()
  }
})
