import CeSoirModule from '@/components/discover/CeSoirModule'

export default function Decouvrir() {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <p className="brand-text">Celestin</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Celestin</h1>
        <p className="text-[13px] font-light text-[var(--text-secondary)]">
          Votre sommelier personnel
        </p>
      </div>

      {/* Chat fills remaining space */}
      <CeSoirModule />
    </div>
  )
}
