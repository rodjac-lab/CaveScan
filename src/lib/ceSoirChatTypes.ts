import type { FWIScores, SensoryPreferences } from '@/lib/questionnaire-profile'
import type { CelestinChatMessage } from '@/lib/celestinConversation'

export interface ChatMessage extends CelestinChatMessage {
  actionChips?: string[]
  profileCard?: { fwi: FWIScores; sensory: SensoryPreferences; marketingProfile: string }
  questionLabel?: string
}
