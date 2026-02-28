import { Card, CardContent } from '@/components/ui/card'

interface PhotoPreviewCardProps {
  photoPreview: string | null
  photoPreviewBack: string | null
  onZoom: (src: string, label?: string) => void
}

export function PhotoPreviewCard({ photoPreview, photoPreviewBack, onZoom }: PhotoPreviewCardProps) {
  if (!photoPreview && !photoPreviewBack) return null

  return (
    <Card>
      <CardContent className="p-2">
        <div className="flex gap-2">
          {photoPreview && (
            <div className="flex-1">
              <img
                src={photoPreview}
                alt="Étiquette avant"
                className="max-h-28 w-full rounded object-contain cursor-zoom-in"
                onClick={() => onZoom(photoPreview, 'Avant')}
              />
              <p className="text-xs text-center text-muted-foreground mt-1">Avant</p>
            </div>
          )}
          {photoPreviewBack && (
            <div className="flex-1">
              <img
                src={photoPreviewBack}
                alt="Étiquette arrière"
                className="max-h-28 w-full rounded object-contain cursor-zoom-in"
                onClick={() => onZoom(photoPreviewBack, 'Arriere')}
              />
              <p className="text-xs text-center text-muted-foreground mt-1">Arrière</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
