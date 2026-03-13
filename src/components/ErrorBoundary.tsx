import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-[var(--text-primary)] font-serif text-lg">
            Quelque chose s'est mal passé
          </p>
          <p className="text-[var(--text-secondary)] text-sm">
            Essayez de recharger la page.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
            className="rounded-full bg-[var(--accent)] px-6 py-2 text-sm font-semibold text-white"
          >
            Recharger
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
