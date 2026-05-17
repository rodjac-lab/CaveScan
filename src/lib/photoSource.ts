export type PhotoSource = 'camera' | 'gallery'

export function uploadFailureMessage(source: PhotoSource | null | undefined, flow: 'cellar' | 'tasting'): string {
  if (source === 'gallery') {
    return flow === 'cellar'
      ? "La fiche est prête, mais la photo n'a pas pu être enregistrée. Tu peux réessayer, ou appuyer à nouveau sur Enregistrer pour continuer sans photo."
      : "La fiche de dégustation est prête, mais la photo n'a pas pu être enregistrée. Tu peux réessayer, ou appuyer à nouveau pour continuer sans photo."
  }

  return flow === 'cellar'
    ? "La photo prise dans l'app n'a pas pu être enregistrée. Réessaie l'enregistrement avant de continuer, sinon la photo risque d'être perdue."
    : "La photo prise dans l'app n'a pas pu être enregistrée. Réessaie avant de créer la dégustation, sinon la photo risque d'être perdue."
}
