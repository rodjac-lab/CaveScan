import type { Page, Route } from '@playwright/test'

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    },
  }
}

async function fulfillOptionsOrJson(route: Route, body: unknown) {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill(jsonResponse({ ok: true }))
    return
  }

  await route.fulfill(jsonResponse(body))
}

export async function mockStorageUploads(page: Page): Promise<void> {
  await page.route('**/storage/v1/object/wine-labels/**', async (route) => {
    await fulfillOptionsOrJson(route, { Key: 'wine-labels/e2e-upload.jpg' })
  })
}

export async function mockExtractWine(page: Page, extractionResponse: unknown): Promise<void> {
  await page.route('**/functions/v1/extract-wine', async (route) => {
    await fulfillOptionsOrJson(route, extractionResponse)
  })
}

export async function mockExtractWineSequence(page: Page, extractionResponses: unknown[]): Promise<void> {
  let index = 0
  await page.route('**/functions/v1/extract-wine', async (route) => {
    const response = extractionResponses[Math.min(index, extractionResponses.length - 1)]
    index += 1
    await fulfillOptionsOrJson(route, response)
  })
}

export async function mockBackgroundFunctions(page: Page): Promise<void> {
  await page.route('**/functions/v1/compile-user-profile', async (route) => {
    await fulfillOptionsOrJson(route, {
      profile: {
        user_id: 'e2e',
        compiled_markdown: 'Profil compile e2e: aime les vins precis et digestes.',
        updated_at: new Date().toISOString(),
        version: 1,
        last_compiled_from_event_at: null,
        last_compilation_reason: 'e2e',
        compilation_status: 'ok',
      },
    })
  })

  await page.route('**/functions/v1/extract-chat-insights', async (route) => {
    await fulfillOptionsOrJson(route, { facts: [], summary: '' })
  })

  await page.route('**/functions/v1/extract-tasting-tags', async (route) => {
    await fulfillOptionsOrJson(route, {
      plats: [],
      descripteurs: ['test e2e'],
      occasion: null,
      sentiment: 'bon',
      maturite: null,
      keywords: ['test e2e'],
    })
  })

  await page.route('**/functions/v1/generate-embedding', async (route) => {
    await fulfillOptionsOrJson(route, { embedding: [], saved: true })
  })

  await page.route('**/functions/v1/enrich-wine', async (route) => {
    await fulfillOptionsOrJson(route, {
      grape_varieties: ['pinot noir'],
      serving_temperature: '14-16 C',
      typical_aromas: ['cerise'],
      food_pairings: ['volaille'],
      character: 'Mock e2e enrichissement.',
    })
  })
}

export async function mockCelestinRecommendations(
  page: Page,
  cards: {
    red: { bottle_id: string; name: string; appellation: string }
    white: { bottle_id: string; name: string; appellation: string }
  },
): Promise<void> {
  await page.route('**/functions/v1/celestin', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill(jsonResponse({ ok: true }))
      return
    }

    const body = route.request().postDataJSON() as { message?: string } | null
    const wantsWhite = /blanc/i.test(body?.message ?? '')
    const selected = wantsWhite ? cards.white : cards.red

    await route.fulfill(jsonResponse({
      message: wantsWhite
        ? 'Oui. En blanc, je partirais sur celui-ci: il garde de la tension.'
        : 'Pour le poulet roti, je partirais sur cette bouteille de ta cave.',
      ui_action: {
        kind: 'show_recommendations',
        payload: {
          cards: [{
            bottle_id: selected.bottle_id,
            name: selected.name,
            appellation: selected.appellation,
            color: wantsWhite ? 'blanc' : 'rouge',
            badge: 'De ta cave',
            reason: wantsWhite
              ? 'Assez frais pour relancer le plat sans l’alourdir.'
              : 'Un rouge digeste et precise, adapte a la volaille.',
          }],
        },
      },
      action_chips: wantsWhite ? ['Autre idee'] : ['Et en blanc ?'],
      _nextState: {
        phase: 'post_task_ack',
        taskType: 'recommendation',
        turnCount: wantsWhite ? 2 : 1,
      },
      _debug: {
        cognitiveMode: 'cellar_assistant',
      },
    }))
  })
}
