import { test, expect } from '@playwright/test'
import { login } from '../helpers/auth'
import { E2E_PREFIX, TEST_IMAGE, makeExtraction, makeExtractWineResponse } from '../helpers/fixtures'
import { mockBackgroundFunctions, mockExtractWine, mockExtractWineSequence, mockStorageUploads } from '../helpers/network'
import {
  cleanupE2EData,
  createAuthedSupabase,
  createE2EZone,
  expectBottleField,
  findLatestBottleByDomaine,
  insertCellarBottle,
} from '../helpers/supabase'

test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Flow env not configured')

async function submitScannerPhotoForTasting(page: import('@playwright/test').Page) {
  await page.goto('/scanner')
  await page.getByRole('button', { name: 'Déguster' }).click()
  await page.locator('input[type="file"][multiple]').setInputFiles(TEST_IMAGE)
}

test('deguster single: photo, match cave, sortie, tasting note persists', async ({ page }) => {
  const client = await createAuthedSupabase()
  await cleanupE2EData(client)

  const zone = await createE2EZone(client, `${E2E_PREFIX} Zone Deguster`)
  const domaine = `${E2E_PREFIX} Domaine Match Cave`
  await insertCellarBottle(client, {
    domaine,
    cuvee: `${E2E_PREFIX} Cuvee Match Cave`,
    appellation: `${E2E_PREFIX} Appellation Match Cave`,
    millesime: 2020,
    couleur: 'rouge',
    zoneId: zone.id,
    shelf: 'Étagère 1 · Profondeur 1',
  })

  await mockBackgroundFunctions(page)
  await mockStorageUploads(page)
  await mockExtractWine(page, makeExtractWineResponse(makeExtraction({
    domaine,
    cuvee: `${E2E_PREFIX} Cuvee Match Cave`,
    appellation: `${E2E_PREFIX} Appellation Match Cave`,
    millesime: 2020,
    couleur: 'rouge',
  })))

  try {
    await login(page)
    await submitScannerPhotoForTasting(page)

    await expect(page.getByText('En cave', { exact: true })).toBeVisible()
    await expect(page.getByText(domaine)).toBeVisible()
    await page.getByRole('button', { name: 'Sortir de cave' }).click()

    await expect(page.locator('#tasting')).toBeVisible()
    const note = `${E2E_PREFIX} note degustation match cave`
    await page.locator('#tasting').fill(note)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.locator('#tasting')).toHaveValue(note)
    await expectBottleField(client, domaine, (row) => row.tasting_note, note)

    await page.reload()
    await expect(page.locator('#tasting')).toHaveValue(note)
    await expectBottleField(client, domaine, (row) => row.status, 'drunk')
  } finally {
    await cleanupE2EData(client)
    await client.auth.signOut()
  }
})

test('deguster single: photo hors cave, creation drunk, tasting note persists', async ({ page }) => {
  const client = await createAuthedSupabase()
  await cleanupE2EData(client)

  const domaine = `${E2E_PREFIX} Domaine Hors Cave`
  await mockBackgroundFunctions(page)
  await mockStorageUploads(page)
  await mockExtractWine(page, makeExtractWineResponse(makeExtraction({
    domaine,
    cuvee: `${E2E_PREFIX} Cuvee Hors Cave`,
    appellation: `${E2E_PREFIX} Appellation Hors Cave`,
    millesime: 2019,
    couleur: 'blanc',
  })))

  try {
    await login(page)
    await submitScannerPhotoForTasting(page)

    await expect(page.getByText('Hors cave', { exact: true })).toBeVisible()
    await expect(page.getByText(domaine)).toBeVisible()
    await page.getByRole('button', { name: 'Noter la degustation' }).click()

    await expect(page.locator('#tasting')).toBeVisible()
    const note = `${E2E_PREFIX} note degustation hors cave`
    await page.locator('#tasting').fill(note)
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.locator('#tasting')).toHaveValue(note)

    await expectBottleField(client, domaine, (row) => row.status, 'drunk')
    await expectBottleField(client, domaine, (row) => row.tasting_note, note)

    const saved = await findLatestBottleByDomaine(client, domaine)
    expect(saved?.photo_url).toContain('/storage/v1/object/public/wine-labels/')
  } finally {
    await cleanupE2EData(client)
    await client.auth.signOut()
  }
})

test('deguster batch: multi-photo review saves in-cave and out-of-cellar items', async ({ page }) => {
  const client = await createAuthedSupabase()
  await cleanupE2EData(client)

  const zone = await createE2EZone(client, `${E2E_PREFIX} Zone Batch Deguster`)
  const matchedDomaine = `${E2E_PREFIX} Domaine Batch Match`
  const outsideDomaine = `${E2E_PREFIX} Domaine Batch Hors Cave`
  await insertCellarBottle(client, {
    domaine: matchedDomaine,
    cuvee: `${E2E_PREFIX} Cuvee Batch Match`,
    appellation: `${E2E_PREFIX} Appellation Batch Match`,
    millesime: 2018,
    couleur: 'rouge',
    zoneId: zone.id,
    shelf: 'Étagère 1 · Profondeur 1',
  })

  await mockBackgroundFunctions(page)
  await mockStorageUploads(page)
  await mockExtractWineSequence(page, [
    makeExtractWineResponse(makeExtraction({
      domaine: matchedDomaine,
      cuvee: `${E2E_PREFIX} Cuvee Batch Match`,
      appellation: `${E2E_PREFIX} Appellation Batch Match`,
      millesime: 2018,
      couleur: 'rouge',
    })),
    makeExtractWineResponse(makeExtraction({
      domaine: outsideDomaine,
      cuvee: `${E2E_PREFIX} Cuvee Batch Hors Cave`,
      appellation: `${E2E_PREFIX} Appellation Batch Hors Cave`,
      millesime: 2021,
      couleur: 'blanc',
    })),
  ])

  try {
    await login(page)
    await page.goto('/scanner')
    await page.getByRole('button', { name: 'Déguster' }).click()
    await page.locator('input[type="file"][multiple]').setInputFiles([
      { ...TEST_IMAGE, name: 'e2e-batch-1.png' },
      { ...TEST_IMAGE, name: 'e2e-batch-2.png' },
    ])

    await expect(page.getByText(matchedDomaine)).toBeVisible()
    await expect(page.getByText('En cave', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Sortir de cave' }).click()

    await expect(page.getByLabel('Domaine / Producteur')).toHaveValue(outsideDomaine)
    await expect(page.getByText('Hors cave', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(page).toHaveURL(/\/degustations$/)
    await expectBottleField(client, matchedDomaine, (row) => row.status, 'drunk')
    await expectBottleField(client, outsideDomaine, (row) => row.status, 'drunk')
  } finally {
    await cleanupE2EData(client)
    await client.auth.signOut()
  }
})
