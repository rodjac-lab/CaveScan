import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

type Props = {
  title: string
  icon?: string
  subtitle?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function DebugSection({ title, icon, subtitle, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="mb-6">
      <button
        onClick={() => setOpen((value) => !value)}
        className="mb-3 flex w-full items-center justify-between rounded-[10px] border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
          )}
          <span className="text-[14px] font-semibold text-[var(--text-primary)]">
            {icon ? `${icon} ` : ''}{title}
          </span>
        </div>
        {subtitle && <span className="text-[11px] text-[var(--text-muted)]">{subtitle}</span>}
      </button>

      {open && <div className="space-y-6">{children}</div>}
    </section>
  )
}
