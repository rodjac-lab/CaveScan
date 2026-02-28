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
import { WINE_COLORS, type WineColor } from '@/lib/types'

interface WineFormFieldsProps {
  domaine: string
  cuvee: string
  appellation: string
  millesime: string
  couleur: WineColor | ''
  onDomaineChange: (v: string) => void
  onCuveeChange: (v: string) => void
  onAppellationChange: (v: string) => void
  onMillesimeChange: (v: string) => void
  onCouleurChange: (v: WineColor) => void
  domainesSuggestions: string[]
  appellationsSuggestions: string[]
}

export function WineFormFields({
  domaine,
  cuvee,
  appellation,
  millesime,
  couleur,
  onDomaineChange,
  onCuveeChange,
  onAppellationChange,
  onMillesimeChange,
  onCouleurChange,
  domainesSuggestions,
  appellationsSuggestions,
}: WineFormFieldsProps) {
  const handleMillesimeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
    onMillesimeChange(val)
  }

  return (
    <>
      <div>
        <Label htmlFor="domaine">Domaine / Producteur</Label>
        <Autocomplete
          id="domaine"
          value={domaine}
          onChange={onDomaineChange}
          suggestions={domainesSuggestions}
          placeholder="ex: Chartogne Taillet"
        />
      </div>

      <div>
        <Label htmlFor="cuvee">Cuvée</Label>
        <Input
          id="cuvee"
          value={cuvee}
          onChange={(e) => onCuveeChange(e.target.value)}
          placeholder="ex: Orizeaux"
        />
      </div>

      <div>
        <Label htmlFor="appellation">Appellation</Label>
        <Autocomplete
          id="appellation"
          value={appellation}
          onChange={onAppellationChange}
          suggestions={appellationsSuggestions}
          placeholder="ex: Margaux"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="millesime">Millésime</Label>
          <Input
            id="millesime"
            inputMode="numeric"
            pattern="[0-9]*"
            value={millesime}
            onChange={handleMillesimeInput}
            placeholder="ex: 2020"
            maxLength={4}
          />
        </div>

        <div>
          <Label htmlFor="couleur">Couleur</Label>
          <Select value={couleur} onValueChange={(v) => onCouleurChange(v as WineColor)}>
            <SelectTrigger id="couleur">
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
    </>
  )
}
