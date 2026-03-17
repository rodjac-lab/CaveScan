import { WINE_CODEX } from "./wine-codex.ts"
import { CELESTIN_PERSONA } from "./persona.ts"
import { CELESTIN_CAPABILITIES } from "./capabilities.ts"
import { CELESTIN_RULES, CELESTIN_RULES_MEMORY_ONLY } from "./rules.ts"
import { CELESTIN_RESPONSE_FORMAT } from "./response-format.ts"
import type { CognitiveMode } from "./turn-interpreter.ts"

type PromptMode = CognitiveMode | 'greeting' | 'social'

export function buildCelestinSystemPrompt(cognitiveMode?: PromptMode): string {
  const modules = selectModules(cognitiveMode)
  return modules.map(m => m.trim()).join('\n\n')
}

function selectModules(mode?: PromptMode): string[] {
  switch (mode) {
    // Minimal: just personality + format
    case 'greeting':
    case 'social':
      return [CELESTIN_PERSONA, CELESTIN_RESPONSE_FORMAT]

    // Wine knowledge + personality, no action rules
    case 'wine_conversation':
      return [WINE_CODEX, CELESTIN_PERSONA, CELESTIN_RESPONSE_FORMAT]

    // Memories focus: no reco rules, no codex, no capabilities
    case 'tasting_memory':
      return [CELESTIN_PERSONA, CELESTIN_RULES_MEMORY_ONLY, CELESTIN_RESPONSE_FORMAT]

    // Restaurant: needs codex (food pairing) + full rules (photo handling)
    case 'restaurant_assistant':
      return [WINE_CODEX, CELESTIN_PERSONA, CELESTIN_RULES, CELESTIN_RESPONSE_FORMAT]

    // Cellar assistant: everything (primary mode for reco + encavage)
    case 'cellar_assistant':
    default:
      return [WINE_CODEX, CELESTIN_PERSONA, CELESTIN_CAPABILITIES, CELESTIN_RULES, CELESTIN_RESPONSE_FORMAT]
  }
}
