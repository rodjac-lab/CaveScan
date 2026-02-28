import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { type BottleWithZone } from '@/lib/types'
import { track } from '@/lib/track'

interface BottleDeleteDialogProps {
  bottle: BottleWithZone
  open: boolean
  onClose: () => void
  onDeleted: () => Promise<void>
}

export function BottleDeleteDialog({ bottle, open, onClose, onDeleted }: BottleDeleteDialogProps) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      if ((bottle.quantity ?? 1) > 1) {
        const { error } = await supabase
          .from('bottles')
          .update({ quantity: (bottle.quantity ?? 1) - 1 })
          .eq('id', bottle.id)
        if (error) throw error
        track('bottle_deleted')
        onClose()
        await onDeleted()
      } else {
        const { error } = await supabase
          .from('bottles')
          .delete()
          .eq('id', bottle.id)
        if (error) throw error
        track('bottle_deleted')
        onClose()
        navigate('/cave', { replace: true })
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
    setDeleting(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-sm" showCloseButton={false}>
        <div className="flex flex-col gap-4 p-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {(bottle.quantity ?? 1) > 1 ? 'Retirer une bouteille ?' : 'Supprimer cette bouteille ?'}
            </h3>
            <p className="text-sm text-[var(--text-muted)]">
              {(bottle.quantity ?? 1) > 1
                ? `La quantité de ${bottle.domaine || bottle.appellation || 'cette bouteille'}${bottle.millesime ? ` ${bottle.millesime}` : ''} passera de ${bottle.quantity} à ${(bottle.quantity ?? 1) - 1}.`
                : `${bottle.domaine || bottle.appellation || 'Cette bouteille'}${bottle.millesime ? ` ${bottle.millesime}` : ''} sera définitivement supprimée de votre cave.`}
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {(bottle.quantity ?? 1) > 1 ? 'Retirer' : 'Supprimer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
