import { Check, Loader2, AlertCircle, Clock } from 'lucide-react'

export type ExtractionStatus = 'pending' | 'extracting' | 'extracted' | 'error'

export interface BatchProgressItem {
  id: string
  photoPreview: string | null
  status: ExtractionStatus
  error?: string
  domaine?: string
  appellation?: string
}

interface BatchProgressProps {
  items: BatchProgressItem[]
  currentIndex: number
}

const statusConfig: Record<ExtractionStatus, { icon: React.ReactNode; label: string; className: string }> = {
  pending: {
    icon: <Clock className="h-4 w-4" />,
    label: 'En attente',
    className: 'text-muted-foreground',
  },
  extracting: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'En cours...',
    className: 'text-[var(--accent)]',
  },
  extracted: {
    icon: <Check className="h-4 w-4" />,
    label: 'Extraite',
    className: 'text-green-600',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    label: 'Erreur',
    className: 'text-destructive',
  },
}

export function BatchProgress({ items, currentIndex }: BatchProgressProps) {
  const completedCount = items.filter(item => item.status === 'extracted' || item.status === 'error').length

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
          Analyse des étiquettes...
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Progression: {completedCount}/{items.length}
        </p>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => {
          const config = statusConfig[item.status]
          const isCurrent = index === currentIndex
          const hasWineInfo = item.status === 'extracted' && (item.domaine || item.appellation)

          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                isCurrent ? 'bg-[var(--accent)]/10' : ''
              }`}
            >
              {item.photoPreview ? (
                <img
                  src={item.photoPreview}
                  alt={`Photo ${index + 1}`}
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded bg-[var(--accent-bg)] flex items-center justify-center text-[var(--text-muted)] text-xs font-medium">
                  {index + 1}
                </div>
              )}
              <div className="flex-1 min-w-0">
                {hasWineInfo ? (
                  <>
                    <p className="text-sm font-medium truncate">{item.domaine || 'Domaine inconnu'}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{item.appellation}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium truncate">Photo {index + 1}</p>
                    {item.error && (
                      <p className="text-xs text-destructive truncate">{item.error}</p>
                    )}
                  </>
                )}
              </div>
              <div className={`flex items-center gap-1.5 flex-shrink-0 ${config.className}`}>
                {config.icon}
                <span className="text-xs">{config.label}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
