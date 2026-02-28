import { Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface QuantitySelectorProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label?: string
}

export function QuantitySelector({ value, onChange, min = 1, max = 12, label = 'Quantité' }: QuantitySelectorProps) {
  return (
    <div className="pt-2 border-t">
      <Label>{label}</Label>
      <div className="flex items-center gap-3 mt-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="text-xl font-semibold w-8 text-center">{value}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Plus className="h-4 w-4" />
        </Button>
        {value > 1 && (
          <span className="text-sm text-muted-foreground">
            bouteilles
          </span>
        )}
      </div>
    </div>
  )
}
