import { expect, type Page } from '@playwright/test'

export function requireSmokeEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required smoke test env: ${name}`)
  return value
}

export async function login(page: Page): Promise<void> {
  const email = requireSmokeEnv('PLAYWRIGHT_TEST_EMAIL')
  const password = requireSmokeEnv('PLAYWRIGHT_TEST_PASSWORD')

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mot de passe').fill(password)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.goto('/cave')
  await expect(page).toHaveURL(/\/cave$/)
}
