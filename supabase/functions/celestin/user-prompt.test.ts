import { describe, expect, it } from 'vitest'
import { INITIAL_STATE, type ConversationState } from './conversation-state'
import { buildUserPrompt } from './user-prompt'
import type { RequestBody } from './types'
import type { TurnInterpretation, RoutingIntent } from './turn-interpreter'

function body(message: string, overrides: Partial<RequestBody> = {}): RequestBody {
  return {
    message,
    history: [],
    cave: [],
    context: {
      dayOfWeek: 'dimanche',
      season: 'printemps',
    },
    ...overrides,
  }
}

function state(overrides: Partial<ConversationState> = {}): ConversationState {
  return { ...INITIAL_STATE, ...overrides }
}

function interp(
  overrides: Partial<TurnInterpretation> & Pick<TurnInterpretation, 'turnType' | 'cognitiveMode'>,
): TurnInterpretation {
  return { shouldAllowUiAction: false, ...overrides }
}

type Case = {
  name: string
  message: string
  bodyOverrides?: Partial<RequestBody>
  interp: TurnInterpretation
  state: ConversationState
  lastAssistantText?: string
  routingIntent?: RoutingIntent
}

const CASES: Case[] = [
  {
    name: 'greeting',
    message: '',
    interp: interp({ turnType: 'greeting', cognitiveMode: 'greeting' }),
    state: state(),
  },
  {
    name: 'prefetch',
    message: 'pour ce soir',
    interp: interp({ turnType: 'prefetch', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }),
    state: state(),
  },
  {
    name: 'social_ack post_task_ack',
    message: 'merci !',
    interp: interp({ turnType: 'social_ack', cognitiveMode: 'social' }),
    state: state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
  },
  {
    name: 'social_ack idle',
    message: 'ok',
    interp: interp({ turnType: 'social_ack', cognitiveMode: 'social' }),
    state: state(),
  },
  {
    name: 'task_cancel',
    message: 'laisse tomber',
    interp: interp({ turnType: 'task_cancel', cognitiveMode: 'social' }),
    state: state({ phase: 'collecting_info', taskType: 'encavage' }),
  },
  {
    name: 'smalltalk wine_conversation basic',
    message: "c'est quoi un Saint-Emilion ?",
    interp: interp({ turnType: 'smalltalk', cognitiveMode: 'wine_conversation' }),
    state: state(),
  },
  {
    name: 'context_switch wine_conversation pivot exploratoire',
    message: 'Et si je veux plutot un italien ?',
    interp: interp({ turnType: 'context_switch', cognitiveMode: 'wine_conversation' }),
    state: state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
    lastAssistantText: 'Je te propose quelques bouteilles pour le poulet roti.',
    routingIntent: 'exploratory_reco_pivot',
  },
  {
    name: 'context_switch wine_conversation pivot reco',
    message: 'autre chose ?',
    interp: interp({ turnType: 'context_switch', cognitiveMode: 'wine_conversation' }),
    state: state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
  },
  {
    name: 'context_switch tasting_memory with focus',
    message: 'et le 2018 ?',
    interp: interp({ turnType: 'context_switch', cognitiveMode: 'tasting_memory' }),
    state: state({ memoryFocus: 'Domaine X' }),
  },
  {
    name: 'context_switch cellar_assistant',
    message: 'combien de magnums ?',
    interp: interp({ turnType: 'context_switch', cognitiveMode: 'cellar_assistant' }),
    state: state(),
  },
  {
    name: 'task_continue collecting recommendation',
    message: 'plutot un blanc',
    interp: interp({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }),
    state: state({ phase: 'collecting_info', taskType: 'recommendation' }),
  },
  {
    name: 'task_continue collecting encavage',
    message: 'Domaine Tempier 2018',
    interp: interp({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }),
    state: state({ phase: 'collecting_info', taskType: 'encavage' }),
  },
  {
    name: 'unknown without image',
    message: 'hmm',
    interp: interp({ turnType: 'unknown', cognitiveMode: 'wine_conversation' }),
    state: state(),
  },
  {
    name: 'unknown with image',
    message: 'regarde',
    bodyOverrides: { image: 'data:image/jpeg;base64,xxx' },
    interp: interp({ turnType: 'unknown', cognitiveMode: 'wine_conversation' }),
    state: state(),
  },
  {
    name: 'fallback task_request reco immediate',
    message: "ce soir c'est pizza",
    interp: interp({ turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }),
    state: state(),
    routingIntent: 'recommendation_request',
  },
  {
    name: 'fallback recommendation_refinement',
    message: 'autre chose en blanc ?',
    interp: interp({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }),
    state: state({ phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
    routingIntent: 'recommendation_refinement',
  },
  {
    name: 'fallback default reco persistent',
    message: 'et un dessert ?',
    interp: interp({ turnType: 'task_continue', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true }),
    state: state({ phase: 'active_task', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' }),
  },
  {
    name: 'fallback tasting_memory with focus',
    message: 'et le 2018 ?',
    interp: interp({ turnType: 'task_continue', cognitiveMode: 'tasting_memory', shouldAllowUiAction: true }),
    state: state({ memoryFocus: 'Mas de Daumas' }),
  },
  {
    name: 'recentDrunk trailer',
    message: 'que boire ?',
    bodyOverrides: { context: { dayOfWeek: 'samedi', season: 'ete', recentDrunk: ['Domaine A 2020', 'Domaine B 2019'] } },
    interp: interp({ turnType: 'task_request', cognitiveMode: 'cellar_assistant', shouldAllowUiAction: true, inferredTaskType: 'recommendation' }),
    state: state(),
    routingIntent: 'recommendation_request',
  },
  {
    name: 'unknown with image and recentDrunk',
    message: 'regarde',
    bodyOverrides: {
      image: 'data:image/jpeg;base64,xxx',
      context: { dayOfWeek: 'samedi', season: 'ete', recentDrunk: ['Mas de Daumas 2018'] },
    },
    interp: interp({ turnType: 'unknown', cognitiveMode: 'wine_conversation' }),
    state: state(),
  },
]

describe('buildUserPrompt', () => {
  it('makes exploratory recommendation pivots standalone and forbids previous dish reuse', () => {
    const interpretation: TurnInterpretation = {
      turnType: 'context_switch',
      cognitiveMode: 'wine_conversation',
      shouldAllowUiAction: false,
    }

    const prompt = buildUserPrompt(
      body('Et si je veux plutôt un italien ?'),
      interpretation,
      { ...INITIAL_STATE, phase: 'post_task_ack', taskType: 'recommendation', lastUiActionKind: 'show_recommendations' },
      'Je te propose quelques bouteilles pour le poulet rôti. [Vins proposés : ...]',
      'exploratory_reco_pivot',
    )

    expect(prompt).toContain('PIVOT EXPLORATOIRE')
    expect(prompt).toContain('question autonome')
    expect(prompt).toContain('Ne mentionne PAS le plat precedent')
    expect(prompt).toContain('ne declenche PAS de ui_action')
  })

  it('asks for immediate cards on direct recommendation requests', () => {
    const interpretation: TurnInterpretation = {
      turnType: 'task_request',
      cognitiveMode: 'cellar_assistant',
      shouldAllowUiAction: true,
      inferredTaskType: 'recommendation',
    }

    const prompt = buildUserPrompt(
      body("Ce soir c'est pizza"),
      interpretation,
      INITIAL_STATE,
      undefined,
      'recommendation_request',
    )

    expect(prompt).toContain('RECOMMANDATION IMMEDIATE')
    expect(prompt).toContain('Utilise show_recommendations maintenant')
    expect(prompt).toContain('Ne reponds pas seulement par des styles generiques')
  })
})

describe('buildUserPrompt — branch coverage snapshots', () => {
  for (const c of CASES) {
    it(`matches snapshot: ${c.name}`, () => {
      const prompt = buildUserPrompt(
        body(c.message, c.bodyOverrides),
        c.interp,
        c.state,
        c.lastAssistantText,
        c.routingIntent,
      )
      expect(prompt).toMatchSnapshot()
    })
  }
})
