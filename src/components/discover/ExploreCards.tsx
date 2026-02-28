interface RegionCard {
  id: string
  name: string
  gradient: string
  description: string
  stats: string
}

const REGIONS: RegionCard[] = [
  {
    id: 'bourgogne',
    name: 'Bourgogne',
    gradient: 'from-[#722F37] to-[#4a1e24]',
    description: 'Terre du Pinot Noir et du Chardonnay. Des climats class\u00e9s au patrimoine mondial, o\u00f9 chaque parcelle raconte une histoire.',
    stats: '0 bouteilles en cave',
  },
  {
    id: 'champagne',
    name: 'Champagne',
    gradient: 'from-[#DAC17C] to-[#b8960a]',
    description: 'Le vignoble le plus c\u00e9l\u00e8bre du monde. Des bulles fines et \u00e9l\u00e9gantes, symboles de f\u00eate et d\'excellence.',
    stats: '0 bouteilles en cave',
  },
  {
    id: 'bordeaux',
    name: 'Bordeaux',
    gradient: 'from-[#8B0000] to-[#5c0000]',
    description: 'Des grands crus class\u00e9s aux petits ch\u00e2teaux, Bordeaux offre une diversit\u00e9 incomparable de rouges et de blancs.',
    stats: '0 bouteilles en cave',
  },
  {
    id: 'rhone',
    name: 'Vall\u00e9e du Rh\u00f4ne',
    gradient: 'from-[#6B3A2A] to-[#3d2118]',
    description: 'Syrah au nord, Grenache au sud. Des vins g\u00e9n\u00e9reux, \u00e9pic\u00e9s et solaires, de Ch\u00e2teauneuf \u00e0 C\u00f4te-R\u00f4tie.',
    stats: '0 bouteilles en cave',
  },
  {
    id: 'loire',
    name: 'Val de Loire',
    gradient: 'from-[#5B8C5A] to-[#3a5c39]',
    description: 'Le jardin de la France. Chenin, Sauvignon, Cabernet Franc : une palette fra\u00eeche et \u00e9l\u00e9gante.',
    stats: '0 bouteilles en cave',
  },
]

export default function ExploreCards() {
  return (
    <div>
      {/* Section title */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex-1 h-px bg-[var(--border-color)]" />
        <span className="section-divider-label">Explorer</span>
        <div className="flex-1 h-px bg-[var(--border-color)]" />
      </div>

      {/* Region cards */}
      <div className="space-y-3">
        {REGIONS.map((region) => (
          <div
            key={region.id}
            className="rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-color)] card-shadow overflow-hidden"
          >
            {/* Gradient banner */}
            <div className={`h-[72px] bg-gradient-to-r ${region.gradient} flex items-end px-4 pb-2`}>
              <h3 className="font-serif text-[18px] font-bold text-white drop-shadow-sm">{region.name}</h3>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{region.description}</p>
              <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium">{region.stats}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
