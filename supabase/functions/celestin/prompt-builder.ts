import { WINE_CODEX } from "./wine-codex.ts"
import { CELESTIN_PERSONA } from "./persona.ts"
import { CELESTIN_RELATIONSHIP } from "./relationship.ts"
import { CELESTIN_CAPABILITIES } from "./capabilities.ts"
import { CELESTIN_RULES } from "./rules.ts"
import { CELESTIN_RESPONSE_FORMAT } from "./response-format.ts"

export function buildCelestinSystemPrompt(): string {
  return [
    WINE_CODEX.trim(),
    CELESTIN_PERSONA.trim(),
    CELESTIN_RELATIONSHIP.trim(),
    CELESTIN_CAPABILITIES.trim(),
    CELESTIN_RULES.trim(),
    CELESTIN_RESPONSE_FORMAT.trim(),
  ].join('\n\n')
}
