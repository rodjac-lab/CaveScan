export default function Settings() {
  return (
    <div className="flex-1 p-4">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <p className="mt-2 text-muted-foreground">
        Configurez votre application
      </p>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-card-foreground">Zones de stockage</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Gérez les zones de votre cave
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-card-foreground">Synchronisation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            État de la connexion Supabase
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="font-semibold text-card-foreground">À propos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            CaveScan v1.0.0
          </p>
        </div>
      </div>
    </div>
  )
}
