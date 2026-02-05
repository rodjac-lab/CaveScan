import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Edit2, Trash2, Loader2, MapPin, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useZones } from '@/hooks/useZones'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import type { Zone } from '@/lib/types'

export default function Settings() {
  const navigate = useNavigate()
  const { zones, loading, error, refetch } = useZones()
  const { session, isAnonymous, signOut } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await signOut()
    navigate('/login')
  }
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [isAddingZone, setIsAddingZone] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [zoneDescription, setZoneDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleOpenAdd = () => {
    setZoneName('')
    setZoneDescription('')
    setIsAddingZone(true)
  }

  const handleOpenEdit = (zone: Zone) => {
    setEditingZone(zone)
    setZoneName(zone.name)
    setZoneDescription(zone.description || '')
  }

  const handleClose = () => {
    setIsAddingZone(false)
    setEditingZone(null)
    setZoneName('')
    setZoneDescription('')
  }

  const handleSave = async () => {
    if (!zoneName.trim()) return

    setSaving(true)

    if (editingZone) {
      // Update existing zone
      const { error } = await supabase
        .from('zones')
        .update({
          name: zoneName.trim(),
          description: zoneDescription.trim() || null,
        })
        .eq('id', editingZone.id)

      if (!error) {
        await refetch()
        handleClose()
      }
    } else {
      // Create new zone
      const { error } = await supabase.from('zones').insert({
        name: zoneName.trim(),
        description: zoneDescription.trim() || null,
        position: zones.length,
      })

      if (!error) {
        await refetch()
        handleClose()
      }
    }

    setSaving(false)
  }

  const handleDelete = async (zoneId: string) => {
    if (!confirm('Supprimer cette zone ? Les bouteilles associées ne seront pas supprimées.')) {
      return
    }

    setDeleting(zoneId)

    const { error } = await supabase.from('zones').delete().eq('id', zoneId)

    if (!error) {
      await refetch()
    }

    setDeleting(null)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Page Header */}
      <div className="mb-6">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Réglages</h1>
      </div>

      {/* Account section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <User className="h-5 w-5" />
          Compte
        </h2>
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Connecte en tant que</p>
              <p className="font-medium">
                {isAnonymous ? 'Utilisateur anonyme' : session?.user?.email || 'Non connecte'}
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Se deconnecter
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Zones section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Zones de stockage
          </h2>
          <Button size="sm" onClick={handleOpenAdd}>
            <Plus className="h-4 w-4 mr-1" />
            Ajouter
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-destructive">{error}</p>
        ) : zones.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Aucune zone configurée
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {zones.map((zone) => (
              <Card key={zone.id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{zone.name}</p>
                    {zone.description && (
                      <p className="text-sm text-muted-foreground">{zone.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleOpenEdit(zone)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(zone.id)}
                      disabled={deleting === zone.id}
                    >
                      {deleting === zone.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* About section */}
      <section>
        <Card>
          <CardContent className="p-4">
            <h2 className="font-semibold mb-2">À propos</h2>
            <p className="text-sm text-muted-foreground">
              CaveScan v1.0.0
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Gestion de cave à vin avec reconnaissance d'étiquettes
            </p>
          </CardContent>
        </Card>
      </section>


      {/* Add/Edit Zone Dialog */}
      <Dialog open={isAddingZone || !!editingZone} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingZone ? 'Modifier la zone' : 'Nouvelle zone'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="zone-name">Nom</Label>
              <Input
                id="zone-name"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="ex: Cave principale"
              />
            </div>
            <div>
              <Label htmlFor="zone-desc">Description (optionnel)</Label>
              <Input
                id="zone-desc"
                value={zoneDescription}
                onChange={(e) => setZoneDescription(e.target.value)}
                placeholder="ex: Rouges de garde"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={!zoneName.trim() || saving}
              className="bg-[var(--accent)] hover:bg-[var(--accent-light)]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingZone ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
