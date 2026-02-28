import { useState } from 'react'
import { Check, SkipForward, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Autocomplete } from '@/components/Autocomplete'
import { BatchNavHeader } from '@/components/BatchNavHeader'
import { WINE_COLORS, type WineColor, type BottleWithZone } from '@/lib/types'
import type { BatchItem } from '@/lib/batchSessionStore'

interface BatchTastingItemFormProps {
  item: BatchItem
  currentIndex: number
  totalItems: number
  allItems: BatchItem[]
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
  onNavigate: (index: number) => void
  onSave: (item: BatchItem) => void
  onSkip: () => void
  onSelectAlternative: (item: BatchItem, bottle: BottleWithZone) => void
  onUpdateExtraction: (itemId: string, field: string, value: string) => void
}

const COLOR_BAR_STYLES: Record<WineColor, string> = {
  rouge: 'bg-[var(--red-wine)]',
  blanc: 'bg-[var(--white-wine)]',
  rose: 'bg-[var(--rose-wine)]',
  bulles: 'bg-[var(--champagne)]',
}

export function BatchTastingItemForm({
  item,
  currentIndex,
  totalItems,
  allItems,
  domainesSuggestions,
  appellationsSuggestions,
  onNavigate,
  onSave,
  onSkip,
  onSelectAlternative,
  onUpdateExtraction,
}: BatchTastingItemFormProps) {
  const [showAlternatives, setShowAlternatives] = useState(false)

  const isSaved = item.saved

  return (
    <div className="space-y-4">
      <BatchNavHeader
        currentIndex={currentIndex}
        totalItems={totalItems}
        itemStatuses={allItems.map((it) => it.saved)}
        onNavigate={onNavigate}
      />

      {/* Photo preview */}
      <div className="flex justify-center">
        <img
          src={item.photoUri}
          alt="Etiquette"
          className="max-h-32 rounded-lg object-contain"
        />
      </div>

      {/* Layout depends on matchType */}
      {item.matchType === 'in_cave' && item.primaryMatch ? (
        <InCaveLayout
          item={item}
          showAlternatives={showAlternatives}
          onToggleAlternatives={() => setShowAlternatives((v) => !v)}
          onSelectAlternative={onSelectAlternative}
        />
      ) : (
        <EditableLayout
          item={item}
          domainesSuggestions={domainesSuggestions}
          appellationsSuggestions={appellationsSuggestions}
          onUpdateExtraction={onUpdateExtraction}
          isUnresolved={item.matchType === 'unresolved'}
        />
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onSkip}
          disabled={isSaved}
        >
          <SkipForward className="mr-2 h-4 w-4" />
          Passer
        </Button>

        {isSaved ? (
          <Button className="flex-1 bg-green-600 hover:bg-green-600" disabled>
            <Check className="mr-2 h-4 w-4" />
            Deja enregistree
          </Button>
        ) : item.matchType === 'in_cave' ? (
          <Button
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            onClick={() => onSave(item)}
          >
            <Check className="mr-2 h-4 w-4" />
            Sortir de cave
          </Button>
        ) : (
          <Button
            className="flex-1 bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            onClick={() => onSave(item)}
          >
            <Check className="mr-2 h-4 w-4" />
            Enregistrer
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── In-cave layout: matched wine card ── */

function InCaveLayout({
  item,
  showAlternatives,
  onToggleAlternatives,
  onSelectAlternative,
}: {
  item: BatchItem
  showAlternatives: boolean
  onToggleAlternatives: () => void
  onSelectAlternative: (item: BatchItem, bottle: BottleWithZone) => void
}) {
  const match = item.primaryMatch!

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-3.5 card-shadow">
        <div className="flex items-start gap-3">
          <div
            className={`h-10 w-[3px] flex-shrink-0 rounded-sm ${
              match.couleur ? COLOR_BAR_STYLES[match.couleur] : 'bg-[var(--text-muted)]'
            }`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              {match.domaine || match.appellation || 'Vin'}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {[match.appellation, match.millesime].filter(Boolean).join(' · ')}
            </p>
            {match.zone && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {match.zone.name}
                {match.shelf ? ` · ${match.shelf}` : ''}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            En cave
          </span>
        </div>
      </div>

      {item.alternatives.length > 0 && (
        <button
          type="button"
          onClick={onToggleAlternatives}
          className="flex w-full items-center justify-center gap-1 text-[12px] font-medium text-[var(--accent)]"
        >
          Pas cette bouteille ?
          {showAlternatives ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      )}

      {showAlternatives && (
        <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-[var(--border-color)] bg-[var(--bg-card)] p-2">
          {item.alternatives.map((bottle) => (
            <button
              key={bottle.id}
              type="button"
              onClick={() => onSelectAlternative(item, bottle)}
              className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] bg-[var(--bg)] p-2.5 text-left transition-colors hover:bg-[var(--accent-bg)]"
            >
              <div
                className={`h-8 w-[3px] rounded-sm ${
                  bottle.couleur ? COLOR_BAR_STYLES[bottle.couleur] : 'bg-[var(--text-muted)]'
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                  {bottle.domaine || bottle.appellation || 'Vin'}
                </p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">
                  {[bottle.appellation, bottle.millesime].filter(Boolean).join(' · ')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Editable layout: for not_in_cave and unresolved ── */

function EditableLayout({
  item,
  domainesSuggestions,
  appellationsSuggestions,
  onUpdateExtraction,
  isUnresolved,
}: {
  item: BatchItem
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
  onUpdateExtraction: (itemId: string, field: string, value: string) => void
  isUnresolved: boolean
}) {
  const extraction = item.extraction

  return (
    <div className="space-y-3">
      {isUnresolved && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {item.error || 'Vin non identifie — remplissez les champs manuellement'}
        </div>
      )}

      {!isUnresolved && (
        <div className="flex items-center gap-1.5 px-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
          <span className="text-[11px] font-medium text-[var(--text-muted)]">Hors cave</span>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <Label htmlFor={`domaine-${item.id}`}>Domaine / Producteur</Label>
          <Autocomplete
            id={`domaine-${item.id}`}
            value={extraction?.domaine || ''}
            onChange={(value) => onUpdateExtraction(item.id, 'domaine', value)}
            suggestions={domainesSuggestions}
            placeholder="ex: Chartogne Taillet"
          />
        </div>

        <div>
          <Label htmlFor={`cuvee-${item.id}`}>Cuvee</Label>
          <Input
            id={`cuvee-${item.id}`}
            value={extraction?.cuvee || ''}
            onChange={(e) => onUpdateExtraction(item.id, 'cuvee', e.target.value)}
            placeholder="ex: Orizeaux"
          />
        </div>

        <div>
          <Label htmlFor={`appellation-${item.id}`}>Appellation</Label>
          <Autocomplete
            id={`appellation-${item.id}`}
            value={extraction?.appellation || ''}
            onChange={(value) => onUpdateExtraction(item.id, 'appellation', value)}
            suggestions={appellationsSuggestions}
            placeholder="ex: Margaux"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor={`millesime-${item.id}`}>Millesime</Label>
            <Input
              id={`millesime-${item.id}`}
              inputMode="numeric"
              pattern="[0-9]*"
              value={extraction?.millesime?.toString() || ''}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                onUpdateExtraction(item.id, 'millesime', val)
              }}
              placeholder="ex: 2020"
              maxLength={4}
            />
          </div>

          <div>
            <Label htmlFor={`couleur-${item.id}`}>Couleur</Label>
            <Select
              value={extraction?.couleur || ''}
              onValueChange={(v) => onUpdateExtraction(item.id, 'couleur', v)}
            >
              <SelectTrigger id={`couleur-${item.id}`}>
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {WINE_COLORS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
