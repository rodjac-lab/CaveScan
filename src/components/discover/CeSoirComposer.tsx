import type { ChangeEvent, FormEvent, RefObject } from 'react'

interface CeSoirComposerProps {
  pendingPhoto: string | null
  onClearPendingPhoto: () => void
  photoInputRef: RefObject<HTMLInputElement | null>
  queryInput: string
  onQueryInputChange: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  onQuerySubmit: () => void
  isLoading: boolean
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PhotoPreview({ pendingPhoto, onClear }: { pendingPhoto: string; onClear: () => void }) {
  return (
    <div className="relative inline-block mb-2 ml-1">
      <img
        src={`data:image/jpeg;base64,${pendingPhoto}`}
        alt="Preview"
        className="h-20 rounded-lg border border-[var(--border-color)]"
      />
      <button
        type="button"
        onClick={onClear}
        className="absolute -top-1.5 -right-1.5 h-5 w-5 flex items-center justify-center rounded-full bg-[var(--text-primary)] text-[var(--background)] shadow-sm"
      >
        <XIcon />
      </button>
    </div>
  )
}

export function CeSoirComposer({
  pendingPhoto,
  onClearPendingPhoto,
  photoInputRef,
  queryInput,
  onQueryInputChange,
  textareaRef,
  onQuerySubmit,
  isLoading,
}: CeSoirComposerProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onQuerySubmit()
  }

  function handleInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onQueryInputChange(event.target.value)
    event.target.style.height = 'auto'
    event.target.style.height = `${event.target.scrollHeight}px`
  }

  return (
    <div>
      {pendingPhoto && (
        <PhotoPreview
          pendingPhoto={pendingPhoto}
          onClear={onClearPendingPhoto}
        />
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isLoading}
            className="absolute left-2.5 top-2.5 h-7 w-7 flex items-center justify-center rounded-full bg-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
          >
            <PlusIcon />
          </button>
          <textarea
            ref={textareaRef}
            value={queryInput}
            onChange={handleInputChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onQuerySubmit()
              }
            }}
            placeholder={pendingPhoto ? "Décris ce que tu veux faire..." : "Poulet rôti, envie de bulles..."}
            enterKeyHint="send"
            rows={1}
            className="w-full min-h-[44px] rounded-[20px] border border-[var(--border-color)] bg-[var(--bg-card)] pl-11 pr-4 py-3 text-[14px] placeholder:text-[var(--text-muted)] placeholder:italic resize-none leading-tight overflow-hidden"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-shrink-0 h-11 w-11 flex items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-light)] text-white shadow-sm disabled:opacity-50"
        >
          <SendIcon />
        </button>
      </form>
    </div>
  )
}
