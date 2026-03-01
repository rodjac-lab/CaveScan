import CeSoirModule from '@/components/discover/CeSoirModule'
import ExploreCards from '@/components/discover/ExploreCards'

export default function Decouvrir() {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-4 pb-2">
        <p className="brand-text">CaveScan</p>
        <h1 className="font-serif text-[30px] font-bold leading-tight text-[var(--text-primary)]">Cheers!</h1>
        <p className="text-[13px] font-light text-[var(--text-secondary)]">
          Inspirations et accords pour votre cave
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-24 scrollbar-hide">
        <div className="space-y-6 mt-2">
          <CeSoirModule />
          <ExploreCards />
        </div>
      </div>
    </div>
  )
}
