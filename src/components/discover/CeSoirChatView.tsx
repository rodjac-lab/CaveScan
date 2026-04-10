import type { ChangeEvent, ReactNode, RefObject } from 'react'
import type { RecommendationCard } from '@/lib/recommendationStore'
import type { WineActionData } from '@/lib/celestinConversation'
import type { ChatMessage } from '@/lib/ceSoirChatTypes'
import { CeSoirComposer } from './CeSoirComposer'
import {
  CelestinBubble,
  ExpandedRecommendationDialog,
  UserBubble,
} from './CeSoirBubbles'

export type { ChatMessage } from '@/lib/ceSoirChatTypes'

interface QuestionnaireProgress {
  current: number
  total: number
}

export interface CeSoirChatViewProps {
  qProgress: QuestionnaireProgress | null
  threadRef: RefObject<HTMLDivElement | null>
  messages: ChatMessage[]
  expandedCard: RecommendationCard | null
  onExpandedCardChange: (card: RecommendationCard | null) => void
  pendingPhoto: string | null
  onClearPendingPhoto: () => void
  photoInputRef: RefObject<HTMLInputElement | null>
  onPhotoSelect: (event: ChangeEvent<HTMLInputElement>) => void
  isQuestionnaireActive: boolean
  questionnaireInput: ReactNode
  queryInput: string
  onQueryInputChange: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onQuerySubmit: () => void
  isLoading: boolean
  onWineValidate: (action: WineActionData) => void
  onWineModify: (action: WineActionData) => void
  onChipClick: (chip: string) => void
}

function QuestionnaireProgressBar({ progress }: { progress: QuestionnaireProgress }) {
  return (
    <div className="flex-shrink-0 px-6 pt-2 pb-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[3px] rounded-full bg-[var(--border-color)] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)] transition-all duration-300"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
          {progress.current}/{progress.total}
        </span>
      </div>
    </div>
  )
}

export function CeSoirChatView({
  qProgress,
  threadRef,
  messages,
  expandedCard,
  onExpandedCardChange,
  pendingPhoto,
  onClearPendingPhoto,
  photoInputRef,
  onPhotoSelect,
  isQuestionnaireActive,
  questionnaireInput,
  queryInput,
  onQueryInputChange,
  textareaRef,
  onQuerySubmit,
  isLoading,
  onWineValidate,
  onWineModify,
  onChipClick,
}: CeSoirChatViewProps) {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      {qProgress && <QuestionnaireProgressBar progress={qProgress} />}

      <div ref={threadRef} className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-3 scrollbar-hide">
        <div className="space-y-5">
          {messages.map((message) =>
            message.role === 'celestin' ? (
              <CelestinBubble
                key={message.id}
                message={message}
                onCardTap={onExpandedCardChange}
                onWineValidate={onWineValidate}
                onWineModify={onWineModify}
                onChipClick={onChipClick}
              />
            ) : (
              <UserBubble key={message.id} message={message} />
            )
          )}
        </div>
      </div>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={onPhotoSelect}
        className="hidden"
      />

      <div className="flex-shrink-0 border-t border-[var(--border-color)] bg-[var(--background)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {isQuestionnaireActive ? (
          <div className="pt-1 pb-1">
            {questionnaireInput}
          </div>
        ) : (
          <CeSoirComposer
            pendingPhoto={pendingPhoto}
            onClearPendingPhoto={onClearPendingPhoto}
            photoInputRef={photoInputRef}
            queryInput={queryInput}
            onQueryInputChange={onQueryInputChange}
            textareaRef={textareaRef}
            onQuerySubmit={onQuerySubmit}
            isLoading={isLoading}
          />
        )}
      </div>

      <ExpandedRecommendationDialog
        card={expandedCard}
        onClose={() => onExpandedCardChange(null)}
      />
    </div>
  )
}
