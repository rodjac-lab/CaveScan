import { expect, type Page } from '@playwright/test'

export function requireSmokeEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required smoke test env: ${name}`)
  return value
}

export async function login(page: Page): Promise<void> {
  const email = requireSmokeEnv('PLAYWRIGHT_TEST_EMAIL')
  const password = requireSmokeEnv('PLAYWRIGHT_TEST_PASSWORD')

  await page.addInitScript(() => {
    window.localStorage.setItem('cavescan_has_account', 'true')
  })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  const loginError = page.getByText('Email ou mot de passe incorrect')
  await page.waitForLoadState('networkidle')
  await expect(loginError).toHaveCount(0)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.goto('/cave')
    if (/\/cave$/.test(page.url())) {
      await expect(page.getByRole('heading', { name: 'Ma Cave' })).toBeVisible()
      return
    }
    await page.waitForTimeout(500)
  }

  throw new Error(`Login smoke test could not reach /cave. Last URL: ${page.url()}`)
}
