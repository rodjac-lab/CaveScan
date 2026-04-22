import { test, expect } from '@playwright/test'
import { login } from '../helpers/auth'
import { E2E_PREFIX, TEST_IMAGE, makeExtraction, makeExtractWineResponse } from '../helpers/fixtures'
import { mockBackgroundFunctions, mockExtractWine, mockStorageUploads } from '../helpers/network'
import {
  cleanupE2EData,
  createAuthedSupabase,
  createE2EZone,
  expectBottleField,
  findLatestBottleByDomaine,
} from '../helpers/supabase'

test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Flow env not configured')

test('encaver single: photo, OCR, correction, zone, shelf, save', async ({ page }) => {
  const client = await createAuthedSupabase()
  const domaine = `${E2E_PREFIX} Domaine Encaver`
  const correctedCuvee = `${E2E_PREFIX} Cuvee corrigee`
  await cleanupE2EData(client)
  const cleanZone = await createE2EZone(client, `${E2E_PREFIX} Zone Encaver`)

  await mockBackgroundFunctions(page)
  await mockStorageUploads(page)
  await mockExtractWine(page, makeExtractWineResponse(makeExtraction({
    domaine,
    cuvee: `${E2E_PREFIX} Cuvee OCR`,
    appellation: `${E2E_PREFIX} Appellation Encaver`,
    millesime: 2021,
    couleur: 'rouge',
    region: 'Bourgogne',
    purchase_price: 42,
  })))

  try {
    await login(page)
    await page.goto('/add')

    await page.locator('input[type="file"]').first().setInputFiles(TEST_IMAGE)

    await expect(page.getByLabel('Domaine / Producteur')).toHaveValue(domaine)
    await expect(page.getByLabel('Cuvée')).toHaveValue(`${E2E_PREFIX} Cuvee OCR`)

    await page.getByLabel('Cuvée').fill(correctedCuvee)
    await page.locator('#zone').click()
    await page.getByRole('option', { name: cleanZone.name }).click()
    await page.getByRole('button', { name: 'E2' }).click()
    await page.getByRole('button', { name: 'Fond', exact: true }).click()
    await page.getByLabel("Prix d'achat (€)").fill('42.50')

    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText("Prenez une photo de l'étiquette ou saisissez manuellement")).toBeVisible()

    await expectBottleField(client, domaine, (row) => row.cuvee, correctedCuvee)
    await expectBottleField(client, domaine, (row) => row.zone_id, cleanZone.id)
    await expectBottleField(client, domaine, (row) => row.shelf, 'Étagère 2 · Profondeur 2')

    const saved = await findLatestBottleByDomaine(client, domaine)
    expect(saved?.status).toBe('in_stock')
    expect(saved?.photo_url).toContain('/storage/v1/object/public/wine-labels/')
  } finally {
    await cleanupE2EData(client)
    await client.auth.signOut()
  }
})
