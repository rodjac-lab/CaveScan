import { test, expect } from '@playwright/test'
import { login } from '../helpers/auth'
import { E2E_PREFIX } from '../helpers/fixtures'
import { mockBackgroundFunctions, mockCelestinRecommendations } from '../helpers/network'
import {
  cleanupE2EData,
  createAuthedSupabase,
  createE2EZone,
  insertCellarBottle,
} from '../helpers/supabase'

test.skip(!process.env.PLAYWRIGHT_TEST_EMAIL || !process.env.PLAYWRIGHT_TEST_PASSWORD, 'Flow env not configured')

test('Celestin recommendation continues on a short follow-up without real LLM', async ({ page }) => {
  const client = await createAuthedSupabase()
  await cleanupE2EData(client)

  const zone = await createE2EZone(client, `${E2E_PREFIX} Zone Celestin`)
  const red = await insertCellarBottle(client, {
    domaine: `${E2E_PREFIX} Domaine Rouge Celestin`,
    cuvee: `${E2E_PREFIX} Rouge reco`,
    appellation: `${E2E_PREFIX} Appellation Rouge`,
    millesime: 2020,
    couleur: 'rouge',
    zoneId: zone.id,
  })
  const white = await insertCellarBottle(client, {
    domaine: `${E2E_PREFIX} Domaine Blanc Celestin`,
    cuvee: `${E2E_PREFIX} Blanc reco`,
    appellation: `${E2E_PREFIX} Appellation Blanc`,
    millesime: 2022,
    couleur: 'blanc',
    zoneId: zone.id,
  })

  await mockBackgroundFunctions(page)
  await mockCelestinRecommendations(page, {
    red: {
      bottle_id: red.id.slice(0, 8),
      name: `${E2E_PREFIX} Rouge reco`,
      appellation: `${E2E_PREFIX} Appellation Rouge 2020`,
    },
    white: {
      bottle_id: white.id.slice(0, 8),
      name: `${E2E_PREFIX} Blanc reco`,
      appellation: `${E2E_PREFIX} Appellation Blanc 2022`,
    },
  })

  try {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('questionnaire_dismissed', 'true')
    })
    await login(page)
    await page.goto('/decouvrir')

    await page.getByPlaceholder('Poulet rôti, envie de bulles...').fill(`${E2E_PREFIX} que boire avec un poulet roti ?`)
    await page.keyboard.press('Enter')

    await expect(page.getByText('Pour le poulet roti')).toBeVisible()
    await expect(page.getByText(`${E2E_PREFIX} Rouge reco`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Et en blanc ?' })).toBeVisible()

    await page.getByRole('button', { name: 'Et en blanc ?' }).click()

    await expect(page.getByText('En blanc')).toBeVisible()
    await expect(page.getByText(`${E2E_PREFIX} Blanc reco`)).toBeVisible()
  } finally {
    await cleanupE2EData(client)
    await client.auth.signOut()
  }
})
