import { useParams } from 'react-router-dom'

export default function BottlePage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="flex-1 p-4">
      <h1 className="text-2xl font-bold">Détails de la bouteille</h1>
      <p className="mt-2 text-muted-foreground">
        ID: {id}
      </p>

      <div className="mt-6 rounded-lg border bg-card p-4">
        <p className="text-card-foreground">
          Les détails de la bouteille seront affichés ici.
        </p>
      </div>
    </div>
  )
}
