import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect } from '@playwright/test'
import { E2E_PREFIX } from './fixtures'
import { requireSmokeEnv } from './auth'

function normalizeEnvValue(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\\n/g, '')
    .trim()
}

function requireNormalizedEnv(name: string): string {
  const value = normalizeEnvValue(process.env[name])
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

export async function createAuthedSupabase(): Promise<SupabaseClient> {
  const client = createClient(
    requireNormalizedEnv('VITE_SUPABASE_URL'),
    requireNormalizedEnv('VITE_SUPABASE_ANON_KEY'),
  )

  const { error } = await client.auth.signInWithPassword({
    email: requireSmokeEnv('PLAYWRIGHT_TEST_EMAIL'),
    password: requireSmokeEnv('PLAYWRIGHT_TEST_PASSWORD'),
  })
  if (error) throw error

  return client
}

async function deleteBottlesByColumn(client: SupabaseClient, column: string) {
  const { error } = await client
    .from('bottles')
    .delete()
    .like(column, `${E2E_PREFIX}%`)
  if (error) throw error
}

export async function cleanupE2EData(client: SupabaseClient): Promise<void> {
  const { data: messages } = await client
    .from('chat_messages')
    .select('session_id')
    .ilike('content', `%${E2E_PREFIX}%`)

  const sessionIds = [...new Set((messages ?? []).map((message) => message.session_id).filter(Boolean))]
  if (sessionIds.length > 0) {
    await client.from('user_memory_facts').delete().in('session_id', sessionIds)
    await client.from('chat_messages').delete().in('session_id', sessionIds)
    await client.from('chat_sessions').delete().in('id', sessionIds)
  }

  await deleteBottlesByColumn(client, 'domaine')
  await deleteBottlesByColumn(client, 'cuvee')
  await deleteBottlesByColumn(client, 'appellation')

  const { error: zoneError } = await client
    .from('zones')
    .delete()
    .like('name', `${E2E_PREFIX}%`)
  if (zoneError) throw zoneError
}

export async function createE2EZone(client: SupabaseClient, name: string) {
  const { data, error } = await client
    .from('zones')
    .insert({
      name,
      description: 'Zone creee par les tests e2e',
      rows: 3,
      columns: 3,
      position: 999,
    })
    .select('id, name, rows, columns')
    .single()

  if (error) throw error
  return data as { id: string; name: string; rows: number; columns: number }
}

export async function insertCellarBottle(
  client: SupabaseClient,
  bottle: {
    domaine: string
    cuvee?: string | null
    appellation: string
    millesime: number
    couleur: 'rouge' | 'blanc' | 'rose' | 'bulles'
    zoneId?: string | null
    shelf?: string | null
    quantity?: number
  },
) {
  const { data, error } = await client
    .from('bottles')
    .insert({
      domaine: bottle.domaine,
      cuvee: bottle.cuvee ?? null,
      appellation: bottle.appellation,
      millesime: bottle.millesime,
      couleur: bottle.couleur,
      country: 'France',
      region: 'E2E',
      zone_id: bottle.zoneId ?? null,
      shelf: bottle.shelf ?? null,
      status: 'in_stock',
      drunk_at: null,
      purchase_price: null,
      photo_url: null,
      photo_url_back: null,
      raw_extraction: null,
      grape_varieties: null,
      serving_temperature: null,
      typical_aromas: null,
      food_pairings: null,
      character: null,
      drink_from: null,
      drink_until: null,
      quantity: bottle.quantity ?? 1,
      volume_l: 0.75,
    })
    .select('id')
    .single()

  if (error) throw error
  return data as { id: string }
}

export async function expectBottleField(
  client: SupabaseClient,
  domaine: string,
  selector: (row: Record<string, unknown>) => unknown,
  expected: unknown,
): Promise<void> {
  await expect.poll(async () => {
    const { data, error } = await client
      .from('bottles')
      .select('*')
      .eq('domaine', domaine)
      .order('added_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? selector(data as Record<string, unknown>) : null
  }).toEqual(expected)
}

export async function findLatestBottleByDomaine(client: SupabaseClient, domaine: string) {
  const { data, error } = await client
    .from('bottles')
    .select('*')
    .eq('domaine', domaine)
    .order('added_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Record<string, unknown> | null
}
